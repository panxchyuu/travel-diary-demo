import { CURRENCIES, LEDGER_CATEGORIES, PAY_METHODS, normalizeScope, matchesScope, constrainExpenses, validateExpenses } from './agent-core.mjs';

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nextId = () => globalThis.crypto.randomUUID();
export const expenseIdentity = expense => JSON.stringify([expense.date, Number(expense.amount), expense.currency || 'CNY', (expense.trip || '').trim(), (expense.note || '').trim().toLocaleLowerCase().replace(/\s+/g, '')]);
const snapshotKey = expense => JSON.stringify([expense.id, expenseIdentity(expense), expense.category, expense.payMethod || '']);

// One explicit price in the source takes precedence over inferred quantity math.
// Multiple prices remain for review; missing dates never erase known prices.
function explicitPrice(source) {
  if (typeof source !== 'string') return null;
  const units = {刀:'USD',美刀:'USD',美金:'USD',美元:'USD',拉菲亚:'MVR',拉非亚:'MVR',人民币:'CNY',元:'CNY',RF:'MVR'};
  const pattern = /(?:((?:US|HK|AU|A|CA|C)?\$|[¥￥])\s*(\d[\d,]*(?:\.\d+)?|\.\d+)|(\d[\d,]*(?:\.\d+)?|\.\d+)\s*(人民币|拉菲亚|拉非亚|美刀|美金|美元|刀|元|CNY|USD|MVR|Rf))/gi;
  const normalized=source.normalize('NFKC');
  const matches=[...normalized.matchAll(pattern)];
  if(matches.some(match=>/[\d.,+-]/.test(normalized[match.index-1]||'')||(match[1]&&/[A-Za-z]/.test(normalized[match.index-1]||''))||! /^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(match[2]||match[3])))return null;
  const symbols={'$':'USD','US$':'USD','HK$':'HKD','A$':'AUD','AU$':'AUD','C$':'CAD','CA$':'CAD','¥':'CNY','￥':'CNY'};
  const prices = matches.map(match => ({amount:Number((match[2]||match[3]).replaceAll(',','')),currency:match[1]?symbols[match[1].toUpperCase()]:(units[match[4]]||units[match[4].toUpperCase()]||match[4].toUpperCase())}));
  return prices.length===1&&prices[0].amount>0?prices[0]:null;
}

export function reconcileExpenseDates(entries, messages, today) {
  const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const users=(messages||[]).filter(item=>item.role==='user'&&typeof (item.content??item.text)==='string').map(item=>item.content??item.text);
  let best=null;
  for(let index=users.length-1;index>=0;index--){
    const text=users[index],normalized=compact(text);
    const score=entries.filter(item=>item.sourceText&&normalized.includes(compact(item.sourceText))).length;
    if(!best||score>best.score)best={text,normalized,score,index};
  }
  if(!best||best.score<Math.max(1,Math.ceil(entries.length/2)))return entries;
  // A later explicit date correction takes precedence over the earlier list.
  if(users.slice(best.index+1).some(text=>/(今天|昨天|前天|\d{1,2}月\d{1,2}|\d{1,2}[./-]\d{1,2})/.test(text)))return entries;
  const headers=[];
  const pattern=/(?:^|[\n\r;；])\s*(?:(\d{4})[年./-])?(\d{1,2})[月./-](\d{1,2})(?:日|(?=\s|[：:]|$))/g;
  for(const match of best.text.matchAll(pattern)){
    const date=`${match[1]||String(today).slice(0,4)}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
    if(validDate(date))headers.push({position:compact(best.text.slice(0,match.index+match[0].search(/\d/))).length,date});
  }
  if(!headers.length)return entries;
  let cursor=0;
  return entries.map(item=>{
    const token=compact(item.sourceText);if(!token)return item;
    const position=best.normalized.indexOf(token,cursor);if(position<0)return item;
    cursor=position+token.length;
    const inline=item.sourceText.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/)
      ||item.sourceText.match(/(?:^|[（(\s])(?:(\d{4})[-/.])?(\d{1,2})[./-](\d{1,2})(?=[）)\s]|$)/);
    if(inline){const date=`${inline[1]||String(today).slice(0,4)}-${inline[2].padStart(2,'0')}-${inline[3].padStart(2,'0')}`;if(validDate(date))return {...item,date};}
    const header=headers.findLast(value=>value.position<=position);
    return {...item,date:header?.date||null};
  });
}

function destinationFor(trip, scope) {
  const selected = normalizeScope(scope);
  const requested = clean(trip, 80);
  if (requested === '__all__') throw new Error('请选择具体旅程或未分组。');
  if (selected !== '__all__') {
    if (requested && requested !== selected && !(selected === '__none__' && requested === '未分组')) throw new Error('当前旅程与清单归属不同，请先切换旅程。');
    return selected;
  }
  return requested === '未分组' ? '__none__' : requested || null;
}

export function expenseDraftSummary(draft) {
  const pending = draft.expenses.filter(item => !item.savedId);
  const missing = item => !draft.destination || !item.date || item.amount == null || !item.currency;
  return {
    proposedCount: draft.expenses.length,
    readyCount: pending.filter(item => !missing(item) && !item.duplicate).length,
    incompleteCount: pending.filter(missing).length,
    duplicateCount: pending.filter(item => item.duplicate).length,
    savedCount: draft.expenses.filter(item => item.savedId).length,
    requiresReview: pending.length > 0,
  };
}

export function prepareExpenseDraft(args, scope, existing = [], id = nextId()) {
  if (!Array.isArray(args?.expenses) || args.expenses.length < 1 || args.expenses.length > 100) throw new Error('一次可核对 1 到 100 笔消费。');
  const destination = destinationFor(args.trip, scope);
  const trip = destination === '__none__' ? '' : destination || '';
  const seen = new Set(existing.map(expenseIdentity));
  const expenses = args.expenses.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`第 ${index + 1} 笔格式无效。`);
    const date = entry.date || null;
    if (date && !validDate(date)) throw new Error(`第 ${index + 1} 笔日期无效。`);
    const price = explicitPrice(entry.sourceText);
    const amount = price ? price.amount : entry.amount == null ? null : Number(entry.amount);
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000)) throw new Error(`第 ${index + 1} 笔金额无效。`);
    const currency = price ? price.currency : entry.currency || null;
    if (currency && !CURRENCIES.includes(currency)) throw new Error(`第 ${index + 1} 笔币种无效。`);
    const category = entry.category || '其他';
    if (!LEDGER_CATEGORIES.includes(category)) throw new Error(`第 ${index + 1} 笔分类无效。`);
    const payMethod = entry.payMethod || '';
    if (!PAY_METHODS.includes(payMethod)) throw new Error(`第 ${index + 1} 笔支付方式无效。`);
    const sourceText=clean(entry.sourceText,300);
    const modelNote=clean(entry.note,120);
    const note=(!modelNote||/用途未注明|用途不详|用途待补/.test(modelNote))&&sourceText?sourceText.slice(0,120):modelNote||category;
    const item = { date, amount, currency, category, payMethod, trip, note, sourceText };
    const key = expenseIdentity(item);
    item.duplicate = seen.has(key);
    seen.add(key);
    return item;
  });
  const draft = { id, kind: 'expense_draft', scope: normalizeScope(scope), destination, trip, status: 'pending', expenses, addedIds: [] };
  const summary = expenseDraftSummary(draft);
  return Object.assign(draft, { readyCount: summary.readyCount, missingCount: summary.incompleteCount });
}

export function commitExpenseDraft(db, draft, selections, options = {}) {
  if (!draft || draft.kind !== 'expense_draft' || draft.status === 'cancelled') throw new Error('这张核对卡已失效。');
  if (!Array.isArray(selections) || !selections.length) throw new Error('请先勾选要入账的消费。');
  const destination = destinationFor(options.trip ?? draft.destination, draft.scope);
  if (!destination) throw new Error('请先选择清单所属旅程，或填写“未分组”。');
  const trip = destination === '__none__' ? '' : destination;
  const seen = new Set();
  const pending = selections.flatMap(edit => {
    if (!Number.isInteger(edit.index) || !draft.expenses[edit.index] || seen.has(edit.index)) throw new Error('消费选择无效，请重新核对。');
    seen.add(edit.index);
    const original = draft.expenses[edit.index];
    if (original.savedId) return [];
    const value = { ...original, ...edit, trip };
    if (!value.date || !validDate(value.date)) throw new Error(`第 ${edit.index + 1} 笔需要补充有效日期。`);
    if (!value.currency) throw new Error(`第 ${edit.index + 1} 笔需要选择币种。`);
    const expense = validateExpenses([value])[0];
    if (!original.duplicate && db.expenses.some(row => expenseIdentity(row) === expenseIdentity(expense))) throw new Error('核对期间已有相同账目入账，请重新检查，避免重复。');
    return [{ index: edit.index, expense }];
  });
  const idFactory = options.idFactory || nextId;
  const ids = new Set(db.expenses.map(item => item.id));
  const added = pending.map(item => {
    const id = idFactory();
    if (ids.has(id)) throw new Error('账单编号冲突，请重试。');
    ids.add(id);
    return { ...item.expense, id, via: 'ai-reviewed', createdAt: options.now ?? Date.now(), sourceDraftId: draft.id };
  });
  db.expenses.unshift(...added);
  pending.forEach((item, index) => { draft.expenses[item.index] = { ...draft.expenses[item.index], ...item.expense, savedId: added[index].id }; });
  draft.destination = destination; draft.trip = trip;
  draft.addedIds = [...(draft.addedIds || []), ...added.map(item => item.id)];
  draft.status = draft.expenses.every(item => item.savedId) ? 'saved' : draft.addedIds.length ? 'partial' : 'pending';
  return { addedCount: added.length, expenses: added, remainingCount: draft.expenses.filter(item => !item.savedId).length };
}

export function validateDeletionRequest(args) {
  if (!Array.isArray(args?.ids) || args.ids.length < 1 || args.ids.length > 50 || args.ids.some(id => typeof id !== 'string' || !id || id.length > 100)) throw new Error('请选择 1 到 50 笔明确的账单。');
  if (new Set(args.ids).size !== args.ids.length) throw new Error('账单选择重复。');
  return { ids: args.ids.slice(), reason: clean(args.reason, 120) || '删除账单' };
}

export function prepareExpenseDeletion(expenses, args, scope, id = nextId()) {
  const request = validateDeletionRequest(args);
  const snapshots = request.ids.map(id => {
    const expense = expenses.find(item => item.id === id && matchesScope(item, scope));
    if (!expense) throw new Error('账单不存在或不属于当前旅程，请重新查询。');
    return { id, key: snapshotKey(expense), expense: { ...expense } };
  });
  return { id, kind: 'deletion_draft', status: 'pending', scope: normalizeScope(scope), reason: request.reason, snapshots };
}

export function commitExpenseDeletion(db, proposal, selectedIds, options = {}) {
  if (!proposal || proposal.kind !== 'deletion_draft' || proposal.status === 'cancelled') throw new Error('删除请求已取消或失效。');
  if (proposal.status === 'deleted' || proposal.status === 'restored') return { deletedCount: 0, deletionId: proposal.id };
  if (!Array.isArray(selectedIds) || !selectedIds.length) throw new Error('请先选择要删除的账单。');
  if (new Set(selectedIds).size !== selectedIds.length) throw new Error('账单选择重复。');
  const selected = selectedIds.map(id => {
    const snapshot = proposal.snapshots.find(item => item.id === id);
    const current = db.expenses.find(item => item.id === id && matchesScope(item, proposal.scope));
    if (!snapshot || !current || snapshotKey(current) !== snapshot.key) throw new Error('账单已发生变化或已删除，请重新查询后确认。');
    return { ...current };
  });
  const toDelete = new Set(selectedIds);
  db.expenses = db.expenses.filter(item => !toDelete.has(item.id));
  if (!Array.isArray(db.deletedExpenses)) db.deletedExpenses = [];
  db.deletedExpenses.push({ id: proposal.id, status: 'deleted', scope: proposal.scope, deletedAt: options.now ?? Date.now(), expenses: selected });
  proposal.status = 'deleted'; proposal.deletedIds = selectedIds.slice();
  return { deletedCount: selected.length, deletionId: proposal.id, expenses: selected };
}

export function undoExpenseDeletion(db, deletionId) {
  const deletion = (db.deletedExpenses || []).find(item => item.id === deletionId);
  if (!deletion) throw new Error('找不到这次删除记录。');
  if (deletion.status === 'restored') return { restoredCount: 0 };
  if (deletion.expenses.some(item => db.expenses.some(row => row.id === item.id))) throw new Error('同编号账单已存在，没有覆盖当前记录。');
  db.expenses.unshift(...deletion.expenses.map(item => ({ ...item })));
  deletion.status = 'restored'; deletion.restoredAt = Date.now();
  return { restoredCount: deletion.expenses.length };
}

export function addAgentExpenses(db, entries, scope, messageId, options = {}) {
  if (typeof messageId !== 'string' || !messageId) throw new Error('缺少记账消息凭证，请重新发送。');
  const validated = constrainExpenses(entries, scope);
  const prior = [...db.expenses, ...(db.deletedExpenses || []).flatMap(item => item.expenses || [])];
  const occurrences = new Map();
  const added = [];
  const idFactory = options.idFactory || nextId;
  for (const expense of validated) {
    const signature = JSON.stringify(expense);
    const occurrence = occurrences.get(signature) || 0;
    occurrences.set(signature, occurrence + 1);
    const key = `${signature}:${occurrence}`;
    if (prior.some(item => item.agentMessageId === messageId && item.agentItemKey === key)) continue;
    const id = idFactory();
    if (prior.some(item => item.id === id) || added.some(item => item.id === id)) throw new Error('账单编号冲突，请重试。');
    added.push({ ...expense, id, via: options.via || 'ai', createdAt: options.now ?? Date.now(), agentMessageId: messageId, agentItemKey: key });
  }
  db.expenses.unshift(...added);
  return { addedCount: added.length, alreadyProcessedCount: validated.length - added.length, expenses: added };
}

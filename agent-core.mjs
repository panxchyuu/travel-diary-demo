const ALLOWED_TOOLS = new Set(['add_expenses', 'prepare_expenses', 'prepare_delete', 'query_ledger', 'search_diaries', 'read_diary', 'calculate', 'ask_clarification', 'respond']);
export const LEDGER_CATEGORIES = ['餐饮', '交通', '住宿', '门票', '购物', '娱乐', '其他'];
export const CURRENCIES = ['CNY', 'USD', 'MVR', 'JPY', 'KRW', 'THB', 'EUR', 'GBP', 'VND', 'HKD', 'TWD', 'SGD', 'MYR', 'IDR', 'AUD', 'CAD', 'AED', 'CHF'];
export const PAY_METHODS = ['', 'cash', 'visa', 'online', 'other'];

export function normalizeScope(scope) {
  return typeof scope === 'string' && scope.trim() ? scope.trim().slice(0, 80) : '__all__';
}

export function matchesScope(entry, scope) {
  const selected = normalizeScope(scope);
  const trip = (entry.trip || '').trim();
  return selected === '__all__' || (selected === '__none__' ? !trip : trip === selected);
}

export function constrainQuery(query, scope) {
  const validated = validateQuery(query);
  const selected = normalizeScope(scope);
  if (selected !== '__all__') {
    if (validated.trip && validated.trip !== selected) throw new Error('当前旅程与问题中的旅程不同，请先切换旅程。');
    validated.trip = selected;
  }
  return validated;
}

export function constrainExpenses(expenses, scope) {
  const selected = normalizeScope(scope);
  return validateExpenses(expenses).map(expense => {
    if (expense.trip === '__all__') throw new Error('请选择具体旅程或未分组，不能记入全部旅程。');
    const trip = expense.trip === '__none__' ? '' : expense.trip;
    if (selected === '__all__') {
      if (!expense.trip) throw new Error('这笔消费属于哪段旅程？请先选择旅程，或明确说记入未分组。');
      return { ...expense, trip };
    }
    const destination = selected === '__none__' ? '' : selected;
    if ((expense.trip === '__none__' && destination) || (trip && trip !== destination)) throw new Error('这笔消费属于其他旅程，请先切换旅程再记账。');
    return { ...expense, trip: destination };
  });
}

export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.text === 'string')
    .slice(-24)
    .map(message => ({
      role: message.role,
      content: message.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 4000),
    }))
    .filter(message => message.content.trim());
}

export function parseAgentResponse(response) {
  const call = response?.output?.find(item => item?.type === 'function_call');
  if (call) {
    if (!ALLOWED_TOOLS.has(call.name)) throw new Error(`Unsupported tool: ${call.name}`);
    if (typeof call.call_id !== 'string' || !call.call_id) throw new Error('Invalid function call id');
    let args;
    try { args = JSON.parse(call.arguments || '{}'); }
    catch { throw new Error('Invalid tool arguments'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Object.assign(new Error('模型返回的工具参数无效，请重试。'), { statusCode: 502 });
    return { type: 'tool', name: call.name, callId: call.call_id, arguments: args };
  }

  const text = response?.output_text || response?.output
    ?.filter(item => item?.type === 'message')
    .flatMap(item => item.content || [])
    .find(item => item?.type === 'output_text')?.text || '';
  return text.trim() ? { type: 'reply', text: text.trim() } : { type: 'reply', text: '我刚刚没有组织好回复，可以再说一遍吗？' };
}

export function validateExpenses(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 20) {
    throw new Error('expenses must contain between 1 and 20 entries');
  }

  return entries.map((entry, index) => {
    const prefix = `expense ${index + 1}`;
    if (!entry || typeof entry !== 'object') throw new Error(`${prefix} is invalid`);
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error(`${prefix} amount is invalid`);
    if (!isDate(entry.date)) {
      throw new Error(`${prefix} date is invalid`);
    }
    if (!LEDGER_CATEGORIES.includes(entry.category)) throw new Error(`${prefix} category is invalid`);
    if (!CURRENCIES.includes(entry.currency)) throw new Error(`${prefix} currency is invalid`);
    const payMethod = entry.payMethod ?? '';
    if (!PAY_METHODS.includes(payMethod)) throw new Error(`${prefix} payMethod is invalid`);
    return {
      date: entry.date,
      category: entry.category,
      amount,
      currency: entry.currency,
      payMethod,
      trip: typeof entry.trip === 'string' ? entry.trip.trim().slice(0, 80) : '',
      note: typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim().slice(0, 120) : entry.category,
    };
  });
}

const QUERY_METRICS = new Set(['total', 'count', 'by_category', 'by_trip', 'by_day', 'top_expense', 'average', 'daily_average', 'budget_remaining', 'records']);
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateQuery(query) {
  if (!query || typeof query !== 'object' || !QUERY_METRICS.has(query.metric)) throw new Error('query metric is invalid');
  const originalCurrency = Object.hasOwn(query, 'originalCurrency') ? query.originalCurrency : query.currency;
  for (const key of ['fromDate', 'toDate']) {
    if (query[key] != null && !isDate(query[key])) throw new Error(`query ${key} is invalid`);
  }
  if (query.fromDate && query.toDate && query.fromDate > query.toDate) throw new Error('query date range is invalid');
  if (query.category != null && !LEDGER_CATEGORIES.includes(query.category)) throw new Error('query category is invalid');
  if (originalCurrency != null && !CURRENCIES.includes(originalCurrency)) throw new Error('query currency is invalid');
  if (query.payMethod != null && !PAY_METHODS.includes(query.payMethod)) throw new Error('query payMethod is invalid');
  for (const key of ['trip']) {
    if (query[key] != null && (typeof query[key] !== 'string' || query[key].length > 80)) throw new Error(`query ${key} is invalid`);
  }
  return {
    fromDate: query.fromDate || null,
    toDate: query.toDate || null,
    category: query.category || null,
    trip: query.trip?.trim() || null,
    currency: originalCurrency || null,
    payMethod: query.payMethod || null,
    keyword: typeof query.keyword === 'string' ? query.keyword.trim().slice(0, 120) : null,
    metric: query.metric,
  };
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function queryLedger(expenses, rates, budget, query = {}) {
  const allExpenses = Array.isArray(expenses) ? expenses : [];
  const keywordTerms = (query.keyword || '').normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const compactKeyword = keywordTerms.join('');
  const rows = allExpenses.filter(expense => {
    const date = expense.date || '';
    const note = (expense.note || '').normalize('NFKC').toLocaleLowerCase();
    const phraseContainsNote = compactKeyword.includes(note) && note.length >= 2;
    return (!query.fromDate || date >= query.fromDate)
      && (!query.toDate || date <= query.toDate)
      && (!query.category || expense.category === query.category)
      && (!query.trip || matchesScope(expense, query.trip))
      && (phraseContainsNote || keywordTerms.every(term => note.includes(term)))
      && (!query.currency || (expense.currency || 'CNY') === query.currency)
      && (!query.payMethod || (expense.payMethod || '') === query.payMethod);
  });

  const currencyTotals = {};
  const totalsByCategory = {};
  const totalsByTrip = {};
  const totalsByDate = {};
  const totalsByDateByCurrency = {};
  let topExpense = null;
  let totalCny = 0;
  for (const row of rows) {
    const currency = row.currency || 'CNY';
    const amount = Number(row.amount) || 0;
    const cny = amount * (Number(rates?.[currency]) || (currency === 'CNY' ? 1 : 0));
    currencyTotals[currency] = (currencyTotals[currency] || 0) + amount;
    totalsByCategory[row.category || '其他'] = (totalsByCategory[row.category || '其他'] || 0) + cny;
    const trip = (row.trip || '').trim() || '未分组';
    totalsByTrip[trip] = (totalsByTrip[trip] || 0) + cny;
    totalsByDate[row.date] = (totalsByDate[row.date] || 0) + cny;
    totalsByDateByCurrency[row.date] ||= {};
    totalsByDateByCurrency[row.date][currency] = (totalsByDateByCurrency[row.date][currency] || 0) + amount;
    if (!topExpense || cny > topExpense.cny) topExpense = { ...row, cny };
    totalCny += cny;
  }

  const safeBudget = Number.isFinite(Number(budget)) && Number(budget) > 0 ? Number(budget) : null;
  const allExpenseTotalCny = allExpenses.reduce((total, expense) => {
    const currency = expense.currency || 'CNY';
    const amount = Number(expense.amount) || 0;
    return total + amount * (Number(rates?.[currency]) || (currency === 'CNY' ? 1 : 0));
  }, 0);
  const activeDays = Object.keys(totalsByDate).length;
  const topDay = Object.entries(totalsByDate).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    count: rows.length,
    totalCny: rounded(totalCny),
    activeDays,
    averageCny: rows.length ? rounded(totalCny / rows.length) : 0,
    dailyAverageCny: activeDays ? rounded(totalCny / activeDays) : 0,
    topExpense: topExpense ? {
      date: topExpense.date,
      category: topExpense.category || '其他',
      amount: Number(topExpense.amount) || 0,
      currency: topExpense.currency || 'CNY',
      note: topExpense.note || topExpense.category || '其他',
      cny: rounded(topExpense.cny),
    } : null,
    topDay: topDay ? { date: topDay[0], totalCny: rounded(topDay[1]) } : null,
    currencyTotals: Object.fromEntries(Object.entries(currencyTotals).map(([key, value]) => [key, rounded(value)])),
    totalsByCategory: Object.fromEntries(Object.entries(totalsByCategory).map(([key, value]) => [key, rounded(value)])),
    totalsByTrip: Object.fromEntries(Object.entries(totalsByTrip).map(([key, value]) => [key, rounded(value)])),
    totalsByDate: Object.fromEntries(Object.entries(totalsByDate).map(([key, value]) => [key, rounded(value)])),
    totalsByDateByCurrency: Object.fromEntries(Object.entries(totalsByDateByCurrency).map(([date, totals]) => [date, Object.fromEntries(Object.entries(totals).map(([currency, amount]) => [currency, rounded(amount)]))])),
    budget: safeBudget,
    remaining: safeBudget === null ? null : rounded(safeBudget - allExpenseTotalCny),
    rows: rows.slice(0, 100).map(({ id, date, category, amount, currency, payMethod, trip, note }) => ({
      id: typeof id === 'string' ? id.slice(0, 80) : undefined,
      date,
      category: category || '其他',
      amount: Number(amount) || 0,
      currency: currency || 'CNY',
      payMethod: payMethod || '',
      trip: trip || '',
      note: note || category || '其他',
    })),
  };
}

// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
const mutations=await import('../ledger-mutations.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const expense=(overrides={})=>({date:'2031-10-20',category:'购物',amount:87.43,currency:'CNY',payMethod:'',note:'咖啡豆',...overrides});
const saved=(overrides={})=>({id:'coffee-1',trip:'海岛',createdAt:1,...expense(),...overrides});
const options=()=>{let id=0;return {idFactory:()=>`new-${++id}`,now:10};};

test('literal source date headers inherit across newlines and never backfill earlier items',()=>{
  const source='旅馆：小费12刀\n10.18 海钓61刀\n10.20 午饭317拉菲亚\n两个冷萃152拉菲亚';
  const entries=['小费12刀','海钓61刀','午饭317拉菲亚','两个冷萃152拉菲亚'].map(sourceText=>expense({date:null,sourceText}));
  const result=mutations.reconcileExpenseDates(entries,[{role:'user',content:source},{role:'assistant',content:'币种没写'},{role:'user',content:'按写的日期记账'}],'2031-11-04');
  assert.deepEqual(result.map(row=>row.date),[null,'2031-10-18','2031-10-20','2031-10-20']);
  const unknown=mutations.reconcileExpenseDates([expense({date:null,sourceText:'未匹配的消费'})],[{role:'user',content:source}],'2031-11-04');
  assert.equal(unknown[0].date,null);
  const corrected=mutations.reconcileExpenseDates([expense({date:'2031-10-21',sourceText:'海钓61刀'})],[{role:'user',content:source},{role:'user',content:'海钓日期改为10月21日'}],'2031-11-04');
  assert.equal(corrected[0].date,'2031-10-21');
  const confirmed=mutations.reconcileExpenseDates([expense({date:'2031-10-21',sourceText:'海钓61刀'})],[{role:'user',content:source},{role:'user',content:'海钓日期改为10月21日'},{role:'user',content:'好的，入账吧'}],'2031-11-04');
  assert.equal(confirmed[0].date,'2031-10-21');
  const inlineSource='10.18 海钓61刀\n午饭317拉菲亚（实际10月20日）';
  const inline=mutations.reconcileExpenseDates([expense({date:'2031-10-18',sourceText:'海钓61刀'}),expense({date:'2031-10-20',sourceText:'午饭317拉菲亚（实际10月20日）'})],[{role:'user',content:inlineSource}],'2031-11-04');
  assert.equal(inline[1].date,'2031-10-20');
});

test('explicit monetary text keeps amounts independent of missing dates and does not multiply quantities',()=>{
  const items=[['两晚小费12刀',null,'USD',12],['两个冷萃152拉菲亚',304,'MVR',152],['一瓶0啤酒4刀',null,null,4],['咖啡豆92.68人民币',null,null,92.68]];
  const draft=mutations.prepareExpenseDraft({trip:'海岛',expenses:items.map(([sourceText,amount,currency])=>expense({date:null,sourceText,amount,currency}))},'海岛',[],'amounts');
  assert.deepEqual(draft.expenses.map(row=>row.amount),items.map(row=>row[3]));
  assert.deepEqual(draft.expenses.map(row=>row.currency),['USD','MVR','USD','CNY']);
  assert.ok(draft.expenses.every(row=>row.date===null));
  const ambiguous=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense({amount:null,sourceText:'咖啡10刀和午餐20刀'})]},'海岛',[],'ambiguous');
  assert.equal(ambiguous.expenses[0].amount,null);
  const grouped=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense({amount:null,sourceText:'住宿1,200.50美元'}),expense({amount:null,sourceText:'待确认1,20刀'})]},'海岛',[],'grouped');
  assert.equal(grouped.expenses[0].amount,1200.5);
  assert.equal(grouped.expenses[1].amount,null);
  for(const [prefix,currency] of [['HK$','HKD'],['A$','AUD'],['C$','CAD']]){
    const row=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense({amount:100,currency,sourceText:`晚餐${prefix}100`})]},'海岛',[],'prefix').expenses[0];
    assert.equal(row.currency,currency);
  }
});

test('batch draft preserves missing dates and supports more than twenty records',()=>{
  assert.equal(typeof mutations.prepareExpenseDraft,'function');
  const draft=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense({date:null}),...Array.from({length:25},(_,i)=>expense({note:`第${i}笔`}))]},'__all__',[],'draft-1');
  assert.equal(draft.expenses.length,26);
  assert.equal(draft.expenses[0].date,null);
  assert.equal(draft.readyCount,25);
  assert.equal(draft.missingCount,1);
  assert.equal(mutations.prepareExpenseDraft({trip:'海岛',expenses:Array.from({length:100},(_,i)=>expense({note:`第${i}笔`}))},'海岛',[],'large').expenses.length,100);
  assert.throws(()=>mutations.prepareExpenseDraft({trip:'海岛',expenses:Array.from({length:101},()=>expense())},'海岛',[],'too-large'),/100/);
});

test('source descriptions survive when the model replaces a named purchase with a generic note',()=>{
  const draft=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense({note:'用途未注明',sourceText:'咖啡豆92.68人民币'})]},'海岛',[],'source-note');
  assert.match(draft.expenses[0].note,/咖啡豆/);
  const db={expenses:[]};mutations.commitExpenseDraft(db,draft,[{index:0}],options());
  assert.match(db.expenses[0].note,/咖啡豆/);
});

test('draft commit validates all selected rows before writing and can finish missing rows later',()=>{
  assert.equal(typeof mutations.commitExpenseDraft,'function');
  const draft=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense(),expense({date:null,note:'小费'})]},'__all__',[],'draft-1');
  const db={expenses:[]};
  assert.throws(()=>mutations.commitExpenseDraft(db,draft,[{index:0},{index:1}],options()),/日期/);
  assert.equal(db.expenses.length,0);
  const first=mutations.commitExpenseDraft(db,draft,[{index:0}],options());
  assert.equal(first.addedCount,1);assert.equal(draft.status,'partial');
  assert.equal(mutations.commitExpenseDraft(db,draft,[{index:0}],options()).addedCount,0);
  const rest=mutations.commitExpenseDraft(db,draft,[{index:1,date:'2031-10-18'}],{idFactory:()=> 'rest',now:11});
  assert.equal(rest.addedCount,1);assert.equal(draft.status,'saved');
  assert.equal(db.expenses.length,2);
});

test('existing and repeated candidates are marked rather than automatically added twice',()=>{
  assert.equal(typeof mutations.prepareExpenseDraft,'function');
  const draft=mutations.prepareExpenseDraft({trip:'海岛',expenses:[expense(),expense()]},'海岛',[saved()],'draft-1');
  assert.ok(draft.expenses.every(item=>item.duplicate));
  assert.equal(draft.readyCount,0);
});

test('drafts and deletion proposals cannot cross a selected journey boundary',()=>{
  assert.equal(typeof mutations.prepareExpenseDeletion,'function');
  assert.throws(()=>mutations.prepareExpenseDraft({trip:'京都',expenses:[expense()]},'海岛',[],'d'),/旅程/);
  assert.throws(()=>mutations.prepareExpenseDeletion([saved({trip:'京都'})],{ids:['coffee-1']},'海岛','delete-1'),/旅程|账单/);
});

test('deletion requires exact current snapshots and is reversible after persistence',()=>{
  assert.equal(typeof mutations.commitExpenseDeletion,'function');
  const db={expenses:[saved(),saved({id:'other',trip:'京都'})]};
  const proposal=mutations.prepareExpenseDeletion(db.expenses,{ids:['coffee-1']},'海岛','delete-1');
  assert.equal(db.expenses.length,2,'preparing deletion does not mutate records');
  assert.throws(()=>mutations.commitExpenseDeletion(db,proposal,[],{now:10}),/选择/);
  const result=mutations.commitExpenseDeletion(db,proposal,['coffee-1'],{now:10});
  assert.equal(result.deletedCount,1);assert.equal(db.expenses.length,1);
  assert.equal(mutations.commitExpenseDeletion(db,proposal,['coffee-1'],{now:10}).deletedCount,0);
  const reloaded=JSON.parse(JSON.stringify(db));
  assert.equal(mutations.undoExpenseDeletion(reloaded,'delete-1').restoredCount,1);
  assert.equal(reloaded.expenses.find(x=>x.id==='coffee-1').amount,87.43);
  assert.equal(mutations.undoExpenseDeletion(reloaded,'delete-1').restoredCount,0);
});

test('editing a bill after the preview prevents deleting a changed record',()=>{
  assert.equal(typeof mutations.commitExpenseDeletion,'function');
  const db={expenses:[saved()]};
  const proposal=mutations.prepareExpenseDeletion(db.expenses,{ids:['coffee-1']},'海岛','delete-1');
  db.expenses[0].amount=200;
  assert.throws(()=>mutations.commitExpenseDeletion(db,proposal,['coffee-1'],{now:10}),/变化|变更/);
  assert.equal(db.expenses.length,1);
});

test('same-message retries are idempotent while a new explicit message may add another expense',()=>{
  assert.equal(typeof mutations.addAgentExpenses,'function');
  const db={expenses:[]};const opts=options();
  assert.equal(mutations.addAgentExpenses(db,[expense()],'海岛','message-1',opts).addedCount,1);
  assert.equal(mutations.addAgentExpenses(db,[expense()],'海岛','message-1',opts).addedCount,0);
  assert.equal(mutations.addAgentExpenses(db,[expense()],'海岛','message-2',opts).addedCount,1);
  assert.equal(db.expenses.length,2);
});

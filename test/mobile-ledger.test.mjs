// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=name=>html.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0]||'';

test('mobile amount entry accepts decimals and grouped amounts without guessing malformed text',()=>{
  assert.ok(fn('parseManualAmount'));
  const parse=runInNewContext(`${fn('parseManualAmount')}\nparseManualAmount`);
  assert.equal(parse('120.50'),120.5);
  assert.equal(parse('.5'),.5);
  assert.equal(parse('1,200.50'),1200.5);
  for(const value of ['','0','-3','1,2','12.345','一百多','1000000001'])assert.throws(()=>parse(value));
});

test('entry defaults remember currency within each journey and do not carry a historical date into a fresh entry',()=>{
  assert.ok(fn('manualExpenseDefaults'));
  const defaults=runInNewContext(`${fn('manualExpenseDefaults')}\nmanualExpenseDefaults`,{CURRENCY_DEFS:{CNY:{},JPY:{},USD:{}}});
  const expenses=[{trip:'海岛',currency:'USD'},{trip:'京都',currency:'JPY'}];
  assert.equal(defaults('京都',expenses,{},'2031-11-04').currency,'JPY');
  assert.equal(defaults('京都',expenses,{'京都':{currency:'USD'}},'2031-11-04').currency,'USD');
  assert.equal(defaults('新旅程',expenses,{},'2031-11-04').currency,'CNY');
  assert.equal(defaults('京都',expenses,{},'2031-11-04').date,'2031-11-04');
  assert.equal(defaults('__none__',expenses,{},'2031-11-04').trip,'');
});

test('saving a mobile entry validates date and retains its explicitly selected destination',()=>{
  assert.ok(fn('buildManualExpense'));
  const build=runInNewContext(`${fn('parseManualAmount')}\n${fn('buildManualExpense')}\nbuildManualExpense`,{
    CURRENCY_DEFS:{CNY:{},JPY:{}},CAT_STYLE:{餐饮:{}},PAY_METHODS:{cash:{}},
  });
  const input={amount:'15.50',date:'2031-11-04',category:'餐饮',currency:'JPY',trip:'京都',note:'午餐',payMethod:''};
  assert.equal(build(input,'海岛').trip,'京都');
  assert.equal(build({...input,trip:''},'海岛').trip,'海岛');
  assert.equal(build({...input,trip:''},'__all__').trip,'');
  assert.throws(()=>build({...input,date:'2031-02-30'},'海岛'),/日期/);
});

test('Chinese IME confirmation does not send a half-composed chat message',()=>{
  assert.ok(fn('shouldSendChatOnEnter'));
  const shouldSend=runInNewContext(`${fn('shouldSendChatOnEnter')}\nshouldSendChatOnEnter`);
  assert.equal(shouldSend({key:'Enter',isComposing:true}),false);
  assert.equal(shouldSend({key:'Enter',keyCode:229}),false);
  assert.equal(shouldSend({key:'Enter',shiftKey:true}),false);
  assert.equal(shouldSend({key:'Enter',shiftKey:false,isComposing:false}),true);
});

test('save and continue records once, clears only amount and note, and keeps entry context',()=>{
  const fields={manualAmount:{value:'12.50'},manualDate:{value:'2031-10-19'},manualCategory:{value:'交通'},expCurrency:{value:'USD'},manualTrip:{value:'海岛'},manualNote:{value:'船票'},manualPayMethod:{value:'cash'},expenseSaveStatus:{hidden:true},expenseComposer:{close(){throw Error('continue should keep the composer open');}}};
  fields.manualAmount.focus=()=>{};
  const db={expenses:[]};let writes=0,feedback='';
  const submit=runInNewContext(`${fn('parseManualAmount')}\n${fn('buildManualExpense')}\nlet manualSaving=false,manualContextScope='海岛';\n${fn('submitManualExpense')}\nsubmitManualExpense`,{
    CURRENCY_DEFS:{USD:{}},CAT_STYLE:{交通:{}},PAY_METHODS:{cash:{}},db,selectedScope:'海岛',chatBusy:false,
    document:{getElementById:id=>fields[id]},uid:()=> 'entry-1',save:()=>{writes++;},renderExpenses(){},renderEntries(){},showManualExpenseError:message=>{feedback=message;},toast(){},curSym:()=> '$',fmtMoney:value=>String(value),
  });
  const event={preventDefault(){},submitter:{value:'continue'}};
  submit(event);
  assert.equal(db.expenses.length,1);assert.equal(writes,1);
  assert.equal(db.expenses[0].amount,12.5);
  assert.equal(fields.manualAmount.value,'');assert.equal(fields.manualNote.value,'');
  assert.equal(fields.expCurrency.value,'USD');assert.equal(fields.manualDate.value,'2031-10-19');assert.equal(fields.manualTrip.value,'海岛');
  assert.equal(fields.expenseSaveStatus.hidden,false);
  submit(event);
  assert.equal(db.expenses.length,1);assert.equal(writes,1);assert.ok(feedback);
});

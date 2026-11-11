// All records in this file are fictional fixtures for automated checks.
// Explicit, opt-in live-model checks. All writes below affect synthetic memory only.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as core from '../agent-core.mjs';
import * as memory from '../memory-core.mjs';
import * as calculation from '../calculation-core.mjs';
import * as mutations from '../ledger-mutations.mjs';
const html=readFileSync('index.html','utf8');
const actualAction=html.match(/async function performAgentAction\([^]*?\n\}/)[0];
const messageScope=html.match(/function messageScope\([^]*?\n\}/)[0];
const source=`加入珊瑚旅程账单\n示例开销：\n云杉旅舍：明信片7刀 两晚小费6刀 头绳3刀 榛果奶茶和生啤22刀（visa支付）可乐8刀\n明澜岛：\n4.09 184拉菲亚 47刀海钓 121拉菲亚渔具\n4.10 83刀浮潜 松果午餐246拉菲亚 便利店67拉菲亚 冰箱贴12刀 鱼饵38拉菲亚 便利店零食44拉菲亚\n4.11 一瓶0啤酒9刀 青禾午餐274拉菲亚 机场水19拉菲亚 轮渡42拉菲亚 纪念品238拉菲亚\n咖啡豆87.43人民币 两个冷萃126拉菲亚 晚餐24.75刀 机场轮渡6刀 行李寄存18刀 鱼干21刀 面包和水17刀`;
const expense=(id,note,amount=87.43,trip='海岛',date='2031-10-20')=>({id,date,trip,category:'购物',amount,currency:'CNY',payMethod:'',note,createdAt:1});
function agent(db,scope='海岛',history=[]){
 let counter=0;const messages=history.slice();
 const execute=runInNewContext(`${messageScope}\n${actualAction}\nperformAgentAction`,{db,uid:()=>`live-${Date.now()}-${++counter}`,loadAgentCore:async()=>core,loadMemoryCore:async()=>memory,loadCalculationCore:async()=>calculation,loadLedgerMutations:async()=>mutations,Date});
 return async function ask(text){
  const user={id:`user-${Date.now()}-${++counter}`,scope,text,via:'text',agentReceipts:[]};
  const tools=[];let body={messages:[...messages,{role:'user',text}],context:{scope,today:'2031-11-04',trips:[...new Set(db.expenses.map(item=>item.trip).filter(Boolean))]}};
  for(let hop=0;hop<14;hop++){
   const response=await fetch('http://127.0.0.1:4173/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(70_000)});
   const result=await response.json();if(!response.ok)throw Error(result.error||String(response.status));
   if(result.type==='reply'){messages.push({role:'user',text},{role:'assistant',text:result.text});return {text:result.text,receipts:user.agentReceipts,tools};}
   tools.push({name:result.name,arguments:result.arguments});
   const action=await execute(result,user);user.agentReceipts.push(action.receipt);
   body={pendingId:result.pendingId,toolOutput:action.toolOutput,context:{scope,today:'2031-11-04'}};
  }
  throw Error('Tool loop did not finish');
 };
}
const makeDb=expenses=>({entries:[],expenses,rates:{CNY:1,USD:7,MVR:.5},chat:[],deletedExpenses:[]});
const cases=[
 {id:'batch-after-incorrect-clarification',run:async()=>{
  const db=makeDb([]);const ask=agent(db,'__all__',[{role:'user',text:source},{role:'assistant',text:'这些消费有的没有写币种。请补充币种和日期，未写日期按今天可以吗？'}]);
  const result=await ask('按写的日期和币种记账');const draft=result.receipts.find(item=>item.type==='expense_draft')?.draft;
  if(!draft)throw Error('Did not prepare the batch: '+result.text);
  const totals={};for(const row of draft.expenses)totals[row.currency]=(totals[row.currency]||0)+row.amount;
  const dates={};for(const row of draft.expenses)dates[row.date||'missing']=(dates[row.date||'missing']||0)+1;
  const checks=[draft.trip==='珊瑚旅程',draft.expenses.length===26,dates.missing===5,dates['2031-04-09']===3,dates['2031-04-10']===6,dates['2031-04-11']===12,totals.USD===283.75,totals.MVR===1399,totals.CNY===87.43,Boolean(draft.expenses.find(x=>x.amount===87.43)?.note.includes('咖啡豆')),draft.expenses.find(x=>x.amount===22)?.payMethod==='visa',db.expenses.length===0];
  if(checks.some(ok=>!ok))throw Error('Batch parse mismatch: '+JSON.stringify({trip:draft.trip,count:draft.expenses.length,dates,totals,checks,draft}));
  if(!/5 笔待补日期/.test(result.text)||/待补金额|缺少金额/.test(result.text))throw Error('Receipt disagrees with parsed fields: '+result.text);
  const ready=draft.expenses.flatMap((row,index)=>row.date&&row.currency&&row.amount&&!row.duplicate?[{index}]:[]);
  const saved=mutations.commitExpenseDraft(db,draft,ready,{idFactory:()=>`batch-${db.expenses.length}-${Math.random()}`});
  if(saved.addedCount!==21||core.queryLedger(db.expenses,db.rates,null,{metric:'total'}).totalCny!==2451.18)throw Error('Batch commit count or amount incorrect');
  if(mutations.commitExpenseDraft(db,draft,ready).addedCount!==0)throw Error('Repeated confirmation duplicated expenses');
  return {...result,summary:{count:26,missingDateCount:5,readyCount:21,totals,savedTotalCny:2451.18}};
 }},
 {id:'single-add-and-delete-reference',run:async()=>{
  const db=makeDb([expense('old','码头咖啡',36,'海岛','2031-10-18')]);const ask=agent(db);
  const added=await ask('今天在码头喝咖啡花了28元，现金，帮我记一笔');
  const row=db.expenses.find(item=>item.amount===28);
  if(!row||row.currency!=='CNY'||row.date!=='2031-11-04'||row.payMethod!=='cash')throw Error('Single add failed: '+JSON.stringify(added));
  const result=await ask('把刚才记的那笔删掉');const draft=result.receipts.find(item=>item.type==='deletion_draft')?.draft;
  if(!draft||draft.snapshots.length!==1||draft.snapshots[0].id!==row.id)throw Error('Recent bill reference incorrect: '+JSON.stringify(result));
  const removed=mutations.commitExpenseDeletion(db,draft,[row.id]);if(removed.deletedCount!==1||db.expenses.some(item=>item.id===row.id))throw Error('Did not delete selected record');
  mutations.undoExpenseDeletion(db,draft.id);if(!db.expenses.some(item=>item.id===row.id))throw Error('Undo did not restore original ID');
  return {...result,summary:{addedAmount:28,deleted:1,restored:1}};
 }},
 {id:'delete-named-coffee',run:async()=>{
  const db=makeDb([expense('coffee','咖啡豆'),expense('food','午餐',60)]);const result=await agent(db)('删除咖啡豆的钱');const draft=result.receipts.find(item=>item.type==='deletion_draft')?.draft;
  if(!draft||draft.snapshots.length!==1||draft.snapshots[0].id!=='coffee'||db.expenses.length!==2)throw Error('Wrong target or removed before confirmation: '+JSON.stringify(result));
  return {...result,summary:{target:'coffee',requiresConfirmation:true,unchangedBeforeConfirmation:true}};
 }},
 {id:'ambiguous-delete',run:async()=>{
  const db=makeDb([expense('coffee1','咖啡豆'),expense('coffee2','咖啡豆',109.25,'海岛','2031-10-19')]);const result=await agent(db)('删掉咖啡豆那笔');const draft=result.receipts.find(item=>item.type==='deletion_draft')?.draft;
  if(draft&&draft.snapshots.length!==2)throw Error('Silently chose one of two matching bills: '+JSON.stringify(result));
  if(!draft&&!/哪|两笔|多笔|具体|日期|选择/.test(result.text))throw Error('Did not clarify ambiguous records');
  if(db.expenses.length!==2)throw Error('Removed ambiguous record');
  return {...result,summary:{candidates:2,unchanged:true}};
 }},
 {id:'delete-missing-record',run:async()=>{
  const db=makeDb([expense('food','午餐',60)]);const result=await agent(db)('删除咖啡豆的钱');
  if(result.receipts.some(item=>item.type==='deletion_draft')||db.expenses.length!==1||!/没|未|找不到|不存在/.test(result.text))throw Error('Invented a missing deletion target');
  return {...result,summary:{missing:true,unchanged:true}};
 }},
 {id:'delete-other-journey',run:async()=>{
  const db=makeDb([expense('other','京都住宿',500,'京都')]);const result=await agent(db)('删除京都那次的住宿账单');
  if(result.receipts.some(item=>item.type==='deletion_draft')||db.expenses.length!==1||!/切换|选择/.test(result.text))throw Error('Cross-journey deletion was not blocked');
  return {...result,summary:{blocked:true,unchanged:true}};
 }},
];
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',');const selected=only?cases.filter(item=>only.includes(item.id)):cases;
const results=[];let cursor=0;
await Promise.all([0,1].map(async()=>{while(cursor<selected.length){const item=selected[cursor++];const start=Date.now();try{const result=await item.run();results.push({id:item.id,pass:true,seconds:Math.round((Date.now()-start)/100)/10,...result});console.log(JSON.stringify({id:item.id,pass:true,text:result.text,summary:result.summary}));}catch(error){results.push({id:item.id,pass:false,error:error.message});console.log(JSON.stringify({id:item.id,pass:false,error:error.message}));}}}));
mkdirSync('outputs',{recursive:true});const path='outputs/ledger-actions-live-results.json';let old=[];try{old=JSON.parse(readFileSync(path,'utf8')).results||[];}catch{}
const all=only?[...old.filter(item=>!only.includes(item.id)),...results]:results;
writeFileSync(path,JSON.stringify({testedAt:new Date().toISOString(),synthetic:true,results:all},null,2));
console.log(`SUMMARY ${results.filter(item=>item.pass).length}/${results.length}`);if(results.some(item=>!item.pass))process.exitCode=1;

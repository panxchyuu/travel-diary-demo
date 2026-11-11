// All records in this file are fictional fixtures for automated checks.
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const core=await import(resolve('agent-core.mjs'));
const memory=await import(resolve('memory-core.mjs'));
const calculation=await import(resolve('calculation-core.mjs'));
import {scope,fixture} from '../test/fixtures/assistant-dialogue.mjs';
const html=readFileSync('index.html','utf8');
const actualAction=html.match(/async function performAgentAction\([^]*?\n\}/)[0];
const actualMessageScope=html.match(/function messageScope\([^]*?\n\}/)[0];
const execute=runInNewContext(`${actualMessageScope}\n${actualAction}\nperformAgentAction`,{db:fixture,loadAgentCore:async()=>core,loadMemoryCore:async()=>memory,loadCalculationCore:async()=>calculation,uid:()=> 'prohibited-write',Date});
const has=(text,n)=>new RegExp(`(?<![\\d.])${String(n).replace('.','\\.')}(?:0*)(?!\\d)`).test(text.replace(/[,，\s]/g,''));
const cases=[
{id:'percentage',group:'percentage',question:'这次餐饮支出占总花费的百分之几？请计算并保留两位小数。',check:r=>has(r.text,20.87)},
{id:'largest',group:'largest',question:'这次最大的一笔消费是什么？多少人民币，哪天？',check:r=>has(r.text,500)&&r.text.includes('海风旅馆')},
{id:'cash-filter',group:'cash',question:'这次现金支付的餐饮一共多少钱？',check:r=>has(r.text,228)},
{id:'memory-place',group:'memory',question:'我海钓后，在码头附近吃午饭的店叫什么？',check:r=>r.text.includes('星屿小馆')&&r.sources?.length>0},
{id:'memory-followup',group:'memory',question:'吃完之后我又去了哪里？',check:r=>r.text.includes('灯塔步道')&&r.sources?.length>0},
{id:'memory-tips',group:'tips',question:'这段旅程有什么需要记住的注意事项？',check:r=>/18[:：]00|18点|六点/.test(r.text)&&/美元现金/.test(r.text)&&r.sources?.length>0},
{id:'bill-detail',group:'bill',question:'星屿小馆午餐这笔账，哪天花了多少钱，用什么方式付的？',check:r=>has(r.text,128)&&/10[-月/.]18|18日/.test(r.text)&&r.text.includes('现金')},
{id:'day-records',group:'records',question:'2031年10月19日有哪些消费？逐笔列出备注、原币金额、币种和支付方式。',check:r=>[40,300,60,90].every(n=>has(r.text,n))&&/现金/.test(r.text)&&/visa|刷卡/i.test(r.text)&&/线上|在线/.test(r.text)},
{id:'total',group:'stats',question:'这次旅行一共花了多少？按人民币算。',check:r=>has(r.text,1380)},
{id:'category-followup',group:'stats',question:'其中餐饮一共多少？',check:r=>has(r.text,288)},
{id:'by-day',group:'days',question:'整趟旅行按天分别花了多少人民币？哪天最多？',check:r=>[700,580,100].every(n=>has(r.text,n))&&/18/.test(r.text)},
{id:'averages',group:'averages',question:'按有消费记录的天数算，平均每天花多少？平均每笔又是多少？',check:r=>has(r.text,460)&&has(r.text,172.5)},
{id:'currency',group:'currency',question:'这次美元消费合计多少美元，按当前设置折合多少人民币？',check:r=>has(r.text,40)&&has(r.text,280)},
{id:'joint',group:'joint',question:'日记里我觉得星屿小馆怎么样？账本里这家店花了多少？',check:r=>has(r.text,128)&&/咖喱|分量/.test(r.text)&&r.sources?.length>0},
{id:'missing',group:'missing',question:'我这次住的酒店房间号是多少？',check:r=>!has(r.text,818)&&/没有|没找到|未记录|未提|不.*确定|无法/.test(r.text)},
{id:'scope',group:'scope',question:'帮我查京都验收旅程那次总花费。',check:r=>/切换|选择/.test(r.text)&&!has(r.text,3999)},
{id:'split',group:'split',question:'这次餐饮费用三个人平摊，每人多少钱？请现场计算。',check:r=>has(r.text,96)},
{id:'derived',group:'derived',question:'剔除住宿后，这次旅行还花了多少？剩下的三个人平摊，每人多少？保留两位小数。',check:r=>has(r.text,880)&&has(r.text,293.33)},
];
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7)?.split(',');
const selected=only?cases.filter(c=>only.includes(c.id)):cases;
const groups=[...new Set(selected.map(c=>c.group))];
const results=[];
async function conversation(group){
 const messages=[];
 for(const item of selected.filter(c=>c.group===group)){
 const tools=[];const start=Date.now();let body={messages:[...messages,{role:'user',text:item.question}],context:{scope,today:'2031-11-04',trips:[scope,'京都验收旅程']}};
 try{
 for(let hop=0;hop<14;hop++){
  const response=await fetch('http://127.0.0.1:4173/api/agent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(70_000)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||`HTTP ${response.status}`);
  if(result.type==='reply'){
   const pass=Boolean(item.check(result))&&(item.id==='scope'||!result.text.includes('全部旅程'))&&(!['split','derived','percentage'].includes(item.id)||tools.some(tool=>tool.name==='calculate'));
   const record={id:item.id,question:item.question,pass,text:result.text,sourceCount:result.sources?.length||0,tools,seconds:Math.round((Date.now()-start)/100)/10};
   results.push(record);messages.push({role:'user',text:item.question},{role:'assistant',text:result.text});
   console.log(JSON.stringify(record));break;
  }
  if(['add_expenses','prepare_expenses','prepare_delete'].includes(result.name))throw Error('Unexpected write during a read-only question');
  tools.push({name:result.name,arguments:result.arguments});
  const action=await execute(result,{scope,via:'text'});
  body={pendingId:result.pendingId,toolOutput:action.toolOutput,context:{scope,today:'2031-11-04'}};
  if(hop===13)throw Error('Tool loop did not finish');
 }
 }catch(error){const record={id:item.id,question:item.question,pass:false,error:error.message,tools};results.push(record);console.log(JSON.stringify(record));}
 }
}
let cursor=0;
await Promise.all([0,1].map(async()=>{while(cursor<groups.length){const group=groups[cursor++];await conversation(group);}}));
mkdirSync('outputs',{recursive:true});
const path='outputs/assistant-live-results.json';
let previous=[];try{previous=JSON.parse(readFileSync(path,'utf8')).results||[];}catch{}
const combined=only?[...previous.filter(r=>!only.includes(r.id)),...results]:results;
writeFileSync(path,JSON.stringify({testedAt:new Date().toISOString(),fixture:{scope,diaryCount:fixture.entries.length,expenseCount:fixture.expenses.length,expectedTotalCny:1380,exchangeRates:fixture.rates},results:combined},null,2));
console.log(`SUMMARY ${results.filter(r=>r.pass).length}/${results.length}`);
if(results.some(r=>!r.pass))process.exitCode=1;

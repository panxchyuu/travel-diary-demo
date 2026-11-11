// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const runSource=html.match(/async function runAgentFor\([^]*?\n\}/)[0];

for(const failed of [false,true])test(`review buttons are re-rendered after the assistant ${failed?'fails':'finishes'}`,async()=>{
  const user={id:'u1',role:'user',scope:'海岛',text:'记账'};
  const db={chat:[user]};let busy=false;const renders=[];
  const context={db,chatBusy:false,setChatBusy(value){busy=value;context.chatBusy=value;},messageScope:()=> '海岛',save(){},renderChat(){renders.push(busy);},currentAgentMessages:()=>[],agentContext:()=>({}),postAgent:async()=>{if(failed)throw Error('offline');return {type:'reply',text:'请核对卡片'};},uid:()=> 'a1',Date};
  const run=runInNewContext(`${runSource}\nrunAgentFor`,context);await run(user);
  assert.equal(busy,false);assert.equal(renders.at(-1),false);
  assert.equal(db.chat.some(message=>message.status==='thinking'),false);
});

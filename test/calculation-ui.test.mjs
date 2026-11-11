// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as core from '../agent-core.mjs';
import * as calculation from '../calculation-core.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const action=html.match(/async function performAgentAction\([^]*?\n\}/)[0];
const render=html.match(/function renderChatReceipt\([^]*?\n\}/)[0];

test('calculation actions return a calculation receipt without pretending to query ledger totals',async()=>{
  const execute=runInNewContext(`${action}\nperformAgentAction`,{loadAgentCore:async()=>core,loadCalculationCore:async()=>calculation,messageScope:()=> '海岛'});
  const result=await execute({name:'calculate',arguments:{expression:'288 / 3',precision:2}},{scope:'海岛'});
  assert.equal(result.toolOutput.result,96);
  assert.equal(result.receipt.type,'calculation');
  const renderer=runInNewContext(`${render}\nrenderChatReceipt`,{esc:value=>String(value)});
  const markup=renderer([result.receipt]);
  assert.match(markup,/288 \/ 3/);
  assert.match(markup,/96\.00/);
  assert.doesNotMatch(markup,/匹配账目|折算人民币/);
});

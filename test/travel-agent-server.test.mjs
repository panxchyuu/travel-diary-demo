// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';

async function fixture(run, responses) {
  const calls = [];
  const server = createServer({ env: { OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' }, fetchImpl: async (_, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json(responses[calls.length - 1] || { output_text: '已根据原文回答。[1]' });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const post = async body => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try { await run(post, calls); } finally { await new Promise(resolve => server.close(resolve)); }
}
const action = (name, args) => ({ output: [{ type: 'function_call', name, call_id: 'call-1', arguments: JSON.stringify(args) }] });
const initial = { messages: [{ role: 'user', text: '码头附近那家店叫什么' }], context: { scope: '海岛', today: '2031-11-04', trips: ['海岛', '日本'] } };

test('server provides diary tools and returns validated source references after retrieval', async () => {
  await fixture(async (post, calls) => {
    const first = await post(initial);
    assert.equal(first.status, 200);
    assert.equal(first.data.name, 'search_diaries');
    assert.ok(calls[0].tools.some(tool => tool.name === 'read_diary'));
    assert.match(calls[0].instructions, /海岛/);
    const finish = await post({ pendingId: first.data.pendingId, context: initial.context, toolOutput: {
      sources: [{ id: 'a', title: '海钓', date: '2031-10-18', trip: '海岛', start: 0, end: 13, quote: '在 Lantern 吃午饭。' }],
      totalMatches: 1, totalEntries: 2, nextOffset: null, complete: true,
    } });
    // Use source text's real JS length; invalid offsets must not be trusted.
    assert.equal(finish.status, 200);
    assert.ok(calls[1].input.some(item => item.type === 'function_call_output'));
  }, [action('search_diaries', { query: '码头 餐厅', fromDate: null, toDate: null, offset: 0 })]);
});

test('pending agent turn cannot change journey during continuation', async () => {
  await fixture(async post => {
    const first = await post(initial);
    assert.equal(first.data.arguments.trip, '海岛');
    const finish = await post({ pendingId: first.data.pendingId, context: { scope: '日本' }, toolOutput: { totalCny: 900 } });
    assert.equal(finish.status, 409);
  }, [action('query_ledger', { metric: 'total' })]);
});

test('out-of-scope model query is a clarification, not an executable action', async () => {
  await fixture(async post => {
    const response = await post(initial);
    assert.equal(response.data.type, 'reply');
    assert.match(response.data.text, /切换旅程/);
  }, [action('query_ledger', { metric: 'total', trip: '日本' })]);
});

test('sources forwarded to the model are bounded and respect the pending journey', async () => {
  await fixture(async (post, calls) => {
    const first = await post(initial);
    const quote = '在 Lantern 吃午饭。';
    const finish = await post({ pendingId: first.data.pendingId, context: initial.context, toolOutput: {
      sources: [
        { id: 'a', date: '2031-10-18', trip: '海岛', title: '海钓', start: 0, end: quote.length, quote, secret: 'strip-me' },
        { id: 'other', date: '2031-10-18', trip: '日本', start: 0, end: 4, quote: '其他旅程' },
      ], totalMatches: 2, nextOffset: null, complete: true,
    } });
    assert.equal(finish.data.sources.length, 1);
    assert.equal(finish.data.sources[0].ref, 1);
    assert.equal(finish.data.sources[0].quote, quote);
    const output = calls[1].input.findLast(item => item.type === 'function_call_output').output;
    assert.ok(!output.includes('strip-me') && !output.includes('其他旅程'));
  }, [action('search_diaries', { query: 'Lantern', offset: 0 })]);
});

test('continuation includes only the function call that the client executed', async () => {
  const response = action('query_ledger', { metric: 'total' });
  response.output.push({ type: 'function_call', name: 'read_diary', call_id: 'unexecuted', arguments: '{"id":"a","offset":0}' });
  await fixture(async (post, calls) => {
    const first = await post(initial);
    await post({ pendingId: first.data.pendingId, context: initial.context, toolOutput: { count: 1, totalCny: 3 } });
    const requested = calls[1].input.filter(item => item.type === 'function_call');
    assert.equal(requested.length, 1);
    assert.equal(requested[0].call_id, 'call-1');
  }, [response]);
});

test('explicit ungrouped destination survives the server-to-browser action boundary', async () => {
  await fixture(async post => {
    const first = await post({ ...initial, context: { ...initial.context, scope: '__all__' } });
    assert.equal(first.data.arguments.expenses[0].trip, '__none__');
  }, [action('add_expenses', { expenses: [{ date: '2031-11-04', category: '餐饮', amount: 3, currency: 'CNY', trip: '__none__' }] })]);
});

test('a clarification after diary retrieval keeps the source evidence', async () => {
  await fixture(async post => {
    const first = await post(initial);
    const quote='在海边吃饭。';
    const finish = await post({ pendingId:first.data.pendingId, context:initial.context, toolOutput:{sources:[{id:'a',title:'海边',date:'2031-10-18',trip:'海岛',start:0,end:quote.length,quote}],complete:true,nextOffset:null} });
    assert.equal(finish.data.sources[0].quote,quote);
    assert.match(finish.data.text,/哪家/);
  }, [action('search_diaries',{query:'海边',offset:0}),action('ask_clarification',{question:'你想找的是哪家？[1]'})]);
});

test('calculator continuations use the checked expression rather than an invented client answer',async()=>{
  await fixture(async(post,calls)=>{
    const first=await post(initial);
    assert.equal(first.data.name,'calculate');
    const finish=await post({pendingId:first.data.pendingId,context:initial.context,toolOutput:{result:999,formatted:'999',unwanted:'not-a-result'}});
    assert.equal(finish.status,200);
    const result=JSON.parse(calls[1].input.findLast(item=>item.type==='function_call_output').output);
    assert.equal(result.result,96);
    assert.equal(result.formatted,'96.00');
    assert.ok(!JSON.stringify(result).includes('not-a-result'));
  },[action('calculate',{expression:'288 / 3',precision:2})]);
});

test('aggregate replies receive the actual query scope rather than a client-provided label',async()=>{
  await fixture(async(post,calls)=>{
    const first=await post(initial);
    await post({pendingId:first.data.pendingId,context:initial.context,toolOutput:{scopeLabel:'全部旅程',dailyAverageCny:460,activeDays:3}});
    const result=JSON.parse(calls[1].input.findLast(item=>item.type==='function_call_output').output);
    assert.equal(result.scopeLabel,'海岛');
    assert.equal(result.dailyAverageCny,460);
  },[action('query_ledger',{metric:'daily_average'})]);
});

test('batch tool preserves incomplete dates and explicitly returns review rather than saved state',async()=>{
  await fixture(async(post,calls)=>{
    const first=await post(initial);
    assert.equal(first.data.name,'prepare_expenses');
    assert.equal(first.data.arguments.expenses[0].date,null);
    const finish=await post({pendingId:first.data.pendingId,context:initial.context,toolOutput:{draftId:'draft-1',readyCount:0,incompleteCount:1,proposedCount:1,addedCount:999}});
    const output=finish.data.review;
    assert.equal(output.requiresReview,true);assert.equal(output.addedCount,undefined);
    assert.match(finish.data.text,/1 笔待补日期/);assert.doesNotMatch(finish.data.text,/待补金额|已入账/);
    assert.equal(calls.length,1,'proposal receipt does not ask the model to restate checked fields');
  },[action('prepare_expenses',{trip:'海岛',expenses:[{date:null,category:'购物',amount:11,currency:'USD',payMethod:'',note:'纪念品',sourceText:'纪念品11刀'}]})]);
});

test('batch date reconciliation uses the original user list across a followup turn',async()=>{
  await fixture(async post=>{
    const first=await post({...initial,messages:[{role:'user',text:'加入海岛账单：小费12刀\n10.20 午餐32刀\n冷萃152拉菲亚'},{role:'assistant',text:'日期不明'},{role:'user',text:'按写的日期和币种记账'}]});
    assert.deepEqual(first.data.arguments.expenses.map(row=>row.date),[null,'2031-10-20','2031-10-20']);
    assert.deepEqual(first.data.arguments.expenses.map(row=>row.amount),[12,32,152]);
  },[action('prepare_expenses',{trip:'海岛',expenses:['小费12刀','午餐32刀','冷萃152拉菲亚'].map(sourceText=>({date:null,category:'其他',amount:null,currency:null,payMethod:'',note:sourceText,sourceText}))})]);
});

test('a deletion must reference actual record IDs retrieved during the same turn',async()=>{
  await fixture(async post=>{
    const response=await post(initial);
    assert.equal(response.data.type,'reply');
    assert.match(response.data.text,/查询|定位/);
  },[action('prepare_delete',{ids:['invented-id'],reason:'删除咖啡豆'})]);
});

test('record query carries IDs into a deletion proposal without claiming deletion',async()=>{
  await fixture(async(post,calls)=>{
    const first=await post(initial);
    const second=await post({pendingId:first.data.pendingId,context:initial.context,toolOutput:{count:1,totalCny:87.43,rows:[{id:'coffee-1',date:'2031-10-20',amount:87.43,currency:'CNY',category:'购物',trip:'海岛',note:'咖啡豆'}]}});
    assert.equal(second.data.name,'prepare_delete');
    assert.equal(second.data.arguments.ids[0],'coffee-1');
    const finish=await post({pendingId:second.data.pendingId,context:initial.context,toolOutput:{proposalId:'p1',matchedCount:1,deletedCount:999}});
    const output=finish.data.review;
    assert.equal(output.requiresConfirmation,true);assert.equal(output.deletedCount,undefined);
    assert.match(finish.data.text,/尚未删除/);assert.equal(calls.length,2);
  },[action('query_ledger',{metric:'records',keyword:'咖啡豆'}),action('prepare_delete',{ids:['coffee-1'],reason:'删除咖啡豆'})]);
});

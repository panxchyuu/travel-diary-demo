// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fn = name => html.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0] || '';

test('assistant history follows the message journey while old chats stay in all journeys', () => {
  assert.ok(fn('messageScope'), 'scope compatibility helper exists');
  const db = { chat: [
    { id: 'old', role: 'user', text: '旧消息' },
    { id: 'j', role: 'user', scope: '日本', text: '日本问题' },
    { id: 's', role: 'user', scope: '海岛', text: '海岛问题' },
    { id: 'answer', role: 'ai', scope: '海岛', text: '海岛回答' },
    { id: 'follow', role: 'user', scope: '日本', text: '那昨天呢' },
  ] };
  const get = runInNewContext(`${fn('messageScope')}\n${fn('currentAgentMessages')}\ncurrentAgentMessages`, { db });
  assert.equal(JSON.stringify(get(db.chat[4])), JSON.stringify([{ role: 'user', text: '日本问题' }, { role: 'user', text: '那昨天呢' }]));
  assert.equal(JSON.stringify(get(db.chat[0])), JSON.stringify([{ role: 'user', text: '旧消息' }]));
});

test('home timeline sorts entries globally and keeps journey filtering', () => {
  assert.ok(fn('timelineEntries'), 'timeline data helper exists');
  const get = runInNewContext(`${fn('timelineEntries')}\ntimelineEntries`, {});
  const entries = [
    { id: 'a', date: '2031-03-02', trip: '日本', title: '东京' },
    { id: 'b', date: '2031-05-01', trip: '青岚岛', title: '海岛' },
    { id: 'c', date: '2031-04-01', trip: '', title: '回家' },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(get(entries, '__all__'))).map(x => x.id), ['b', 'c', 'a']);
  assert.deepEqual(JSON.parse(JSON.stringify(get(entries, '日本'))).map(x => x.id), ['a']);
});

test('journey timeline groups bills and diaries by trip and offers year/tree slices', () => {
  assert.ok(fn('journeyTimelineGroups'), 'journey timeline grouping exists');
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const get = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\n${fn('journeySummary')}\n${fn('journeyTimelineGroups')}\njourneyTimelineGroups`, {});
  const groups = JSON.parse(JSON.stringify(get([
    { date: '2031-10-18', trip: '青岚岛', title: '抵达' },
    { date: '2031-10-20', trip: '青岚岛', title: '返程' },
    { date: '2031-06-03', trip: '云栖城', title: '云栖城一日' },
    { date: '2030-05-08', trip: '青石城', title: '松岚镇' },
  ], [{ date: '2031-10-19', trip: '青岚岛' }], 'all')));
  assert.deepEqual(groups.map(item => item.name), ['青岚岛', '青岚岛', '云栖城', '青石城']);
  assert.deepEqual([groups[0].start, groups[0].end, groups[0].days, groups[0].entries, groups[0].expenses], ['2031-10-20', '2031-10-20', 1, 1, 0]);
  assert.match(groups[1].summary, /抵达/);
  const withDatedBills = JSON.parse(JSON.stringify(get([
    {date:'2031-10-18',trip:'青岚岛',content:'10.18 抵达。10.19 浮潜。10.20 返程。'},
  ], [
    {date:'2031-10-18',trip:'青岚岛',amount:10,note:'早餐'},
    {date:'2031-10-19',trip:'青岚岛',amount:20,note:'午餐'},
    {date:'2031-10-19',trip:'青岚岛',amount:30,note:'船票'},
    {date:'2031-10-20',trip:'青岚岛',amount:40,note:'机场水'},
  ], 'all')));
  assert.deepEqual(withDatedBills.map(item=>[item.start,item.end,item.expenses]), [
    ['2031-10-18','2031-10-20',4],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(get([
    { date: '2031-10-18', trip: '青岚岛' }, { date: '2030-05-08', trip: '青石城' },
  ], [], '2030'))).map(item => item.name), ['青石城']);
});

test('journey duration reads all dates from long diary text and rolls over years', () => {
  const rangeFn = fn('entryDateRange');
  assert.ok(rangeFn, 'diary date range parser exists');
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const parse = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${rangeFn}\nentryDateRange`, {});
  const actual = JSON.parse(JSON.stringify(parse({date:'2030-12-30',trip:'跨年',content:'12.30 抵达。12月31日游览。1.1 返程。'})));
  assert.deepEqual(actual, ['2030-12-30','2030-12-31','2031-01-01']);
});

test('four-digit reverse-order day headings in a long diary produce the full trip span', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const parse = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\nentryDateRange`, {});
  const dates = JSON.parse(JSON.stringify(parse({date:'2031-10-15',trip:'青岚岛',content:'1019\n末日活动。\n1018\n环岛。\n1017\n出发。\n1016\n浮潜。\n1015\n抵达。'})));
  assert.deepEqual(dates, ['2031-10-15','2031-10-16','2031-10-17','2031-10-18','2031-10-19']);
});

test('journey card summary uses model summary when the diary title is blank', () => {
  assert.ok(fn('journeySummary'), 'journey summary resolver exists');
  const resolve = runInNewContext(`${fn('journeySummary')}\njourneySummary`, {});
  assert.equal(resolve([{title:'',aiInsights:{result:{summary:'五天在星湾城、明澜岛与望潮岛之间往返，体验浮潜和海钓。'}}}], []), '五天在星湾城、明澜岛与望潮岛之间往返，体验浮潜和海钓。');
});

test('journey summary omits generic model placeholders', () => {
  const resolve = runInNewContext(`${fn('journeySummary')}\njourneySummary`, {});
  assert.equal(resolve([{title:'',aiInsights:{result:{summary:'原文未记录实际行程内容。',tripSummary:'',generatedTitle:''}}}], []), '');
});

test('generic AI headings are replaced by a useful one-line journey summary', () => {
  const resolve = runInNewContext(`${fn('journeySummary')}\njourneySummary`, {});
  assert.equal(resolve([{title:'',aiInsights:{result:{generatedTitle:'行程',tripSummary:'行程',summary:'行程',itinerary:[{event:'游览拜将坛'},{event:'沿云栖河散步'},{event:'参观古汉台'}]}}}], []), '一场游览拜将坛、沿云栖河散步、参观古汉台的旅行。');
});

test('generic generated diary titles are not shown as diary themes', () => {
  const resolve = runInNewContext(`${fn('diaryDisplayTitle')}\ndiaryDisplayTitle`, {});
  assert.equal(resolve({title:'',generatedTitle:'行程'}), '');
  assert.equal(resolve({title:'',generatedTitle:'云栖河边的秋日漫游'}), '云栖河边的秋日漫游');
});

test('diary cards use the parsed content date instead of a conflicting save date', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const resolve = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\n${fn('diaryDisplayDate')}\ndiaryDisplayDate`, {});
  assert.equal(resolve({date:'2031-11-29',content:'10.29 从南岚城飞往太原。11.02 返回南岚城。'}), '2031-10-29 — 2031-11-02');
});

test('separate diary ranges for one journey are not stretched into one continuous trip duration', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const get = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\n${fn('journeySummary')}\n${fn('journeyTimelineGroups')}\njourneyTimelineGroups`, {});
  const result = JSON.parse(JSON.stringify(get([
    {date:'2031-10-03',trip:'云栖城',content:'10.03 到达。',aiInsights:{result:{tripStartDate:'2031-10-03',tripEndDate:'2031-10-05',tripSummary:'三天在云栖城旅行。'}}},
    {date:'2031-11-08',trip:'云栖城',content:'11.08 再次到访。',aiInsights:{result:{tripStartDate:'2031-11-08',tripEndDate:'2031-11-09',tripSummary:'两天在云栖城再次旅行。'}}},
  ], [], 'all')));
  assert.deepEqual(result.map(item=>[item.start,item.end,item.days]), [['2031-11-08','2031-11-09',2],['2031-10-03','2031-10-05',3]]);
});

test('model-parsed diary range takes precedence over single-day fallback', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const parse = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\nentryDateRange`, {});
  const dates = JSON.parse(JSON.stringify(parse({date:'2031-10-15',content:'1019活动。1018岛上游览。',aiInsights:{result:{tripStartDate:'2031-10-15',tripEndDate:'2031-10-19'}}})));
  assert.deepEqual(dates,['2031-10-15','2031-10-19']);
});

test('explicit multi-day diary headings override a conflicting model end date', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const parse = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\nentryDateRange`, {});
  const dates = JSON.parse(JSON.stringify(parse({date:'2031-10-03',content:'10.03 抵达云栖城。10.04 游览云栖河。10.05 返回南岚城。',aiInsights:{result:{tripStartDate:'2031-10-03',tripEndDate:'2031-10-08'}}})));
  assert.deepEqual(dates,['2031-10-03','2031-10-04','2031-10-05']);
});

test('manual journey end date takes precedence over dates embedded in diary text', () => {
  const dayRe = html.match(/const DAY_RE = [^;]+;/)?.[0] || '';
  const parse = runInNewContext(`${fn('splitSentences')}\n${dayRe}\n${fn('dayMarker')}\n${fn('entryDateRange')}\nentryDateRange`, {});
  const actual = JSON.parse(JSON.stringify(parse({date:'2031-10-18',endDate:'2031-10-22',content:'10.19 到达。10.25 离开。'})));
  assert.deepEqual(actual, ['2031-10-18','2031-10-22']);
});

test('recent ledger totals follow the active journey', () => {
  assert.ok(fn('matchesTravelScope'), 'scope filtering helper exists');
  const elements = { chatRecentItems: { innerHTML: '' }, chatRecentTitle: { textContent: '' } };
  runInNewContext(`${fn('matchesTravelScope')}\n${fn('scopeLabel')}\n${fn('renderChatRecent')}\nrenderChatRecent()`, {
    selectedScope: '海岛', db: { expenses: [{ date: '2031-10-18', amount: 12, trip: '海岛', note: '午饭' }, { date: '2031-10-18', amount: 90, trip: '日本', note: '其他旅程' }] },
    document: { getElementById: id => elements[id] }, esc: value => value || '', fmtMoney: value => String(value), curSym: () => '¥', toCNY: row => row.amount,
  });
  assert.match(elements.chatRecentTitle.textContent, /12/);
  assert.doesNotMatch(elements.chatRecentItems.innerHTML, /其他旅程/);
});

test('source verification detects edited or deleted diary references', () => {
  assert.ok(fn('resolveDiarySource'), 'source verification exists');
  const resolve = runInNewContext(`${fn('resolveDiarySource')}\nresolveDiarySource`);
  const source = { id: 'a', start: 0, end: 4, quote: '在海边吃' };
  assert.equal(resolve([{ id: 'a', content: '在海边吃午饭' }], source).status, 'current');
  assert.equal(resolve([{ id: 'a', content: '改成别的内容' }], source).status, 'changed');
  assert.equal(resolve([], source).status, 'deleted');
  assert.equal(resolve([{ id:'a',trip:'新旅程',content:'在海边吃午饭' }], {...source,trip:'旧旅程'}).status,'changed');
  assert.equal(resolve([{ id:'a',date:'2031-10-19',content:'在海边吃午饭' }], {...source,entryDate:'2031-10-18'}).status,'changed');
});

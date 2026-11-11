// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
const memory = await import('../memory-core.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const entries = [
  { id: 'a', date: '2031-10-18', trip: '海岛', title: '海钓的一天', content: '上午去海钓。\n回到码头，在 Lantern 吃午饭，咖喱很好吃。\n下午去海滩散步。' },
  { id: 'b', date: '2031-10-19', trip: '海岛', title: '慢下来', content: '吃早餐后坐船去了机场。记得提前确认船班。' },
  { id: 'c', date: '2031-10-18', trip: '日本', title: '码头', content: '在码头边的 Sushi 吃午饭。' },
];

test('diary search retrieves exact source text and excludes other journeys', () => {
  assert.equal(typeof memory.searchDiaries, 'function');
  const result = memory.searchDiaries(entries, { query: '码头 餐厅 午饭', offset: 0 }, '海岛');
  assert.equal(result.sources[0].id, 'a');
  assert.ok(!result.sources.some(source => source.id === 'c'));
  for (const source of result.sources) assert.equal(source.quote, entries.find(entry => entry.id === source.id).content.slice(source.start, source.end));
});

test('search returns no invented fallback matches and re-reads edited source', () => {
  assert.equal(typeof memory.searchDiaries, 'function');
  assert.equal(memory.searchDiaries(entries, { query: '不存在的专名 XYZABC' }, '海岛').sources.length, 0);
  const edited = entries.map(entry => entry.id === 'a' ? { ...entry, content: '已改成另一篇' } : entry);
  assert.equal(memory.searchDiaries(edited, { query: 'Lantern' }, '海岛').sources.length, 0);
});

test('overview pagination covers long diaries completely without truncation claims', () => {
  assert.equal(typeof memory.searchDiaries, 'function');
  const content = '很长的原始记录。'.repeat(5000);
  const input = [{ id: 'long', date: '2031-10-18', trip: '海岛', content }];
  let offset = 0, all = '', pages = 0;
  do {
    const page = memory.searchDiaries(input, { query: '', offset }, '海岛');
    assert.ok(JSON.stringify(page).length < 16000);
    all += page.sources.map(source => source.quote).join('');
    offset = page.nextOffset;
    pages++;
    if (offset !== null) assert.equal(page.complete, false);
  } while (offset !== null && pages < 100);
  assert.ok(pages > 1);
  assert.equal(all, content);
});

test('read diary refuses out-of-scope records and supports exact-offset continuation', () => {
  assert.equal(typeof memory.readDiary, 'function');
  assert.equal(memory.readDiary(entries, { id: 'c', offset: 0 }, '海岛').sources.length, 0);
  const result = memory.readDiary(entries, { id: 'a', offset: 4 }, '海岛');
  assert.equal(result.sources[0].quote, entries[0].content.slice(4));
  assert.equal(result.complete, true);
});

test('multi-day diary headings participate in date filtering', () => {
  assert.equal(typeof memory.searchDiaries, 'function');
  const input = [{ id: 'days', date: '2031-10-18', trip: '海岛', content: '10.18\n吃了午饭。\n10.19\n坐船去了机场。' }];
  const result = memory.searchDiaries(input, { query: '', fromDate: '2031-10-19', toDate: '2031-10-19' }, '海岛');
  assert.ok(result.sources.some(source => source.quote.includes('机场')));
  assert.ok(result.sources.every(source => !source.quote.includes('午饭')));
});

test('query validation rejects invalid dates and negative pagination', () => {
  assert.equal(typeof memory.validateDiaryQuery, 'function');
  assert.throws(() => memory.validateDiaryQuery({ fromDate: '2031-02-30' }), /日期/);
  assert.throws(() => memory.validateDiaryQuery({ offset: -1 }), /分页/);
});

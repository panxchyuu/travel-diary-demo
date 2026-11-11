import { matchesScope } from './agent-core.mjs';

const CHUNK_SIZE = 1200;
const PAGE_SIZE = 6;

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateDiaryQuery(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('日记查询无效');
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('日记分页位置无效');
  for (const key of ['fromDate', 'toDate']) {
    if (input[key] != null && !validDate(input[key])) throw new Error('日记查询日期无效');
  }
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) throw new Error('日记查询日期范围无效');
  return {
    query: typeof input.query === 'string' ? input.query.trim().slice(0, 500) : '',
    fromDate: input.fromDate || null, toDate: input.toDate || null, offset,
  };
}

export function validateDiaryRead(input = {}) {
  if (typeof input.id !== 'string' || !input.id || input.id.length > 100) throw new Error('日记编号无效');
  const { offset } = validateDiaryQuery({ offset: input.offset });
  return { id: input.id, offset };
}

function source(entry, start, end, date = entry.date) {
  return { id: entry.id, title: (entry.title || '未命名日记').slice(0, 160), date, entryDate: entry.date, trip: (entry.trip || '').trim().slice(0, 80), start, end, quote: entry.content.slice(start, end) };
}

// Preserve exact offsets, including whitespace, so references can highlight original text.
function segments(entry) {
  const text = entry.content;
  const sections = [{ start: 0, date: entry.date }];
  const datePattern = /^(?:(\d{4})[-/.年])?(\d{1,2})[./月-](\d{1,2})(?:[日号])?(?=\s|$|[，,:：])/gm;
  let match;
  while ((match = datePattern.exec(text))) {
    const date = `${match[1] || entry.date?.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    if (validDate(date)) {
      if (match.index === 0) sections[0].date = date;
      else sections.push({ start: match.index, date });
    }
  }
  const chunks = [];
  sections.forEach((section, index) => {
    const limit = sections[index + 1]?.start ?? text.length;
    for (let start = section.start; start < limit;) {
      let end = Math.min(start + CHUNK_SIZE, limit);
      if (end < limit) {
        const snippet = text.slice(start, end);
        const breakAt = Math.max(snippet.lastIndexOf('\n'), snippet.lastIndexOf('。'));
        if (breakAt > CHUNK_SIZE / 2) end = start + breakAt + 1;
      }
      chunks.push(source(entry, start, end, section.date));
      start = end;
    }
  });
  return chunks;
}

function keywords(query) {
  const segments = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(query)].filter(item => item.isWordLike).map(item => item.segment)
    : query.split(/[\s,，、;；]+/);
  const stop = new Set(['我','的','了','在','是','有','那','那个','哪','什么','哪里','怎么','一下','帮','帮我','请','日记','旅行','旅程','记得','不','上次','我们','之前','以及']);
  return [...new Set([...query.split(/[\s,，、;；]+/), ...segments].map(word => word.toLocaleLowerCase()).filter(word => word.length > 1 && !stop.has(word)))];
}

export function searchDiaries(entries, input = {}, scope = '__all__') {
  const args = validateDiaryQuery(input);
  const inScope = (Array.isArray(entries) ? entries : []).filter(entry => entry && typeof entry.content === 'string' && matchesScope(entry, scope));
  const terms = keywords(args.query);
  let candidates = inScope.flatMap(segments).filter(item => (!args.fromDate || item.date >= args.fromDate) && (!args.toDate || item.date <= args.toDate));
  if (args.query) {
    candidates = candidates.map(item => {
      const text = `${item.title}\n${item.quote}`.toLocaleLowerCase();
      return { item, score: terms.reduce((sum, term) => sum + (text.includes(term) ? Math.min(term.length, 12) : 0), 0) };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.item.date.localeCompare(b.item.date) || a.item.id.localeCompare(b.item.id) || a.item.start - b.item.start).map(item => item.item);
  } else candidates.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id) || a.start - b.start);
  const sources = candidates.slice(args.offset, args.offset + PAGE_SIZE);
  const nextOffset = args.offset + sources.length < candidates.length ? args.offset + sources.length : null;
  return { sources, totalMatches: candidates.length, totalEntries: inScope.length, nextOffset, complete: nextOffset === null, mode: args.query ? 'search' : 'overview' };
}

export function readDiary(entries, input, scope = '__all__') {
  const args = validateDiaryRead(input);
  const entry = (Array.isArray(entries) ? entries : []).find(item => item.id === args.id && matchesScope(item, scope));
  if (!entry || typeof entry.content !== 'string') return { sources: [], found: false, nextOffset: null, complete: true };
  const end = Math.min(args.offset + CHUNK_SIZE * PAGE_SIZE, entry.content.length);
  const sources = args.offset < end ? [source(entry, args.offset, end)] : [];
  return { sources, found: true, nextOffset: end < entry.content.length ? end : null, complete: end >= entry.content.length };
}

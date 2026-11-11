// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

test('manual ledger currency selector is populated during startup', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'inline app script exists');

  const renderer = script.match(/function renderCurrencyOptions\(\)\{[\s\S]*?\n\}/)?.[0];
  const startup = script.match(/\/\* 初始化预算\/汇率输入 \*\/\s*(\(function\(\)\{[\s\S]*?\}\)\(\);)/)?.[1];
  assert.ok(renderer, 'currency option renderer exists');
  assert.ok(startup, 'startup initializer exists');

  const elements = {
    budgetInput: { value: '' },
    expCurrency: { innerHTML: '', value: '' },
  };
  runInNewContext(`${renderer}\n${startup}`, {
    document: { getElementById: id => elements[id] },
    CURRENCY_DEFS: { CNY: { sym: '¥', name: '人民币' }, USD: { sym: '$', name: '美元' } },
    db: { budget: null },
    renderRates() {},
  });

  assert.match(elements.expCurrency.innerHTML, /<option value="CNY">/);
  assert.equal(elements.expCurrency.value, 'CNY');
});

test('ledger assistant copy matches its controls and configured model service', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(html.includes('还没有账单，可以在此输入或语音记一笔。'), 'empty state describes chat and voice controls');
  assert.ok(html.includes('日记与账单保存在本机 · 相关内容发送到已配置的模型服务'), 'footnote explains source data and the configured provider');
  assert.ok(html.includes("health.modelStatus==='connected'"), 'status reflects an actual provider connection test');
  assert.ok(!html.includes('对话通过本机 Codex 配置请求模型服务'), 'footnote does not claim Codex when another provider is configured');
});

test('journey management exposes reversible remove and restore actions with record counts', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(html.includes('id="manageJourneys"'), 'journey controls are discoverable beside the trip filters');
  assert.ok(html.includes('id="journeyManageDialog"'), 'journey management has a dedicated mobile-friendly sheet');
  assert.ok(html.includes('移除后内容会暂存在“最近移除”'), 'the recovery behavior is explained before removal');
  assert.ok(html.includes('data-archive-trip'), 'active trips can be archived');
  assert.ok(html.includes('data-restore-trip'), 'archived trips can be restored');
  assert.ok(html.includes('function archiveSelectedTrip('), 'the selected trip removal path is explicit');
  assert.ok(html.includes('function tripRecordCounts('), 'management displays diary, bill, and chat counts');
  assert.ok(html.includes('selectedScope===name'), 'removing the selected trip safely returns to all journeys');
});

test('journey archive actions are wired before interactive controls render', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.ok(script.includes('window.archiveTripRecords=(db,name)=>'), 'archive helper is available without relying on an unserved module');
  assert.ok(script.includes("document.getElementById('manageJourneys').onclick="), 'management trigger opens the journey sheet');
  assert.ok(script.includes("document.getElementById('journeyManageDialog').addEventListener('click'"), 'remove and restore controls are delegated from the sheet');
  const css = readFileSync(fileURLToPath(new URL('../journal-ui.css', import.meta.url)), 'utf8');
  assert.ok(css.includes('@media(max-width:600px){\n  .journey-manage-dialog{position:fixed'), 'journey sheet uses a phone-sized bottom drawer');
});

test('diary extraction requests model-generated insights and identifies the privacy flow', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(html.includes("fetch('/api/diary/insights'"), 'diary analysis calls the server-side model endpoint');
  assert.ok(html.includes('insights.expenses'), 'expense extraction uses expenses returned by the model');
  assert.ok(html.includes('id="aiDiaryExpenseSection"'), 'model expenses update the review-before-import section');
  assert.ok(!html.includes('_pendingExp = parseDiaryExpenses(e.content, e.date)'), 'opening insights does not use local rules as the expense extraction source');
  assert.ok(html.includes('正在提炼…'), 'diary analysis shows work in progress');
  assert.ok(html.includes('花费需核对后才会入账'), 'diary analysis explains that extracted expenses require review');
  assert.ok(html.includes('itinerary-board'), 'itinerary results use the professional timeline board');
  assert.ok(html.includes('duration'), 'itinerary cards can show duration');
  assert.ok(html.includes('function cleanInsightText('), 'insight copy removes diary meta language');
  assert.ok(html.includes('记录中出现'), 'insight copy handles record meta language');
});

test('diary insights are reused until the source changes or the user explicitly reruns extraction', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const sourceKey = script.match(/function diaryInsightSourceKey\(entry\)\{[\s\S]*?\n\}/)?.[0] || '';
  const cacheCheck = script.match(/function hasReusableDiaryInsights\(entry,\s*force\)\{[\s\S]*?\n\}/)?.[0] || '';
  const show = script.match(/function showAI\(id,\s*force=false\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(sourceKey && cacheCheck && show, 'cache identity, reuse, and display handlers exist');
  const cache = runInNewContext(`${sourceKey}\n${cacheCheck}\n({ diaryInsightSourceKey, hasReusableDiaryInsights })`);
  const entry = { id: 'diary-1', title: '海岛行程', date: '2031-10-18', trip: '明澜岛', content: '海钓后在岛上吃饭。' };
  entry.aiInsights = { sourceKey: cache.diaryInsightSourceKey(entry), result: { summary: '已生成的提要' } };
  assert.equal(cache.hasReusableDiaryInsights(entry, false), true, 'opening an unchanged diary can reuse its saved result');
  assert.equal(cache.hasReusableDiaryInsights(entry, true), false, 'explicit rerun bypasses the saved result');
  assert.equal(cache.hasReusableDiaryInsights({ ...entry, content: '海钓后在岛上吃饭并看日落。' }, false), false, 'edited diary content invalidates its saved result');
  const elements = Object.fromEntries(['aiContent','aiOriginalCopy','aiSummaryCopy','aiItineraryCopy','aiXhsCopyButton','aiMask'].map(id=>[id,{innerHTML:'',classList:{add(){}}}]));
  let rendered=0, requested=0;
  const openInsight=runInNewContext(`${sourceKey}\n${cacheCheck}\n${show}\nshowAI`, {
    db: { entries: [entry] },
    document: { getElementById: id=>elements[id] },
    esc: value=>String(value||''),
    renderDiaryExpenseSection: ()=>'<div></div>',
    renderDiaryInsights: ()=>{ rendered++; },
    requestDiaryInsights: ()=>{ requested++; },
    _aiCurId: null, _pendingExp: [], _diaryExpensesState: 'loading',
    copyText(){},
  });
  openInsight(entry.id);
  assert.deepEqual([rendered,requested],[1,0], 'opening a cached diary renders locally without a model request');
  openInsight(entry.id,true);
  assert.deepEqual([rendered,requested],[1,1], 'the explicit rerun requests a fresh model result');
  assert.ok(/onclick="showAI\(_aiCurId, true\)"/.test(html), 'the rerun control explicitly bypasses the cache');
  assert.ok(/hasReusableDiaryInsights\(e,\s*force\)/.test(script), 'normal openings only request a model result when no matching cache exists');
});

test('saving a diary automatically starts background extraction and entry titles stay explicit', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const saveHandler = script.match(/document\.getElementById\('saveDiary'\)\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\};/)?.[0] || '';
  assert.match(saveHandler, /queueDiaryInsights\(/, 'a saved or edited entry starts background extraction');
  assert.ok(script.includes('function queueDiaryInsights('), 'background extraction can run without opening the insight modal');
  assert.match(script, /function diaryDisplayTitle\(/, 'generic model titles are filtered before showing a diary theme');
  assert.match(html, /journeySummary\(\[e\],\[\]\s*\)/, 'untitled diary cards show a factual one-line summary when available');
  assert.match(script, /aiInsightsState/, 'entry cards expose extraction progress');
  assert.match(html, /重新提炼/, 'the insight view retains an explicit manual rerun action');
});

test('diary editor supports a date range and validates the optional end date', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const saveHandler = script.match(/document\.getElementById\('saveDiary'\)\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\};/)?.[0] || '';
  const editHandler = script.match(/function editEntry\(id\)\{[\s\S]*?\n\}/)?.[0] || '';
  const resetHandler = script.match(/function resetEditor\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(html, /id="diaryDate"[^]*id="diaryEndDate"/, 'editor has start and end date controls');
  assert.match(saveHandler, /validDiaryEndDate\(date,requestedEndDate\)/, 'save validates an explicitly selected end date');
  assert.match(saveHandler, /endDate===null/, 'reversed or malformed ranges are rejected');
  assert.match(saveHandler, /if\(endDate\)e\.endDate=endDate;else delete e\.endDate/, 'editing a single-day entry removes a stale end date');
  assert.match(editHandler, /diaryEndDate'\)\.value = e\.endDate\|\|''/, 'editing restores the saved range');
  assert.match(resetHandler, /diaryEndDate'\)\.value=''/, 'reset clears the optional end date');
  const css = readFileSync(fileURLToPath(new URL('../journal-ui.css', import.meta.url)), 'utf8');
  assert.match(css, /\.diary-date-row\{display:grid;grid-template-columns:/, 'date range has a stable desktop layout');
  assert.match(css, /\.diary-title-field\{grid-column:1\/-1\}/, 'mobile form gives the title a full row');
});

test('mobile diary cards use one column and keep headings readable', () => {
  const css = readFileSync(fileURLToPath(new URL('../journal-ui.css', import.meta.url)), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?#entryList\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/, 'diary cards switch to one full-width column on phones');
  assert.match(css, /\.entry-card-title-row \.entry-title\s*\{[^}]*overflow-wrap:\s*anywhere/, 'long titles wrap without squeezing the card');
});

test('itinerary output removes diary meta phrasing and guide headings render when attached to prose', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const cleanInsightText = script.match(/function cleanInsightText\(value\)\{[\s\S]*?\n\}/)?.[0] || '';
  const cleanItineraryText = script.match(/function cleanItineraryText\(value\)\{[\s\S]*?\n\}/)?.[0] || '';
  const renderTravelGuide = script.match(/function renderTravelGuide\(text\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(cleanInsightText && cleanItineraryText && renderTravelGuide, 'insight formatters exist');
  const result = runInNewContext(`${cleanInsightText}\n${cleanItineraryText}\n${renderTravelGuide}\n({ cleanItineraryText, renderTravelGuide })`, {
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  });
  assert.equal(result.cleanItineraryText('日记中写了：在星湾城机场休息一小时。'), '在星湾城机场休息一小时。');
  const guide = result.renderTravelGuide('星湾城机场转机，预留轮渡时间。 ## 值得体验\n- 机场 AC Room 可短暂休息');
  assert.match(guide, /<h4 class="guide-heading">值得体验<\/h4>/);
  assert.doesNotMatch(guide, /## 值得体验/);
});

test('diary insights use a new cache version and do not render model advice as trip facts', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const sourceKey = script.match(/function diaryInsightSourceKey\(entry\)\{[\s\S]*?\n\}/)?.[0] || '';
  const render = script.match(/function renderDiaryInsights\(id,insights,reused=false\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(sourceKey && render, 'versioned cache key and insight renderer exist');
  assert.match(sourceKey, /travel-insights-v4/, 'older results without model-derived trip range are invalidated');
  assert.doesNotMatch(render, /cleanTips|旅行建议|实用提示/, 'model-generated tips are not shown as part of the trip');
  assert.doesNotMatch(html, /实用提示/, 'itinerary cards do not label generated notes as advice');
  assert.match(html, /itinerary-day-header/, 'the itinerary is rendered as a day-by-day route');
});

test('professional itinerary uses numbered route stops when exact times are unavailable', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(html.includes('itinerary-stop-index'), 'itinerary cards have a visual route sequence marker');
  assert.ok(html.includes('itinerary-day-header'), 'each date has a clear itinerary heading');
  assert.ok(html.includes('itinerary-stop-card'), 'each itinerary stop uses the redesigned card');
  assert.ok(html.includes('String(stopIndex+1)'), 'route sequence marker is numbered when time is missing');
  assert.ok(!html.includes(":'<span>—</span>'"), 'missing time is not rendered as a dash');
});

test('itinerary shows a route overview above the stop details', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const routeOverview = script.match(/function itineraryRouteOverview\(rows\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(routeOverview, 'route overview has a focused renderer');
  const render = runInNewContext(`${routeOverview}\nitineraryRouteOverview`, {
    cleanItineraryText: value => String(value || '').trim(),
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  });
  const output = render([
    { place: 'Cloud Table' }, { place: '星湾城机场' }, { place: '星湾城机场' }, { place: '星湾城市区' }, { place: '星湾城机场' },
  ]);
  assert.match(output, /class="itinerary-route-overview"/);
  assert.match(output, /Cloud Table.*星湾城机场.*星湾城市区.*星湾城机场/);
  assert.equal((output.match(/class="itinerary-route-stop"/g) || []).length, 4);
  const routeOutput = render([{ place: 'Cloud Table' }, { place: '海边 → 星湾城机场' }]);
  assert.match(routeOutput, /Cloud Table → 星湾城机场/);
  assert.doesNotMatch(routeOutput, /海边/);
});

test('voyage pages group diaries by trip and support pasting expenses for a selected trip', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const server = readFileSync(fileURLToPath(new URL('../server.mjs', import.meta.url)), 'utf8');
  assert.ok(html.includes('id="diaryTripNav"'), 'diary view exposes trip-first navigation');
  assert.ok(html.includes('id="expenseExtractForm"'), 'ledger has a dedicated text extraction form');
  assert.ok(html.includes('id="extractTrip"'), 'bulk expense extraction pins records to a selected journey');
  assert.ok(html.includes('function extractExpensesFromText('), 'bulk extraction uses the model review workflow');
  assert.ok(html.includes('function renderExpenseImportPreview('), 'extracted expenses are reviewed before saving');
  assert.ok(server.includes('旅行攻略') && server.includes('行程路线') && !server.includes('xhsCopy 控制在 180 字内'), 'model prompt asks for a structured travel guide without an arbitrary short limit');
  assert.ok(server.includes('不同地点、活动、交通分别列出') && !server.includes('每天最多4个重要节点'), 'model prompt preserves each distinct itinerary event');
  assert.ok(server.includes('机场休息区不是住宿') && server.includes('住宿须明确过夜'), 'model prompt distinguishes temporary rest from accommodation');
  assert.ok(server.includes('不用“日记中提到”等元话术'), 'model prompt forbids diary meta language');
  assert.ok(html.includes('function renderTravelGuide('), 'model guide is rendered with readable section hierarchy');
  assert.ok(html.includes('xhsNode.innerHTML=renderTravelGuide(cleanGuide)'), 'model guide is the only rendered Xiaohongshu result');
  assert.ok(!html.includes('当前显示的是本地规则结果'), 'model failure does not leave a misleading heuristic result visible');
  assert.ok(html.includes('重新提炼'), 'the insight modal supports rerunning the model');
});

test('mobile ledger exposes one-paste expense import as a primary action', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const css = readFileSync(fileURLToPath(new URL('../journal-ui.css', import.meta.url)), 'utf8');
  const actionBar = html.match(/<div class="ledger-action-bar"[\s\S]*?<\/div>/)?.[0] || '';
  assert.doesNotMatch(actionBar, /expenseTextButton|粘贴记账/, 'bulk paste is opened from inside manual entry instead of duplicating the action outside');
  assert.ok(html.includes('<dialog id="textExpenseComposer"'), 'text import opens in a dedicated mobile composer');
  assert.ok(html.includes('id="openExpenseTextFromComposer"'), 'manual entry offers a direct switch to multi-item paste');
  assert.match(html, /id="expenseExtractForm"/, 'the existing extraction form remains available');
  assert.ok(html.includes("document.getElementById('openExpenseTextFromComposer').onclick"), 'the manual composer opens the paste workflow');
  assert.ok(html.includes('function openTextExpenseComposer('), 'opening the composer is an explicit action');
  assert.ok(html.includes("tripInput.value=selectedScope"), 'the selected journey is prefilled when available');
  assert.ok(html.includes('async function extractExpensesFromText(') && html.includes('function importTextExpenses('), 'model results still require per-item review before saving');
  assert.match(css, /\.text-expense-composer[\s\S]*@media\(max-width:600px\)[\s\S]*\.text-expense-composer/, 'text import uses a phone-sized bottom sheet');
});

test('the main navigation removes the data page and puts exports beside their content', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const diary = html.match(/<section id="view-diary"[\s\S]*?<\/section>/)?.[0] || '';
  const expense = html.match(/<section id="view-expense"[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(!html.includes('data-tab="settings"'), 'there is no separate data tab');
  assert.ok(!html.includes('id="view-settings"'), 'the unused data page is removed');
  assert.ok(diary.includes('id="exportDiaryMD"'), 'diary export lives with diary content');
  assert.ok(expense.includes('id="exportCSV"'), 'ledger export lives with ledger content');
  assert.ok(!html.includes('id="exportJSON"'), 'the data page backup export is removed');
});

test('diary merge opens a direct target picker instead of a two-step merge mode', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.ok(html.includes('id="mergeModal"'), 'merge has a dedicated dialog');
  assert.ok(html.includes('id="mergeTarget"'), 'the dialog lets the user choose the target diary');
  assert.ok(html.includes('function openMergeDialog('), 'a single action opens the target picker');
  assert.ok(html.includes('function confirmMerge('), 'the dialog has one explicit merge action');
  assert.ok(html.includes('两篇旅程不同，合并后归入'), 'cross-trip destination is explained before merging');
  assert.ok(!html.includes('function mergePick('), 'the confusing two-step selection state is removed');
  assert.ok(!html.includes('function mergeDo('), 'target selection no longer depends on a card action');
});

test('diary and ledger trip suggestions use the same trip names', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  const updateDiaryList = html.match(/function updateTripList\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  const updateLedgerList = html.match(/function updateExpTripList\(\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(updateDiaryList.includes('allTripNames()'), 'diary suggestions include trips first created in ledger');
  assert.ok(updateLedgerList.includes('allTripNames()'), 'ledger suggestions include trips first created in diary');
  assert.ok(html.includes('旅程会同步出现在游记与花费中'), 'the form explains that both areas share journeys');
});

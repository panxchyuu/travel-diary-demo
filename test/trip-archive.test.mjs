// All records in this file are fictional fixtures for automated checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTrip, restoreTrip } from '../trip-archive.mjs';

test('archiving a trip hides it while preserving its diaries, expenses, and scoped chat for recovery', () => {
  const db = {
    entries: [{ id: 'diary-1', trip: '青岚岛' }, { id: 'diary-2', trip: '日本' }],
    expenses: [{ id: 'bill-1', trip: '青岚岛' }, { id: 'bill-2', trip: '日本' }],
    chat: [{ id: 'chat-1', scope: '青岚岛' }, { id: 'chat-2', scope: '日本' }],
    archivedTrips: [],
  };
  const result = archiveTrip(db, '青岚岛', { id: 'archive-1', now: 123 });

  assert.equal(result.archived.id, 'archive-1');
  assert.equal(result.archived.counts.entries, 1);
  assert.equal(result.archived.counts.expenses, 1);
  assert.equal(result.archived.counts.chat, 1);
  assert.deepEqual(result.db.entries.map(item => item.id), ['diary-2']);
  assert.deepEqual(result.db.expenses.map(item => item.id), ['bill-2']);
  assert.deepEqual(result.db.chat.map(item => item.id), ['chat-2']);
  assert.equal(db.entries.length, 2, 'the original state remains unchanged until saved');
});

test('restoring a trip brings all records back without duplicating already-present IDs', () => {
  const db = {
    entries: [{ id: 'diary-1', trip: '青岚岛' }],
    expenses: [{ id: 'bill-1', trip: '青岚岛' }],
    chat: [{ id: 'chat-1', scope: '青岚岛' }],
    archivedTrips: [{ id: 'archive-1', name: '青岚岛', entries: [{ id: 'diary-1', trip: '青岚岛' }, { id: 'diary-2', trip: '青岚岛' }], expenses: [{ id: 'bill-1', trip: '青岚岛' }], chat: [{ id: 'chat-1', scope: '青岚岛' }, { id: 'chat-2', scope: '青岚岛' }] }],
  };
  const result = restoreTrip(db, 'archive-1');

  assert.deepEqual(result.db.entries.map(item => item.id), ['diary-1', 'diary-2']);
  assert.deepEqual(result.db.expenses.map(item => item.id), ['bill-1']);
  assert.deepEqual(result.db.chat.map(item => item.id), ['chat-1', 'chat-2']);
  assert.deepEqual(result.db.archivedTrips, []);
});

test('archiving requires an active journey and never touches other journeys', () => {
  const db = { entries: [{ id: 'diary-1', trip: '日本' }], expenses: [], chat: [], archivedTrips: [] };
  assert.throws(() => archiveTrip(db, '青岚岛'), /找不到这段旅程/);
  assert.deepEqual(db.entries, [{ id: 'diary-1', trip: '日本' }]);
});

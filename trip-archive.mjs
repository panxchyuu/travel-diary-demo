const normalizeName = value => typeof value === 'string' ? value.trim() : '';
const recordId = (record, index) => record?.id || `legacy-${index}`;

export function archiveTrip(db, name, { id = globalThis.crypto?.randomUUID?.() || `archive-${Date.now()}`, now = Date.now() } = {}) {
  const trip = normalizeName(name);
  if (!trip || ['__all__', '__none__'].includes(trip)) throw new Error('请选择一段具体旅程。');
  const entries = Array.isArray(db.entries) ? db.entries : [];
  const expenses = Array.isArray(db.expenses) ? db.expenses : [];
  const chat = Array.isArray(db.chat) ? db.chat : [];
  const archivedTrips = Array.isArray(db.archivedTrips) ? db.archivedTrips : [];
  const matchesTrip = item => normalizeName(item?.trip) === trip;
  const matchesChat = item => (item?.scope || '__all__') === trip
    || (item?.role === 'user' && item?.status === 'sending' && (item?.scope || '__all__') === trip);
  const tripEntries = entries.filter(matchesTrip);
  const tripExpenses = expenses.filter(matchesTrip);
  const tripChat = chat.filter(matchesChat);
  if (!tripEntries.length && !tripExpenses.length && !tripChat.length) throw new Error('找不到这段旅程，内容可能已被移除。');

  const snapshot = {
    id,
    name: trip,
    archivedAt: now,
    entries: structuredClone(tripEntries),
    expenses: structuredClone(tripExpenses),
    chat: structuredClone(tripChat),
    counts: { entries: tripEntries.length, expenses: tripExpenses.length, chat: tripChat.length },
  };
  return {
    db: {
      ...db,
      entries: entries.filter(item => !matchesTrip(item)),
      expenses: expenses.filter(item => !matchesTrip(item)),
      chat: chat.filter(item => !matchesChat(item)),
      archivedTrips: [...archivedTrips, snapshot],
    },
    archived: snapshot,
  };
}

export function restoreTrip(db, archiveId) {
  const archivedTrips = Array.isArray(db.archivedTrips) ? db.archivedTrips : [];
  const archived = archivedTrips.find(item => item.id === archiveId);
  if (!archived) throw new Error('找不到这段已移除的旅程，可能已经恢复。');
  const appendUnique = (current, incoming) => {
    const rows = Array.isArray(current) ? current : [];
    const ids = new Set(rows.map(recordId));
    const restored = (Array.isArray(incoming) ? incoming : []).filter((item, index) => !ids.has(recordId(item, index)));
    return [...rows, ...structuredClone(restored)];
  };
  return {
    db: {
      ...db,
      entries: appendUnique(db.entries, archived.entries),
      expenses: appendUnique(db.expenses, archived.expenses),
      chat: appendUnique(db.chat, archived.chat),
      archivedTrips: archivedTrips.filter(item => item.id !== archiveId),
    },
    restored: archived,
  };
}

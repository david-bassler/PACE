function normalize(value) {
  return String(value ?? '').trim();
}

export function sameCapture(entry, queueEntry) {
  if (!entry || !queueEntry) return false;
  const entryTitle = normalize(entry.fieldTitle);
  const queueTitle = normalize(queueEntry.fieldTitle || queueEntry.plan?.title);
  const entryValue = normalize(entry.value);
  const queueValue = normalize(queueEntry.plan?.value);
  return Boolean(entryTitle && entryValue && entryTitle === queueTitle && entryValue === queueValue);
}

export function reconcileCaptureJournal(journal = [], queue = [], now = Date.now()) {
  const existingQueueIds = new Set(queue.map(item => item?.id).filter(Boolean));
  const usedQueueIds = new Set(
    journal
      .map(entry => entry?.queueId)
      .filter(id => id && existingQueueIds.has(id))
  );

  return journal.map(raw => {
    const entry = { ...raw };
    if (entry.state === 'confirmed') return entry;

    if (entry.queueId) {
      const stillQueued = existingQueueIds.has(entry.queueId);
      if (!stillQueued && entry.state === 'queued') {
        entry.state = 'confirmed';
        entry.confirmedAt = new Date(now).toISOString();
      }
      return entry;
    }

    const match = queue.find(item =>
      item?.id &&
      !usedQueueIds.has(item.id) &&
      sameCapture(entry, item)
    );
    if (match) {
      usedQueueIds.add(match.id);
      entry.queueId = match.id;
      entry.state = 'queued';
      entry.queuedAt = new Date(now).toISOString();
    }
    return entry;
  });
}

export function needsRecovery(entry, now = Date.now(), graceMs = 3500) {
  if (!entry || entry.state !== 'captured') return false;
  const created = new Date(entry.createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  return now - created >= graceMs;
}

export function pruneCaptureJournal(journal = [], now = Date.now()) {
  const confirmedCutoff = now - 24 * 60 * 60 * 1000;
  const unconfirmedCutoff = now - 30 * 24 * 60 * 60 * 1000;
  return journal
    .filter(entry => {
      const timestamp = new Date(entry.confirmedAt || entry.createdAt).getTime();
      if (!Number.isFinite(timestamp)) return true;
      return entry.state === 'confirmed' ? timestamp >= confirmedCutoff : timestamp >= unconfirmedCutoff;
    })
    .slice(-200);
}

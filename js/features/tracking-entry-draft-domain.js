export function trackingDraftIdentity(fieldIds = []) {
  return [...fieldIds]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .join('|');
}

export function upsertTrackingDraft(drafts = {}, draft, now = Date.now()) {
  const next = { ...(drafts || {}) };
  if (!draft?.identity) return next;
  next[draft.identity] = {
    ...draft,
    updatedAt: new Date(now).toISOString()
  };
  return pruneTrackingDrafts(next, now);
}

export function removeTrackingDraft(drafts = {}, identity) {
  const next = { ...(drafts || {}) };
  delete next[identity];
  return next;
}

export function pruneTrackingDrafts(drafts = {}) {
  // Unabgeschickte Entwürfe sind Nutzdaten. Sie werden nicht automatisch nach
  // Alter oder Anzahl verworfen, sondern nur nach bestätigtem Speichern über
  // removeTrackingDraft entfernt. Ungültige Strukturen werden ausgesiebt.
  return Object.fromEntries(
    Object.entries(drafts || {})
      .filter(([identity, draft]) =>
        Boolean(String(identity || '').trim()) &&
        draft &&
        typeof draft === 'object' &&
        !Array.isArray(draft)
      )
  );
}

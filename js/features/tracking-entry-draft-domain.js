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

export function pruneTrackingDrafts(drafts = {}, now = Date.now()) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(drafts || {})
      .filter(([, draft]) => {
        const updated = new Date(draft?.updatedAt || 0).getTime();
        return Number.isFinite(updated) && updated >= cutoff;
      })
      .sort(([, left], [, right]) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      )
      .slice(0, 20)
  );
}

export function matchingResonanceEvents(events = [], anchor = null) {
  const wanted = anchor?.tagIds || [];
  if (!wanted.length) return [];

  return events.filter(event => {
    if (event.active === false) return false;
    const ids = new Set(event.tagIds || []);
    return anchor.matchMode === 'all'
      ? wanted.every(id => ids.has(id))
      : wanted.some(id => ids.has(id));
  });
}

export function chooseAnchorEvent(events, anchor, lastEventId = '', random = Math.random) {
  const matches = matchingResonanceEvents(events, anchor);
  if (!matches.length) return null;

  let candidates = matches.filter(item => item.id !== lastEventId);
  if (!candidates.length) candidates = matches;

  const rich = candidates.filter(item => item.context && item.context !== '—');
  const source = rich.length ? rich : candidates;
  return source[Math.floor(random() * source.length)] || null;
}

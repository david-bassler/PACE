export function activeHoldingStatements(data) {
  return (data.statements || [])
    .filter(item => item.active !== false && item.text)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.text.localeCompare(b.text, 'de'));
}

export function holdingPointById(data, id) {
  return (data.points || []).find(item => item.id === id && item.active !== false);
}

export function holdingStatementById(data, id) {
  return (data.statements || []).find(item => item.id === id);
}

export function holdingPointsForStatement(data, statementId) {
  return (data.links || [])
    .filter(item => item.active !== false && item.statementId === statementId)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map(link => holdingPointById(data, link.pointId))
    .filter(Boolean);
}

export function completedHoldingSituations(data, statementId) {
  return (data.situations || [])
    .filter(item => item.status === 'abgeschlossen' && item.statementId === statementId && item.text)
    .sort((a, b) => String(b.completedAt || b.updatedAt || '').localeCompare(String(a.completedAt || a.updatedAt || '')));
}

export function chooseDifferentItem(items = [], currentId = '', random = Math.random) {
  const options = items.filter(item => item.id !== currentId);
  const source = options.length ? options : items;
  return source.length ? source[Math.floor(random() * source.length)] : null;
}

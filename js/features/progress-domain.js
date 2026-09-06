export function clarificationCycles(item) {
  if (!Array.isArray(item.clarificationCycles)) item.clarificationCycles = [];
  return item.clarificationCycles;
}

export function currentClarification(item) {
  return clarificationCycles(item).find(cycle => cycle.status === 'active') || null;
}

export function isClarifying(item) {
  return item.type === 'Aufgabe' && item.taskMode === 'clarify';
}

export function openClarificationActions(item) {
  const cycle = currentClarification(item);
  return cycle ? (cycle.actions || []).filter(action => action.status !== 'done') : [];
}

export function allClarificationActionsDone(item) {
  const cycle = currentClarification(item);
  return Boolean(cycle?.actions?.length) && cycle.actions.every(action => action.status === 'done');
}

export function actionableProgressEntries(items = []) {
  const entries = [];

  for (const item of items) {
    if (item.type === 'Anweisung') {
      entries.push({ kind: 'item', item, type: item.type, text: item.text, areaIds: item.areaIds || [] });
      continue;
    }

    if (item.type !== 'Aufgabe') continue;

    if (!isClarifying(item)) {
      entries.push({ kind: 'item', item, type: item.type, text: item.text, areaIds: item.areaIds || [] });
      continue;
    }

    const cycle = currentClarification(item);
    if (!cycle) {
      entries.push({
        kind: 'clarification-setup',
        item,
        type: 'Klärung',
        text: 'Nächste Klärungsfrage festlegen',
        question: '',
        areaIds: item.areaIds || []
      });
      continue;
    }

    const openActions = openClarificationActions(item);
    for (const action of openActions) {
      entries.push({
        kind: 'clarification',
        item,
        cycle,
        action,
        type: 'Klärung',
        text: action.text,
        question: cycle.question,
        areaIds: item.areaIds || []
      });
    }

    if (!openActions.length && allClarificationActionsDone(item)) {
      entries.push({
        kind: 'clarification-review',
        item,
        cycle,
        type: 'Klärung',
        text: 'Klärung auswerten',
        question: cycle.question,
        areaIds: item.areaIds || []
      });
    }
  }

  return entries;
}

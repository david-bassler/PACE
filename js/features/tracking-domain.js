export function buildTrackingWritePlan(fields = [], valuesById = {}) {
  return fields
    .map(field => ({
      fieldId: field.id,
      title: field.title,
      sheetTab: field.sheetTab || '',
      columnId: field.columnId || '',
      writeMode: field.writeMode || 'append_newline',
      value: String(valuesById[field.id] ?? '').trim()
    }))
    .filter(item => item.value);
}

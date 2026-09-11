import { loadRedundantValue, saveRedundantValue } from '../core/storage.js';
import { announce } from '../core/ui.js';
import {
  pruneTrackingDrafts,
  removeTrackingDraft,
  trackingDraftIdentity,
  upsertTrackingDraft
} from './tracking-entry-draft-domain.js';

const DRAFTS_KEY = 'paceTrackingEntryDraftsV1';

let dialog = null;
let form = null;
let fieldsBox = null;
let submit = null;
let currentIdentity = '';
let submissionPending = false;
let storageWarningShown = false;

function loadDrafts() {
  try {
    const raw = loadRedundantValue(DRAFTS_KEY, null);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? pruneTrackingDrafts(parsed)
      : {};
  } catch {
    return {};
  }
}

function saveDrafts(drafts) {
  const saved = saveRedundantValue(DRAFTS_KEY, JSON.stringify(pruneTrackingDrafts(drafts)));
  if (!saved && !storageWarningShown) {
    storageWarningShown = true;
    announce('Der lokale Entwurf dieser Erfassung konnte nicht zusätzlich gesichert werden.', 'bad');
  }
  return saved;
}

function wrappers() {
  return fieldsBox
    ? [...fieldsBox.querySelectorAll('[data-field-id]')]
    : [];
}

function identityFromDom() {
  return trackingDraftIdentity(wrappers().map(wrapper => wrapper.dataset.fieldId));
}

function snapshotValues() {
  return Object.fromEntries(wrappers().map(wrapper => {
    const parts = {};
    for (const control of wrapper.querySelectorAll('[data-part]')) {
      parts[control.dataset.part] = control.value;
    }
    return [wrapper.dataset.fieldId, parts];
  }));
}

function persistCurrentDraft() {
  if (!dialog?.open || !currentIdentity) return;
  const drafts = loadDrafts();
  saveDrafts(upsertTrackingDraft(drafts, {
    identity: currentIdentity,
    title: document.getElementById('trackingEntryTitle')?.textContent || 'Erfassung',
    values: snapshotValues()
  }));
}

function restoreCurrentDraft() {
  currentIdentity = identityFromDom();
  submissionPending = false;
  if (!currentIdentity) return;

  const draft = loadDrafts()[currentIdentity];
  if (!draft?.values) return;

  let restored = false;
  for (const wrapper of wrappers()) {
    const savedParts = draft.values[wrapper.dataset.fieldId];
    if (!savedParts) continue;
    for (const control of wrapper.querySelectorAll('[data-part]')) {
      if (!Object.prototype.hasOwnProperty.call(savedParts, control.dataset.part)) continue;
      control.value = String(savedParts[control.dataset.part] ?? '');
      restored = true;
    }
  }

  if (restored) announce('Nicht gesendeter lokaler Erfassungsentwurf wiederhergestellt.', 'good');
}

function clearCurrentDraft() {
  if (!currentIdentity) return;
  const drafts = removeTrackingDraft(loadDrafts(), currentIdentity);
  saveDrafts(drafts);
}

function handleDialogState() {
  if (dialog.open) {
    queueMicrotask(restoreCurrentDraft);
  } else if (!submissionPending) {
    currentIdentity = '';
  }
}

function handleSubmit() {
  if (!dialog.open) return;
  if (!currentIdentity) currentIdentity = identityFromDom();
  persistCurrentDraft();
  submissionPending = true;
}

function handleSubmitButtonState() {
  if (!submissionPending || submit.disabled) return;

  if (dialog.open) {
    // Der Schreibversuch ist beendet, aber der Dialog blieb offen: Fehlerfall.
    // Der Entwurf bleibt erhalten und kann erneut versucht werden.
    submissionPending = false;
    return;
  }

  // tracking.js schließt den Dialog nur nach erfolgreichem, verifiziertem Write.
  clearCurrentDraft();
  submissionPending = false;
  currentIdentity = '';
}

function blockCloseWhileWriting(event) {
  if (!submissionPending) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  announce('Der Schreibvorgang läuft noch. Der Erfassungsentwurf bleibt lokal gesichert.', '');
}

export function initTrackingEntryDraftFeature() {
  dialog = document.getElementById('trackingEntryDialog');
  form = document.getElementById('trackingEntryForm');
  fieldsBox = document.getElementById('trackingEntryFields');
  submit = form?.querySelector('button[type="submit"]') || null;
  if (!dialog || !form || !fieldsBox || !submit) return;

  new MutationObserver(handleDialogState).observe(dialog, {
    attributes: true,
    attributeFilter: ['open']
  });

  new MutationObserver(handleSubmitButtonState).observe(submit, {
    attributes: true,
    attributeFilter: ['disabled']
  });

  fieldsBox.addEventListener('input', persistCurrentDraft);
  fieldsBox.addEventListener('change', persistCurrentDraft);
  form.addEventListener('submit', handleSubmit, true);

  dialog.addEventListener('cancel', event => {
    if (submissionPending) blockCloseWhileWriting(event);
  });
  dialog.addEventListener('click', event => {
    if (submissionPending && event.target.closest('.dialog-close')) {
      blockCloseWhileWriting(event);
    }
  }, true);
}

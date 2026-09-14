import { loadJSON, saveJSON } from '../core/storage.js';

function installRegulationStyles() {
  if (document.querySelector('style[data-pace-regulation-tools]')) return;
  const style = document.createElement('style');
  style.dataset.paceRegulationTools = 'true';
  style.textContent = `
    .regulation-card{padding:14px;margin:0 0 12px;border-radius:2px!important}
    .regulation-prompt{margin:0 0 10px;color:var(--ink);font-weight:780;font-size:.95rem;line-height:1.3}
    .regulation-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .regulation-choice{min-width:0;border:1px solid rgba(23,63,95,.15);border-radius:2px;background:#fff;color:var(--ink);padding:12px;text-align:left;display:flex;flex-direction:column;gap:4px;cursor:pointer}
    .regulation-choice strong{font-size:.9rem;line-height:1.2}
    .regulation-choice small{font-size:.74rem;line-height:1.3;color:var(--muted);font-weight:500}
    .regulation-choice[aria-pressed="true"]{background:#dfeae7;border-color:rgba(23,63,95,.28)}
    .regulation-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;color:var(--ink);font-size:.82rem;font-weight:720}
    .regulation-field textarea,.regulation-field input{width:100%;border:1px solid rgba(23,63,95,.18);border-radius:2px;background:#fff;color:var(--ink);padding:10px;font:inherit;font-weight:500;resize:vertical}
    .regulation-primary{width:100%;margin:0}
    .regulation-prep{margin-top:12px;padding-top:12px;border-top:1px solid rgba(23,63,95,.1)}
    .regulation-prep p,.regulation-result{margin:0 0 10px;font-size:.83rem;line-height:1.4;color:var(--muted)}
    .regulation-result{margin:10px 0 0;color:var(--ink);font-weight:650}
    .direction-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;margin-bottom:14px}
    .direction-add .regulation-field{margin:0}
    .direction-add button{height:42px;white-space:nowrap}
    .direction-now{border:1px solid rgba(23,63,95,.18);background:#e7efed;padding:14px;margin-bottom:10px}
    .direction-section-label{margin:0 0 5px;color:var(--muted);font-size:.68rem;line-height:1;letter-spacing:.14em;font-weight:850;text-transform:uppercase}
    .direction-now-value{font-size:1.08rem;line-height:1.28;font-weight:820;color:var(--ink)}
    .direction-now-empty{color:var(--muted);font-weight:550}
    .direction-now-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
    .direction-now-actions button,.direction-item-actions button{border:1px solid rgba(23,63,95,.16);background:#fff;color:var(--ink);border-radius:2px;padding:7px 9px;font:inherit;font-size:.72rem;font-weight:720;cursor:pointer}
    .direction-bucket{border-top:1px solid rgba(23,63,95,.12)}
    .direction-bucket summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 2px;cursor:pointer;color:var(--ink);font-weight:800}
    .direction-bucket summary::-webkit-details-marker{display:none}
    .direction-bucket summary span:last-child{color:var(--muted);font-size:.78rem;font-weight:650}
    .direction-list{display:flex;flex-direction:column;padding-bottom:8px}
    .direction-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(23,63,95,.08)}
    .direction-item:first-child{border-top:0}
    .direction-item-text{min-width:0;color:var(--ink);font-size:.88rem;line-height:1.3;font-weight:650;overflow-wrap:anywhere}
    .direction-item-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}
    .direction-empty{margin:0;padding:8px 0 12px;color:var(--muted);font-size:.8rem}
    @media(max-width:430px){
      .regulation-choice-grid{grid-template-columns:1fr}.regulation-choice{padding:11px}
      .direction-add{grid-template-columns:1fr}.direction-add button{width:100%}
      .direction-item{grid-template-columns:1fr}.direction-item-actions{justify-content:flex-start}
    }
  `;
  document.head.appendChild(style);
}

function el(html) {
  installRegulationStyles();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
}

function wireToggleButtons(root) {
  root.querySelectorAll('[data-reg-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
    });
  });
}

function choiceCard(prompt, choices) {
  const root = el(`
    <section class="regulation-card feature-card">
      <p class="regulation-prompt">${prompt}</p>
      <div class="regulation-choice-grid">
        ${choices.map(choice => `
          <button type="button" class="regulation-choice" data-reg-toggle aria-pressed="false">
            <strong>${choice.title}</strong>
            <small>${choice.note}</small>
          </button>
        `).join('')}
      </div>
    </section>
  `);
  wireToggleButtons(root);
  return root;
}

export function createInputTool() {
  return choiceCard('Was kann gerade weg?', [
    { title: 'Licht', note: 'Lichtquelle oder Sonne verlassen' },
    { title: 'Lärm', note: 'Ohrenschutz oder ruhigerer Ort' },
    { title: 'Temperatur', note: 'Raum wechseln, kühlen oder wärmen' },
    { title: 'Ansprache', note: 'Kurz nicht angesprochen werden' },
    { title: 'Information', note: 'News und Benachrichtigungen aus' },
    { title: 'Ort', note: 'Situation verlassen' }
  ]);
}

export function createCalmCompanion() {
  return choiceCard('Körper zuerst', [
    { title: 'Lange ausatmen', note: 'Ausatmen länger als einatmen' },
    { title: 'Hände unter Wasser', note: 'Temperatur bewusst wahrnehmen' },
    { title: 'Hinsetzen / hinlegen', note: 'Anforderung kurz beenden' },
    { title: 'Kühlen', note: 'Wenn Wärme gerade Teil des Problems ist' },
    { title: 'Selbstberührung', note: 'Hand auf Schulter oder Bauch' }
  ]);
}

export function createDisengageTool() {
  return choiceCard('Nicht lösen. Erst auskuppeln.', [
    { title: '1 · Raus', note: 'Abstand zur Situation herstellen' },
    { title: '2 · Nicht reagieren', note: 'Noch nichts entscheiden oder beantworten' },
    { title: '3 · Benennen', note: 'Was genau ist gerade passiert?' },
    { title: '4 · Festhalten', note: 'Ein paar Sätze reichen' },
    { title: '5 · Später entscheiden', note: 'Bewertung erst mit mehr Abstand' }
  ]);
}

export function createInsurmountableTool() {
  const root = el(`
    <section class="regulation-card feature-card">
      <label class="regulation-field">
        <span>Was wirkt gerade unschaffbar?</span>
        <textarea rows="3" data-insurmountable-task></textarea>
      </label>
      <button type="button" class="primary-button regulation-primary" data-insurmountable-start>Nur vorbereiten</button>
      <div class="regulation-prep" data-insurmountable-prep hidden>
        <p><strong>Nicht erledigen.</strong> Nur die Ausgangslage herstellen.</p>
        <label class="regulation-field">
          <span>Was wäre reine Vorbereitung?</span>
          <input type="text" placeholder="z. B. Datei öffnen, Sachen hinlegen, Zutaten bereitstellen">
        </label>
      </div>
    </section>
  `);
  root.querySelector('[data-insurmountable-start]')?.addEventListener('click', () => {
    const prep = root.querySelector('[data-insurmountable-prep]');
    if (prep) prep.hidden = false;
    root.querySelector('[data-insurmountable-prep] input')?.focus();
  });
  return root;
}

const DIRECTION_STORAGE_KEY = 'pace-direction-focus-v1';

function loadDirectionState() {
  const parsed = loadJSON(DIRECTION_STORAGE_KEY, { now: '', later: [], notToday: [] });
  return {
    now: typeof parsed.now === 'string' ? parsed.now : '',
    later: Array.isArray(parsed.later) ? parsed.later.filter(item => typeof item === 'string' && item.trim()) : [],
    notToday: Array.isArray(parsed.notToday) ? parsed.notToday.filter(item => typeof item === 'string' && item.trim()) : []
  };
}

function saveDirectionState(state) {
  saveJSON(DIRECTION_STORAGE_KEY, state);
}

function uniqueDirectionItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.trim().toLocaleLowerCase('de-DE');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createDirectionCompanion() {
  const state = loadDirectionState();
  const root = el(`
    <section class="regulation-card feature-card direction-tool">
      <p class="regulation-prompt">Eine Sache im Fokus. Der Rest bleibt greifbar.</p>
      <div class="direction-add">
        <label class="regulation-field">
          <span>Was ist gerade alles offen?</span>
          <textarea rows="2" data-direction-input placeholder="Eine Sache pro Zeile"></textarea>
        </label>
        <button type="button" class="secondary-button" data-direction-add>Hinzufügen</button>
      </div>

      <section class="direction-now" aria-live="polite">
        <p class="direction-section-label">Jetzt</p>
        <div class="direction-now-value" data-direction-now></div>
        <div class="direction-now-actions" data-direction-now-actions hidden>
          <button type="button" data-direction-now-later>Später</button>
          <button type="button" data-direction-now-not-today>Heute nicht</button>
        </div>
      </section>

      <details class="direction-bucket" data-direction-later open>
        <summary><span>Später</span><span data-direction-later-count></span></summary>
        <div class="direction-list" data-direction-later-list></div>
      </details>

      <details class="direction-bucket" data-direction-not-today>
        <summary><span>Heute nicht</span><span data-direction-not-today-count></span></summary>
        <div class="direction-list" data-direction-not-today-list></div>
      </details>
    </section>
  `);

  const input = root.querySelector('[data-direction-input]');
  const nowEl = root.querySelector('[data-direction-now]');
  const nowActions = root.querySelector('[data-direction-now-actions]');
  const laterList = root.querySelector('[data-direction-later-list]');
  const notTodayList = root.querySelector('[data-direction-not-today-list]');
  const laterCount = root.querySelector('[data-direction-later-count]');
  const notTodayCount = root.querySelector('[data-direction-not-today-count]');

  function moveNowTo(bucket) {
    if (!state.now) return;
    state[bucket].unshift(state.now);
    state[bucket] = uniqueDirectionItems(state[bucket]);
    state.now = '';
    persistAndRender();
  }

  function activate(text, sourceBucket) {
    if (!text) return;
    if (state.now && state.now !== text) state.later.unshift(state.now);
    state[sourceBucket] = state[sourceBucket].filter(item => item !== text);
    state.now = text;
    state.later = uniqueDirectionItems(state.later.filter(item => item !== text));
    state.notToday = uniqueDirectionItems(state.notToday.filter(item => item !== text));
    persistAndRender();
  }

  function moveBetween(text, fromBucket, toBucket) {
    state[fromBucket] = state[fromBucket].filter(item => item !== text);
    state[toBucket].unshift(text);
    state[toBucket] = uniqueDirectionItems(state[toBucket]);
    persistAndRender();
  }

  function itemRow(text, bucket) {
    const row = document.createElement('div');
    row.className = 'direction-item';
    const label = document.createElement('div');
    label.className = 'direction-item-text';
    label.textContent = text;
    const actions = document.createElement('div');
    actions.className = 'direction-item-actions';

    const nowButton = document.createElement('button');
    nowButton.type = 'button';
    nowButton.textContent = 'Jetzt';
    nowButton.addEventListener('click', () => activate(text, bucket));
    actions.appendChild(nowButton);

    const otherButton = document.createElement('button');
    otherButton.type = 'button';
    if (bucket === 'later') {
      otherButton.textContent = 'Heute nicht';
      otherButton.addEventListener('click', () => moveBetween(text, 'later', 'notToday'));
    } else {
      otherButton.textContent = 'Später';
      otherButton.addEventListener('click', () => moveBetween(text, 'notToday', 'later'));
    }
    actions.appendChild(otherButton);
    row.append(label, actions);
    return row;
  }

  function renderBucket(listEl, items, bucket) {
    listEl.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'direction-empty';
      empty.textContent = bucket === 'later' ? 'Nichts abgelegt.' : 'Für heute nichts herausgenommen.';
      listEl.appendChild(empty);
      return;
    }
    items.forEach(item => listEl.appendChild(itemRow(item, bucket)));
  }

  function render() {
    if (state.now) {
      nowEl.textContent = state.now;
      nowEl.classList.remove('direction-now-empty');
      nowActions.hidden = false;
    } else {
      nowEl.textContent = 'Noch nichts ausgewählt';
      nowEl.classList.add('direction-now-empty');
      nowActions.hidden = true;
    }
    laterCount.textContent = `(${state.later.length})`;
    notTodayCount.textContent = `(${state.notToday.length})`;
    renderBucket(laterList, state.later, 'later');
    renderBucket(notTodayList, state.notToday, 'notToday');
  }

  function persistAndRender() {
    saveDirectionState(state);
    render();
  }

  root.querySelector('[data-direction-add]')?.addEventListener('click', () => {
    const values = String(input?.value || '').split(/\n+/).map(item => item.trim()).filter(Boolean);
    if (!values.length) return;
    const allExisting = [state.now, ...state.later, ...state.notToday].filter(Boolean).map(item => item.toLocaleLowerCase('de-DE'));
    const newItems = values.filter(item => !allExisting.includes(item.toLocaleLowerCase('de-DE')));
    state.later = uniqueDirectionItems([...state.later, ...newItems]);
    if (input) input.value = '';
    persistAndRender();
    root.querySelector('[data-direction-later]')?.setAttribute('open', '');
  });

  input?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') root.querySelector('[data-direction-add]')?.click();
  });

  root.querySelector('[data-direction-now-later]')?.addEventListener('click', () => moveNowTo('later'));
  root.querySelector('[data-direction-now-not-today]')?.addEventListener('click', () => moveNowTo('notToday'));

  render();
  return root;
}

export function createReserveCompanion() {
  return choiceCard('Reserve schützen', [
    { title: 'Essen', note: 'Hunger ausschließen' },
    { title: 'Schlaf', note: 'Schlafdefizit ernst nehmen' },
    { title: 'Temperatur', note: 'Hitze oder Kälte prüfen' },
    { title: 'Pause', note: 'Anforderungen vorübergehend stoppen' },
    { title: 'Was kann weg?', note: 'Heute etwas bewusst nicht tun' }
  ]);
}

export function createMoveTool() {
  const root = el(`
    <section class="regulation-card feature-card">
      <p class="regulation-prompt">Energie nicht wegdenken. Einen sicheren Ausgang geben.</p>
      <div class="regulation-choice-grid">
        <button type="button" class="regulation-choice" data-move="Kurz raus"><strong>Kurz raus</strong><small>Nur Schuhe an und vor die Tür</small></button>
        <button type="button" class="regulation-choice" data-move="Spaziergang"><strong>Spaziergang</strong><small>Allein gehen, ohne weiteres Ziel</small></button>
        <button type="button" class="regulation-choice" data-move="Längerer Weg"><strong>Längerer Weg</strong><small>Wenn mehr Bewegungsenergie da ist</small></button>
      </div>
      <p class="regulation-result" data-move-result hidden></p>
    </section>
  `);
  root.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
    const result = root.querySelector('[data-move-result]');
    if (!result) return;
    result.textContent = `${button.dataset.move}: anfangen, ohne vorher den Rest zu planen.`;
    result.hidden = false;
  }));
  return root;
}

export function createSafetyTool() {
  return choiceCard('Sicherheit oder Nähe herstellen', [
    { title: '„Du bist sicher“', note: 'Den bekannten Satz bewusst verwenden' },
    { title: 'Selbstberührung', note: 'Hand auf Schulter oder Bauch' },
    { title: 'Nähe', note: 'Kuscheln oder beruhigende Berührung, wenn passend' },
    { title: 'Kontakt', note: 'Vertrauten Menschen anrufen oder schreiben' },
    { title: 'Tierkontakt', note: 'Nähe zu einem vertrauten Tier, wenn verfügbar' }
  ]);
}

export function createPerspectiveCompanion() {
  return choiceCard('Blick wieder weiter machen', [
    { title: 'C2Y', note: 'Mit dem vorherigen Zustand statt mit dem Ideal vergleichen' },
    { title: 'Gegenbeispiel', note: 'Was passt gerade nicht zur schlimmsten Deutung?' },
    { title: 'Zeithorizont', note: 'Wie sieht das in einer Woche oder einem Monat aus?' },
    { title: 'Rausgehen', note: 'Reale Umgebung statt nur Gedanken sehen' },
    { title: 'Man wird sehen', note: 'Nicht alles muss jetzt bewertet werden' }
  ]);
}
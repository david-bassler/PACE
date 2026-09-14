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
    @media(max-width:430px){.regulation-choice-grid{grid-template-columns:1fr}.regulation-choice{padding:11px}}
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

export function createDirectionCompanion() {
  return choiceCard('Auswahl verkleinern', [
    { title: 'Jetzt', note: 'Genau eine Sache' },
    { title: 'Später', note: 'Nicht jetzt entscheiden' },
    { title: 'Weg', note: 'Darf heute entfallen' }
  ]);
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

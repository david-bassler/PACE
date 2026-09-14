function el(html) {
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

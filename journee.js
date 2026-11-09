/* Vues « Ma journée » et « À faire ». */
'use strict';

const tagChips = (text, max = 6) => Core.extractTags(text).slice(0, max)
  .map(t => `<a class="chip" href="#/tag/${encodeURIComponent(t.key)}">#${esc(t.label)}</a>`).join('');

/* ===================== MA JOURNÉE ===================== */
let sessionDay = null;   // dernière journée ouverte pendant cette session (lien « Reprendre »)

/** Écran d'ouverture : 3 choix — Aujourd'hui · Date à définir · Journée type. */
function journeeChooser(app) {
  const today = todayISO(), td = state.days[today], templates = listsFor({ scope: 'day' }, 'template');
  const tdClass = td && !dayIsEmpty(td) ? keepClass(td) : '';
  app.innerHTML = `<div class="choose">
    <button class="bigcard ${tdClass}" data-c="today"><span class="bi">📅</span><span class="grow"><strong>Aujourd’hui</strong><br><span class="meta">${esc(longDate(today))}</span></span></button>
    <button class="bigcard" data-c="date"><span class="bi">🗓️</span><span class="grow"><strong>Date à définir</strong><br><span class="meta">Choisir un autre jour</span></span></button>
    <div class="bigcard col"><div class="row"><span class="bi">🧩</span><span class="grow"><strong>Journée type</strong><br><span class="meta">Partir d’un modèle</span></span></div>
      <select id="jt-sel" ${templates.length ? '' : 'disabled'}>${templates.length ? '<option value="">— choisir une journée type —</option>' + templates.map(t => `<option value="${t.id}">${esc(t.name)} (${countLabel(t.items.length, 'bloc')})</option>`).join('')
        : '<option>Aucune journée type — enregistres-en une depuis une journée (⭐)</option>'}</select>
      <div class="row" id="jt-more" hidden><input type="date" id="jt-date" value="${today}" style="width:auto"><button class="btn-gold grow" id="jt-go">Créer la journée</button></div></div>
    ${sessionDay ? `<a class="resume" href="#/journee/${sessionDay}">↩ Reprendre ${esc(longDate(sessionDay))}</a>` : ''}
  </div>`;
  $('[data-c=today]', app).onclick = () => nav('#/journee/' + today);
  $('[data-c=date]', app).onclick = openDateSheet;
  $('#jt-sel', app).onchange = e => { $('#jt-more', app).hidden = !e.target.value; };
  $('#jt-go', app).onclick = () => {
    const t = state.lists.find(x => x.id === $('#jt-sel', app).value), date = $('#jt-date', app).value;
    if (!t || !date) return;
    applyDayTemplate(t, date);
  };
}
/** « Date à définir » : choisit un jour et l'ouvre. */
function openDateSheet() {
  openSheet(`<h3>Date à définir</h3><form><input type="date" name="d" value="${todayISO()}">
    <div class="row" style="margin-top:12px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Ouvrir</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = e => { e.preventDefault(); const v = e.target.d.value; if (v) { closeSheet(); nav('#/journee/' + v); } };
  });
}
/** Applique une journée type à une date (si la journée a déjà du contenu : on ajoute à la suite) et l'ouvre. */
function applyDayTemplate(t, date) {
  const d = day(date), start = d.blocs.reduce((m, b) => Math.max(m, b.pos), -1) + 1;
  t.items.forEach((i, k) => d.blocs.push(touch({ id: uid(), titre: i.titre, texte: i.texte, ...(i.html ? { html: i.html } : {}), couleur: i.couleur, horaire: i.horaire, pos: start + k })));
  if (t.sub && !d.subtitle) d.subtitle = t.sub;
  touch(d); save(); toast(`Journée type « ${t.name} » appliquée.`); nav('#/journee/' + date);
}

VIEWS.journee = (app, r) => {
  if (!r.date) return journeeChooser(app);
  state.current = r.date; sessionDay = r.date;
  const d = day();
  setActions([...listActions(dayCtx(d.date)), keepAction(d, () => render())]);
  setSubtitle(longDate(d.date), d);
  const isToday = d.date === todayISO();
  const bd = typeof upcomingBirthdays === 'function' ? upcomingBirthdays(7) : [];
  app.innerHTML = `
    <section class="day-head ${keepClass(d)}">
      <h2 class="day-title">${isToday ? 'Aujourd’hui' : esc(longDate(d.date))}</h2>
      ${isToday ? `<p class="date-label">${esc(longDate(d.date))}</p>` : ''}${expiryLabel(d) ? `<p class="meta">${esc(expiryLabel(d))}</p>` : ''}
      <div class="row actions">
        <button class="btn-red" id="b-reset">Vider</button>
        <button id="b-chrono" title="Trier par horaire">🕒 Trier</button>
        <button class="btn-green" id="b-add">＋ Bloc</button>
      </div>
    </section>
    ${bd.length ? `<a class="card bday-banner" href="#/memos/type/birthdays">🎂 ${bd.map(b => `<strong>${esc(b.nom)}</strong> ${b.days === 0 ? "aujourd'hui" : b.days === 1 ? 'demain' : 'dans ' + b.days + ' j'}`).join(' · ')}</a>` : ''}
    <div id="blocs"></div>`;
  $('#b-add').onclick = addBloc;
  $('#b-chrono').onclick = sortChrono;
  $('#b-reset').onclick = () => {
    if (!live(d.blocs).length) return toast('Aucun bloc à effacer.');
    confirmSheet('Effacer TOUS les blocs de la journée ?', 'Effacer', () => withUndo('Blocs effacés', () => { live(d.blocs).forEach(kill); render(); }));
  };
  renderBlocs();
};

function renderBlocs() {
  const d = day(), box = $('#blocs'), blocs = blocsOf(d);
  if (!blocs.length) { box.innerHTML = '<p class="empty">Aucun bloc pour cette journée.<br>Appuie sur « ＋ Bloc ».</p>'; return; }
  box.innerHTML = blocs.map(b => {
    const open = openBlocs.has(b.id);
    return `<article class="bloc" data-id="${b.id}" style="background:${esc(b.couleur)}">
      <div class="bloc-head">
        <button class="handle" aria-label="Déplacer">≡</button>
        <button class="time" data-act="time">${b.horaire || '🕒'}</button>
        <input class="titre" type="text" value="${esc(b.titre)}" placeholder="Titre…">
        <button data-act="toggle" aria-label="Dérouler">${open ? '▲' : '▼'}</button>
        <button data-act="color" aria-label="Couleur">●</button>
        <button data-act="del" aria-label="Supprimer">🗑</button>
      </div>
      ${open ? `<div class="bloc-body">
        <div class="tools"><button data-act="check">☑ Insérer une check-liste</button><button data-act="dup">Dupliquer</button></div>
        ${Rich.editor(b.html, b.texte, 'Écris ici… (#thème pour classer)')}
      </div>` : (b.texte || tagChips(b.titre + ' ' + b.texte) ? `<div class="bloc-body" style="padding-bottom:8px;font-size:13px;color:#555">${esc(b.texte.split('\n')[0].slice(0, 90))} ${tagChips(b.titre + ' ' + b.texte)}</div>` : '')}
    </article>`;
  }).join('');
}

const openBlocs = new Set();   // blocs dépliés (affichage uniquement)
const blocFrom = el => live(day().blocs).find(b => b.id === el.closest('.bloc')?.dataset.id);

{
  const app = $('#app');
  app.addEventListener('input', e => {
    const el = e.target.closest('.bloc'); if (!el) return;
    const b = blocFrom(el); if (!b) return;
    if (e.target.matches('input.titre')) b.titre = e.target.value;
    else if (e.target.matches('.rte')) Rich.bind(b, 'texte', 'html', e.target);
    touch(b); save();
  });
  app.addEventListener('click', e => {
    const btn = e.target.closest('.bloc [data-act]'); if (!btn) return;
    const b = blocFrom(btn); if (!b) return;
    const act = btn.dataset.act;
    if (act === 'toggle') { openBlocs.has(b.id) ? openBlocs.delete(b.id) : openBlocs.add(b.id); renderBlocs(); }
    else if (act === 'time') timeSheet(b);
    else if (act === 'color') colorSheet(b);
    else if (act === 'check') checklistPicker(b);
    else if (act === 'del') withUndo('Bloc supprimé', () => { kill(b); renderBlocs(); });
    else if (act === 'dup') {
      const d = day(), c = touch({ ...b, id: uid(), titre: b.titre + ' (copie)' });
      d.blocs.push(c);
      const list = blocsOf(d).filter(x => x !== c); list.splice(list.indexOf(b) + 1, 0, c); setOrder(d, list);
      save(); renderBlocs();
    }
  });

  /* Glisser-déposer tactile/souris via la poignée ≡ */
  app.addEventListener('pointerdown', e => {
    const h = e.target.closest('.bloc .handle'); if (!h) return;
    e.preventDefault();
    const el = h.closest('.bloc'), list = el.parentElement;
    el.classList.add('dragging'); h.setPointerCapture(e.pointerId);
    let lastY = e.clientY, raf;
    const reposition = () => {
      const sib = [...list.children].filter(c => c !== el);
      const next = sib.find(s => { const rc = s.getBoundingClientRect(); return lastY < rc.top + rc.height / 2; });
      list.insertBefore(el, next || null);
    };
    const autoscroll = () => {
      const vh = window.innerHeight;
      if (lastY < 90) window.scrollBy(0, -10); else if (lastY > vh - 110) window.scrollBy(0, 10);
      reposition(); raf = requestAnimationFrame(autoscroll);
    };
    autoscroll();
    const move = ev => { lastY = ev.clientY; };
    const up = () => {
      cancelAnimationFrame(raf);
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      const d = day(), order = [...list.children].map(c => c.dataset.id);
      setOrder(d, blocsOf(d).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
      save();
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
}

function addBloc() {
  const d = day(), n = blocsOf(d).length;
  const b = touch({ id: uid(), titre: '', texte: '', couleur: BLOCK_COLORS[n % 6], horaire: null,
    pos: d.blocs.reduce((m, x) => Math.max(m, x.pos), -1) + 1 });
  d.blocs.push(b); save(); renderBlocs();   // un nouveau bloc est rétracté ; on place le curseur sur son titre
  const el = $(`.bloc[data-id="${b.id}"] input.titre`); el.focus(); el.scrollIntoView({ block: 'center' });
}
function sortChrono() {
  const d = day();
  setOrder(d, blocsOf(d).map((b, i) => [b, i]).sort((a, c) => {
    const ha = a[0].horaire, hc = c[0].horaire;
    if (ha && hc) return ha.localeCompare(hc) || a[1] - c[1];
    if (ha) return -1; if (hc) return 1; return a[1] - c[1];
  }).map(x => x[0]));
  save(); renderBlocs(); toast('Blocs triés par horaire.');
}
function timeSheet(b) {
  openSheet(`<h3>Horaire</h3><input type="time" id="t" value="${b.horaire || ''}"><div class="row" style="margin-top:12px">
    <button class="grow" data-clear>Effacer</button><button class="grow btn-gold" data-ok>OK</button></div>`, c => {
    $('[data-clear]', c).onclick = () => { b.horaire = null; touch(b); save(); closeSheet(); renderBlocs(); };
    $('[data-ok]', c).onclick = () => { b.horaire = $('#t', c).value || null; touch(b); save(); closeSheet(); renderBlocs(); };
  });
}
function colorSheet(b) {
  openSheet(`<h3>Couleur du bloc</h3><div class="swatches">${BLOCK_COLORS.map(c =>
    `<button class="swatch ${c === b.couleur ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
    <label>Couleur libre <input type="color" id="cc" value="${b.couleur}" style="height:44px;padding:2px"></label>`, c => {
    const set = col => { b.couleur = col; touch(b); save(); closeSheet(); renderBlocs(); };
    $$('.swatch', c).forEach(s => (s.onclick = () => set(s.dataset.c)));
    $('#cc', c).onchange = e => set(e.target.value);
  });
}
/** Insère les lignes d'une check-liste de la bibliothèque dans le texte du bloc. */
function checklistPicker(b) {
  const lists = liveNotes().filter(n => n.type === 'checklist');
  if (!lists.length) return toast('Aucune check-liste. Crée-en une dans Mémos.');
  openSheet(`<h3>Insérer une check-liste</h3><div class="btn-list">${lists.map(n =>
    `<button data-id="${n.id}">${esc(n.title || 'Check-liste')} <span class="meta">(${n.data.items.length})</span></button>`).join('')}</div>`, c => {
    $$('button[data-id]', c).forEach(btn => (btn.onclick = () => {
      const n = noteById(btn.dataset.id);
      const lines = n.data.items.map(i => '☐ ' + i.t).join('\n');
      Rich.append(b, 'texte', 'html', lines); touch(b); save(); closeSheet(); renderBlocs();
    }));
  });
}

/* ===================== À FAIRE ===================== */
const PRIO_LABEL = ['·', '!', '!!'];
const openTodos = new Set();   // lignes dont le détail est déroulé (affichage uniquement)

VIEWS.afaire = app => {
  setActions([...listActions(todoCtx()), { icon: '<i class="kdot k-never"></i>', label: 'Archive : toutes',
    fn: () => keepSheet('', (k, at) => { live(state.todos).forEach(t => setKeep(t, k, at)); toast(`Archivage « ${KEEP[k].label} » appliqué à toutes les tâches.`); VIEWS.afaire($('#app')); }, 'Archivage de toutes les tâches') }]);
  const todos = newestFirst(live(state.todos)), open = todos.filter(t => !t.done).sort((a, b) => b.prio - a.prio), done = todos.filter(t => t.done);
  const row = t => {
    const isOpen = openTodos.has(t.id), has = !!(t.note && t.note.trim());
    return `<div class="card todo ${keepClass(t)} ${t.done ? 'done' : ''}" data-id="${t.id}">
      <div class="trow">
        <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Fait">
        <input type="text" value="${esc(t.text)}" placeholder="Tâche…">
        <button class="prio" data-p="${t.prio}" aria-label="Priorité">${PRIO_LABEL[t.prio]}</button>
        <button class="arrow ${has ? 'has' : ''}" data-arrow aria-label="Détails" aria-expanded="${isOpen}">${isOpen ? '▲' : '▼'}</button>
        <button data-del aria-label="Supprimer">✕</button>
      </div>
      ${isOpen ? Rich.editor(t.noteHtml, t.note || '', 'Détails, lignes de texte… (#thème pour classer)', 'todo-note')
        : has ? `<div class="todo-peek" data-arrow>${esc(t.note.trim().split('\n')[0].slice(0, 80))}</div>` : ''}
    </div>`;
  };
  app.innerHTML = `
    <form class="row" id="todo-form" style="margin-bottom:12px">
      <input type="text" id="todo-new" class="grow" placeholder="Nouvelle tâche…" autocomplete="off">
      <button class="btn-blue" type="submit">＋</button>
    </form>
    ${open.length ? open.map(row).join('') : '<p class="empty">Rien à faire. 🎉</p>'}
    ${done.length ? `<div class="h2 row"><span class="grow">Terminées (${done.length})</span><button id="clear-done">Vider</button></div>${done.map(row).join('')}` : ''}`;
  $('#todo-form').onsubmit = e => {
    e.preventDefault();
    const v = $('#todo-new').value.trim(); if (!v) return;
    state.todos.push(touch({ id: uid(), text: v, done: false, prio: 0, note: '' })); save(); VIEWS.afaire(app);
    $('#todo-new').focus();
  };
  const cd = $('#clear-done');
  if (cd) cd.onclick = () => withUndo('Tâches terminées supprimées', () => { live(state.todos).filter(t => t.done).forEach(kill); VIEWS.afaire(app); });
  $$('.todo', app).forEach(el => {
    const t = state.todos.find(x => x.id === el.dataset.id);
    // toucher le bandeau coloré (marge gauche de la carte) change la durée d'archivage de la tâche
    el.addEventListener('click', e => { if (e.target === el && e.offsetX <= 22) cycleKeep(t, k => { toast(`Archive : ${KEEP[k].label}`); VIEWS.afaire(app); }); });
    $('input[type=checkbox]', el).onchange = e => { t.done = e.target.checked; touch(t); save(); VIEWS.afaire(app); };
    $('input[type=text]', el).oninput = e => { t.text = e.target.value; touch(t); save(); };
    $('.prio', el).onclick = () => { t.prio = (t.prio + 1) % 3; touch(t); save(); VIEWS.afaire(app); };
    $$('[data-arrow]', el).forEach(b => (b.onclick = () => {
      openTodos.has(t.id) ? openTodos.delete(t.id) : openTodos.add(t.id); VIEWS.afaire(app);
      if (openTodos.has(t.id)) $('.todo[data-id="' + t.id + '"] .rte').focus();
    }));
    const ta = $('.todo-note', el); if (ta) ta.oninput = e => { Rich.bind(t, 'note', 'noteHtml', e.target); touch(t); save(); };
    $('[data-del]', el).onclick = () => withUndo('Tâche supprimée', () => { kill(t); VIEWS.afaire(app); });
  });
};

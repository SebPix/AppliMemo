/* Mémos typés : accueil, liste par type, éditeurs (check-liste, divers, anniversaires,
 * liens, mails, lieux, photos Bunny, coffre de mots de passe). */
'use strict';

/* ---------- Données ---------- */
function defaultData(type) {
  return type === 'divers' ? { text: '' } : type === 'password' ? { enc: null, kid: '' } : { items: [] };
}
function newNote(type, title) {
  const n = touch({ id: uid(), type, title, fav: false, data: defaultData(type) });
  state.notes.push(n); save();
  return n;
}
/** Texte brut d'une note (recherche, hashtags, PDF). Le coffre n'est jamais indexé. */
function noteText(n) {
  const d = n.data;
  if (n.type === 'divers') return d.text;
  if (n.type === 'password') return '';
  if (n.type === 'voice') return d.items.map(i => [i.titre, i.note].filter(Boolean).join(' ')).join('\n');
  return d.items.map(it => Object.entries(it).filter(([k, v]) => k !== 'id' && k !== 'done' && v !== null && v !== '').map(([, v]) => v).join(' ')).join('\n');
}
function noteMeta(n) {
  const d = n.data;
  if (n.type === 'checklist') return `${d.items.filter(i => i.done).length}/${d.items.length}`;
  if (n.type === 'divers') return d.text.replace(/\s+/g, ' ').slice(0, 40);
  if (n.type === 'password') return '🔒';
  if (n.type === 'voice') return `${d.items.length} enregistrement${d.items.length > 1 ? 's' : ''}`;
  return `${d.items.length} élément${d.items.length > 1 ? 's' : ''}`;
}
const noteTitle = n => n.title || TYPE_META[n.type].one;

function nextBday(it, from = new Date()) {
  const t0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let y = t0.getFullYear(), d = new Date(y, it.m - 1, it.j);
  if (d < t0) { y++; d = new Date(y, it.m - 1, it.j); }
  return { days: Math.round((d - t0) / 86400000), age: it.a ? y - it.a : null };
}
function upcomingBirthdays(n) {
  return liveNotes().filter(x => x.type === 'birthdays').flatMap(x => x.data.items)
    .map(it => ({ nom: it.nom, ...nextBday(it) })).filter(b => b.days <= n).sort((a, b) => a.days - b.days);
}

/* ---------- Accueil Mémos ---------- */
VIEWS.memos = app => {
  const notes = liveNotes().filter(n => n.type !== 'checklist');
  const favs = notes.filter(n => n.fav), recents = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const list = arr => arr.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${TYPE_META[n.type].icon}</span>
    <span class="grow">${esc(noteTitle(n))}</span></a>`).join('');   // favoris et récents : le titre seulement
  app.innerHTML = `
    <div class="tiles">${MEMO_TYPES.map(t => `<a class="tile" href="#/memos/type/${t}"><span class="ti">${TYPE_META[t].icon}</span>
      <strong>${TYPE_META[t].label}</strong><span class="meta">${notes.filter(n => n.type === t).length}</span></a>`).join('')}</div>
    ${favs.length ? `<div class="h2">★ Favoris</div>${list(favs)}` : ''}
    ${recents.length ? `<div class="h2">Récents</div>${list(recents)}` : '<p class="empty">Aucun mémo pour l’instant.<br>Choisis un type ci-dessus pour commencer.</p>'}`;
};
function createNoteFlow(type) {
  const m = TYPE_META[type], divers = type === 'divers';
  promptSheet(divers ? 'Nom du mémo' : `Nouveau : ${m.one}`,
    { label: divers ? 'Mémo …' : 'Nom', value: divers ? '' : m.def, okLabel: 'Créer', prefix: divers ? 'Mémo' : '' }, v => {
      v = v.trim();
      const title = divers ? ('Mémo' + (v ? ' ' + v : '')) : (v || m.def);
      const n = newNote(type, title);
      nav('#/note/' + n.id);
    });
}

/* ---------- Liste d'un type ---------- */
VIEWS.type = (app, r) => {
  const t = r.type;
  if (t === 'checklist') return nav('#/checklists');
  if (!TYPE_META[t]) return nav('#/memos');
  setTitle(TYPE_META[t].label.toUpperCase());
  const notes = liveNotes().filter(n => n.type === t).sort((a, b) => (b.fav - a.fav) || noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  app.innerHTML = `<button class="btn-gold" id="t-new" style="width:100%;margin-bottom:12px">＋ Nouveau : ${esc(TYPE_META[t].one)}</button>
    ${notes.length ? notes.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : TYPE_META[t].icon}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(noteMeta(n))}</span></a>`).join('') : '<p class="empty">Rien ici pour l’instant.</p>'}`;
  $('#t-new').onclick = () => createNoteFlow(t);
};

/* ---------- Check-listes (onglet à part) ---------- */
VIEWS.checklists = app => {
  const lists = liveNotes().filter(n => n.type === 'checklist').sort((a, b) => (b.fav - a.fav) || noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  app.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn-gold grow" id="cl-new">＋ Nouvelle check-liste</button>
      <button id="cl-tpl">📑 Depuis une liste type</button></div>
    ${lists.length ? lists.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : '☑️'}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(noteMeta(n))}</span></a>`).join('')
      : '<p class="empty">Aucune check-liste.<br>Crée-en une, ou pars d’une liste type.</p>'}`;
  $('#cl-new').onclick = () => createNoteFlow('checklist');
  $('#cl-tpl').onclick = checklistFromTemplate;
};
/** Nouvelle check-liste à partir d'une liste type. */
function checklistFromTemplate() {
  const ts = listsFor({ scope: 'checklist' }, 'template');
  openSheet(`<h3>Nouvelle check-liste depuis une liste type</h3>${ts.length ? `<div class="btn-list">${ts.map(t => `<button data-id="${t.id}"><strong>${esc(t.name)}</strong>
    <span class="meta">${countLabel(t.items.length)}</span></button>`).join('')}</div>` : '<p class="empty small">Aucune liste type. Ouvre une check-liste puis « Définir comme type ».</p>'}`, c =>
    $$('[data-id]', c).forEach(btn => (btn.onclick = () => {
      const t = state.lists.find(x => x.id === btn.dataset.id);
      const n = newNote('checklist', t.name);
      n.data.items = t.items.map(i => ({ id: uid(), t: i.t, done: false })); touch(n); save(); closeSheet(); nav('#/note/' + n.id);
    })));
}

/* ---------- Page d'une note ---------- */
VIEWS.note = (app, r) => {
  const n = noteById(r.id);
  if (!n) { app.innerHTML = '<p class="empty">Ce mémo n’existe plus.<br><a href="#/memos">Retour aux mémos</a></p>'; return; }
  const isCL = n.type === 'checklist';
  setTitle(TYPE_META[n.type].label.toUpperCase());
  const dupNote = () => {
    const c = JSON.parse(JSON.stringify(n));
    Object.assign(c, { id: uid(), title: noteTitle(n) + ' (copie)', fav: false, updatedAt: now() }); delete c.deletedAt;
    if (c.data.items) c.data.items.forEach((it, i) => { const old = it.id; it.id = uid() + i; if (c.type === 'voice') copyAudio(old, it.id); });
    state.notes.push(c); save(); toast('Note dupliquée.'); nav('#/note/' + c.id);
  };
  const delNote = () => confirmSheet(`Supprimer « ${noteTitle(n)} » ?`, 'Supprimer',
    () => { withUndo('Supprimé', () => kill(n)); nav(isCL ? '#/checklists' : '#/memos/type/' + n.type); });
  app.innerHTML = `<div class="card note-head ${keepClass(n)}">
      <div class="row"><span style="font-size:22px">${TYPE_META[n.type].icon}</span>
        <input id="n-title" class="grow titre-big" value="${esc(n.title)}" placeholder="${esc(TYPE_META[n.type].one)}">
        <button id="n-fav" aria-label="Favori">${n.fav ? '★' : '☆'}</button></div>
      ${expiryLabel(n) ? `<div class="meta" style="margin-top:6px">${esc(expiryLabel(n))}</div>` : ''}
      <div id="n-tags" class="tags"></div></div>
    <div id="n-body"></div>`;
  const refreshTags = () => { $('#n-tags').innerHTML = tagChips(n.title + ' ' + noteText(n), 12); };
  refreshTags();
  setSubtitle(noteTitle(n), n);
  $('#n-title').oninput = e => { n.title = e.target.value; touch(n); save(); setSubtitle(noteTitle(n), n); };
  $('#n-title').onchange = refreshTags;
  $('#n-fav').onclick = () => { n.fav = !n.fav; touch(n); save(); $('#n-fav').textContent = n.fav ? '★' : '☆'; };
  // Dupliquer / PDF / Supprimer : dans la ligne 1a du bandeau (+ sauvegarde, versions, listes types pour les check-listes). Pas de PDF pour le coffre.
  setActions([keepAction(n, () => render()), { icon: '⧉', label: 'Dupliquer', fn: dupNote },
    ...(n.type !== 'password' ? [{ icon: '📄', label: 'PDF', fn: () => printKeys(['n:' + n.id]) }] : []),
    { icon: '🗑', label: 'Supprimer', fn: delNote, cls: 'danger' }, ...(isCL ? listActions(checkCtx(n), { pdf: false }) : [])]);
  const box = $('#n-body');
  ({ checklist: bodyChecklist, divers: bodyDivers, password: bodyPassword, voice: bodyVoice }[n.type] || bodyItems)(box, n, refreshTags);
};

/* ---------- Fenêtre centrale sur fond flou (texte complet d'une ligne) ---------- */
function closePop() { const p = $('#pop'); p.hidden = true; p.innerHTML = ''; }
$('#pop').addEventListener('click', e => { if (!e.target.closest('.pop-tools') && !e.target.closest('textarea')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#pop').hidden) closePop(); });
function linePop(it, { onEdit, onDelete }) {
  const p = $('#pop');
  p.innerHTML = `<div class="pop-card"><div class="pop-text">${esc(it.t)}</div>
    <div class="pop-tools"><button data-e aria-label="Modifier">✎ Modifier</button><button data-d aria-label="Supprimer">🗑</button></div></div>`;
  p.hidden = false;
  $('[data-d]', p).onclick = ev => { ev.stopPropagation(); closePop(); onDelete(); };
  $('[data-e]', p).onclick = ev => {
    ev.stopPropagation();   // le bouton est retiré du DOM ci-dessous : sans ça, le clic fermerait la fenêtre
    $('.pop-text', p).outerHTML = `<textarea class="pop-edit" rows="3">${esc(it.t)}</textarea>`;
    const ta = $('textarea', p); ta.focus(); ta.select();
    $('.pop-tools', p).innerHTML = '<button data-ok class="btn-gold">OK</button>';
    $('[data-ok]', p).onclick = ev => { ev.stopPropagation(); const v = ta.value.trim(); closePop(); if (v) onEdit(v); };
  };
}

/* ---------- Check-liste : lignes compactes en 1, 2 ou 3 colonnes (20 lignes minimum par colonne) ---------- */
const CL_ROWS = 20;
function bodyChecklist(box, n) {
  const items = n.data.items;
  const draw = () => {
    const cols = n.data.cols || 2, rows = Math.max(CL_ROWS, Math.ceil(items.length / cols));
    const done = items.filter(i => i.done).length;
    box.innerHTML = `<form class="row" id="c-form" style="margin-bottom:8px"><input id="c-new" class="grow" placeholder="Ajouter une ligne…" autocomplete="off"><button class="btn-green" type="submit">＋</button></form>
      <div class="cl-bar"><span class="meta grow">${done}/${items.length}</span>
        <span class="seg" role="group" aria-label="Colonnes">${[1, 2, 3].map(c => `<button data-cols="${c}" class="${c === cols ? 'on' : ''}" aria-label="${c} colonne${c > 1 ? 's' : ''}">${c}</button>`).join('')}</span>
        <button class="mini" id="c-paste" title="Coller plusieurs lignes">📋 Coller</button>
        ${items.length ? '<button class="mini" id="c-reset" title="Tout décocher">↺</button><button class="mini" id="c-sort" title="Cochés en bas">⇩</button>' : ''}</div>
      <div class="bar" style="margin:4px 0 8px"><i style="width:${items.length ? Math.round(100 * done / items.length) : 0}%"></i></div>
      <div class="cl-grid" style="--cols:${cols};--rows:${rows}">${items.map(i => `<div class="cl-row ${i.done ? 'done' : ''}" data-id="${i.id}">
        <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Coché"><span class="cl-t">${esc(i.t)}</span></div>`).join('')}</div>`;
    $('#c-form', box).onsubmit = e => {
      e.preventDefault(); const v = $('#c-new', box).value.trim(); if (!v) return;
      items.push({ id: uid(), t: v, done: false }); touch(n); save(); draw(); $('#c-new', box).focus();
    };
    $$('[data-cols]', box).forEach(b => (b.onclick = () => { n.data.cols = +b.dataset.cols; touch(n); save(); draw(); }));
    $$('.cl-row', box).forEach(el => {
      const it = items.find(x => x.id === el.dataset.id);
      $('input[type=checkbox]', el).onchange = e => { it.done = e.target.checked; touch(n); save(); draw(); };
      $('.cl-t', el).onclick = () => linePop(it, {
        onEdit: v => { it.t = v; touch(n); save(); draw(); },
        onDelete: () => withUndo('Ligne supprimée', () => { items.splice(items.indexOf(it), 1); draw(); }),
      });
    });
    $('#c-paste', box).onclick = () => openSheet(`<h3>Coller plusieurs lignes</h3><p class="meta">Une ligne de texte = une ligne de la liste.</p>
      <textarea id="cp" rows="10"></textarea><div class="row" style="margin-top:12px"><button class="grow" data-no>Annuler</button><button class="grow btn-gold" data-ok>Ajouter</button></div>`, c => {
      $('[data-no]', c).onclick = closeSheet;
      $('[data-ok]', c).onclick = () => {
        const lines = $('#cp', c).value.split('\n').map(l => l.replace(/^\s*(?:[-*•☐☑]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean);
        lines.forEach(t => items.push({ id: uid(), t, done: false }));
        if (lines.length) { touch(n); save(); draw(); } closeSheet(); toast(`${lines.length} ligne${lines.length > 1 ? 's' : ''} ajoutée${lines.length > 1 ? 's' : ''}.`);
      };
    });
    const rs = $('#c-reset', box); if (rs) rs.onclick = () => { items.forEach(i => (i.done = false)); touch(n); save(); draw(); };
    const so = $('#c-sort', box); if (so) so.onclick = () => { items.sort((a, b) => a.done - b.done); touch(n); save(); draw(); };
  };
  draw();
}

/* ---------- Mémo divers ---------- */
function bodyDivers(box, n, refreshTags) {
  box.innerHTML = Rich.editor(n.data.html, n.data.text, 'Écris ici… (#thème pour classer)', 'big');
  const t = debounce(refreshTags, 500);
  $('.rte', box).oninput = e => { Rich.bind(n.data, 'text', 'html', e.target); touch(n); save(); t(); };
}

/* ---------- Mémos à liste d'éléments : anniversaires, web, mails, lieux, photos ---------- */
const FIELDS = {
  links: [{ k: 'titre', l: 'Titre' }, { k: 'url', l: 'Adresse web', ph: 'https://…', type: 'url' }, { k: 'cat', l: 'Catégorie', cat: 1 }, { k: 'note', l: 'Note', area: 1 }],
  emails: [{ k: 'nom', l: 'Nom' }, { k: 'email', l: 'Adresse mail', type: 'email' }, { k: 'cat', l: 'Catégorie', cat: 1 }, { k: 'note', l: 'Note', area: 1 }],
  places: [{ k: 'nom', l: 'Nom du lieu' }, { k: 'adresse', l: 'Adresse' }, { k: 'cat', l: 'Catégorie', cat: 1 }, { k: 'note', l: 'Note', area: 1 }],
  birthdays: [{ k: 'nom', l: 'Nom' }, { k: 'j', l: 'Jour', type: 'number', min: 1, max: 31, third: 1 }, { k: 'm', l: 'Mois', type: 'number', min: 1, max: 12, third: 1 },
    { k: 'a', l: 'Année (option)', type: 'number', min: 1000, max: 3000, third: 1 }, { k: 'note', l: 'Note', area: 1 }],
  photos: [{ k: 'url', l: 'Adresse de l’image ou chemin Bunny', ph: 'https://… ou dossier/photo.jpg' }, { k: 'titre', l: 'Légende' }, { k: 'album', l: 'Album', cat: 1 }],
};
const DEFAULT_CATS = { places: ['Pro', 'Perso', 'Amis', 'Restaurants', 'Boutiques', 'À retenir'], links: ['Travail', 'Outils', 'Lecture', 'Loisirs', 'Shopping'],
  emails: ['Pro', 'Perso', 'Amis', 'Famille'], photos: ['Favoris'] };
const catKey = t => (t === 'photos' ? 'album' : 'cat');
const photoSrc = u => (/^https?:\/\//i.test(u) ? u : prefs.bunny ? prefs.bunny.replace(/\/+$/, '') + '/' + u.replace(/^\/+/, '') : '');
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
const mapsUrl = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

function itemMain(n, it) {
  return n.type === 'links' ? it.titre || hostOf(it.url) : n.type === 'emails' ? it.nom || it.email : n.type === 'places' ? it.nom || it.adresse
    : n.type === 'birthdays' ? it.nom : it.titre || '(sans légende)';
}
function itemRow(n, it) {
  let sub = '', act = '';
  if (n.type === 'links') { sub = hostOf(it.url); act = it.url ? `<a class="btn" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>` : ''; }
  else if (n.type === 'emails') {
    sub = it.email; act = (Core.validEmail(it.email) ? `<a class="btn" href="mailto:${esc(it.email)}">✉️</a>` : '') + `<button data-copy="${esc(it.email)}">📋</button>`;
  } else if (n.type === 'places') {
    sub = it.adresse; act = it.adresse || it.nom ? `<a class="btn" href="${esc(mapsUrl((it.nom + ' ' + it.adresse).trim()))}" target="_blank" rel="noopener noreferrer">📍</a>` : '';
    if (it.adresse) act += `<button data-copy="${esc(it.adresse)}">📋</button>`;
  } else if (n.type === 'birthdays') {
    const b = nextBday(it);
    sub = `${it.j} ${MOIS[it.m - 1]}${it.a ? ' ' + it.a : ''}${b.age !== null ? ` · ${b.age} ans` : ''} · ${b.days === 0 ? "aujourd'hui 🎉" : b.days === 1 ? 'demain' : 'dans ' + b.days + ' j'}`;
  }
  return `<div class="card item" data-id="${it.id}"><div class="grow" data-edit style="cursor:pointer;min-width:0"><strong>${esc(itemMain(n, it))}</strong>
    ${sub ? `<div class="meta">${esc(sub)}</div>` : ''}${it.note ? `<div class="meta">${esc(it.note.slice(0, 80))}</div>` : ''}</div>${act}</div>`;
}

function bodyItems(box, n, refreshTags) {
  const items = n.data.items, F = FIELDS[n.type], isPhoto = n.type === 'photos', isBday = n.type === 'birthdays';
  let q = '';
  const draw = () => {
    const f = norm(q);
    let list = items.filter(it => !f || norm(Object.values(it).join(' ')).includes(f));
    if (isBday) list = list.sort((a, b) => nextBday(a).days - nextBday(b).days);
    const groups = new Map();
    if (isBday) groups.set('', list);
    else list.sort((a, b) => itemMain(n, a).localeCompare(itemMain(n, b), 'fr')).forEach(it => {
      const g = it[catKey(n.type)] || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it);
    });
    const keys = [...groups.keys()].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b, 'fr'));
    $('#i-list', box).innerHTML = list.length ? keys.map(g => `${!isBday ? `<div class="h2">${esc(g || 'Sans catégorie')} <span class="meta">(${groups.get(g).length})</span></div>` : ''}
      ${isPhoto ? `<div class="grid">${groups.get(g).map(it => photoCell(it)).join('')}</div>` : groups.get(g).map(it => itemRow(n, it)).join('')}`).join('')
      : `<p class="empty">${items.length ? 'Aucun résultat.' : 'Aucun élément. Appuie sur « ＋ Ajouter ».'}</p>`;
    $$('[data-edit]', box).forEach(el => (el.onclick = () => itemSheet(n, items.find(x => x.id === el.closest('[data-id]').dataset.id), done)));
    $$('[data-copy]', box).forEach(el => (el.onclick = () => copyText(el.dataset.copy)));
    $$('.ph', box).forEach(el => (el.onclick = () => lightbox(n, items.find(x => x.id === el.dataset.id), done)));
  };
  const done = () => { touch(n); save(); draw(); refreshTags(); };
  box.innerHTML = `<div class="row" style="margin-bottom:10px">${items.length > 6 ? '<input type="search" id="i-q" class="grow" placeholder="Filtrer…">' : '<span class="grow"></span>'}
    ${n.type === 'links' || isPhoto ? '<button id="i-multi">Plusieurs</button>' : ''}<button class="btn-green" id="i-add">＋ Ajouter</button></div>
    ${isPhoto && !prefs.bunny ? '<p class="meta">Astuce : renseigne l’adresse de ta zone Bunny dans ⚙︎ Préférences pour n’avoir à saisir que le chemin des photos.</p>' : ''}
    <div id="i-list"></div>`;
  const qi = $('#i-q', box); if (qi) qi.oninput = e => { q = e.target.value; draw(); };
  $('#i-add', box).onclick = () => itemSheet(n, null, done);
  const mu = $('#i-multi', box); if (mu) mu.onclick = () => multiSheet(n, done);
  draw();
}
const photoCell = it => { const s = photoSrc(it.url); return `<button class="ph" data-id="${it.id}" aria-label="${esc(it.titre || 'Photo')}">${s
  ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(s)}" alt="${esc(it.titre)}">` : '<span class="meta">Adresse Bunny manquante</span>'}</button>`; };

function lightbox(n, it, done) {
  const s = photoSrc(it.url);
  openSheet(`<h3>${esc(it.titre || 'Photo')}${it.album ? ` <span class="chip">${esc(it.album)}</span>` : ''}</h3>
    ${s ? `<img class="big" referrerpolicy="no-referrer" src="${esc(s)}" alt="${esc(it.titre)}">` : ''}
    <div class="row" style="margin-top:12px"><button class="grow" data-e>Modifier</button>${s ? `<a class="btn grow" href="${esc(s)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>` : ''}<button class="grow" data-c>Fermer</button></div>`, c => {
    $('[data-c]', c).onclick = closeSheet; $('[data-e]', c).onclick = () => itemSheet(n, it, done);
  });
}

function itemSheet(n, it, done) {
  const F = FIELDS[n.type], key = catKey(n.type);
  const cats = [...new Set([...(DEFAULT_CATS[n.type] || []), ...n.data.items.map(x => x[key]).filter(Boolean)])];
  const val = k => (it && it[k] !== null && it[k] !== undefined ? it[k] : '');
  const field = f => `<label class="${f.third ? 'third' : ''}">${esc(f.l)}${f.area
    ? `<textarea name="${f.k}" rows="3" style="min-height:70px">${esc(val(f.k))}</textarea>`
    : `<input name="${f.k}" value="${esc(val(f.k))}" type="${f.type === 'url' || f.type === 'email' ? 'text' : f.type || 'text'}" ${f.min ? `min="${f.min}" max="${f.max}" inputmode="numeric"` : ''}
      ${f.type === 'email' ? 'inputmode="email"' : ''} ${f.cat ? 'list="cats"' : ''} placeholder="${esc(f.ph || '')}" autocomplete="off" autocapitalize="off">`}</label>`;
  openSheet(`<h3>${it ? 'Modifier' : 'Ajouter'}</h3><form class="form">${F.map(field).join('')}<datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row" style="margin-top:8px">${it ? '<button type="button" class="btn-red" data-del>🗑</button>' : ''}<button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Enregistrer</button></div></form>`, c => {
    const first = $('input', c); first && setTimeout(() => first.focus(), 60);
    $('[data-no]', c).onclick = closeSheet;
    const del = $('[data-del]', c);
    if (del) del.onclick = () => { closeSheet(); withUndo('Élément supprimé', () => { n.data.items.splice(n.data.items.indexOf(it), 1); touch(n); }); done(); };
    $('form', c).onsubmit = e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      Object.keys(fd).forEach(k => (fd[k] = String(fd[k]).trim()));
      let err = '';
      if (n.type === 'links') { fd.url = Core.safeUrl(fd.url); if (!fd.url) err = 'Adresse web invalide (http ou https).'; }
      else if (n.type === 'emails') { if (!Core.validEmail(fd.email)) err = 'Adresse mail invalide.'; }
      else if (n.type === 'places') { if (!fd.nom && !fd.adresse) err = 'Indique un nom ou une adresse.'; }
      else if (n.type === 'birthdays') {
        fd.j = parseInt(fd.j, 10); fd.m = parseInt(fd.m, 10); fd.a = fd.a ? parseInt(fd.a, 10) : null;
        if (!fd.nom) err = 'Indique un nom.'; else if (!(fd.j >= 1 && fd.j <= 31 && fd.m >= 1 && fd.m <= 12)) err = 'Date invalide.';
        else if (fd.a !== null && !(fd.a >= 1000 && fd.a <= 3000)) err = 'Année invalide.';
      } else if (n.type === 'photos') { fd.url = Core.safePhoto(fd.url); if (!fd.url) err = 'Adresse ou chemin de photo invalide.'; }
      if (err) return toast(err);
      if (it) Object.assign(it, fd); else n.data.items.push({ id: uid(), ...fd });
      closeSheet(); done();
    };
  });
}

/** Ajout en lot : une ligne par élément, « légende | adresse » ou simplement « adresse ». */
function multiSheet(n, done) {
  openSheet(`<h3>Ajouter plusieurs</h3><p class="meta">Une ligne par élément : <code>adresse</code> ou <code>${n.type === 'links' ? 'titre' : 'légende'} | adresse</code></p>
    <textarea id="ml" rows="8" placeholder="${n.type === 'links' ? 'Mon site | https://exemple.fr' : 'Plage | vacances/plage.jpg'}"></textarea>
    <div class="row" style="margin-top:12px"><button class="grow" data-no>Annuler</button><button class="grow btn-gold" data-ok>Ajouter</button></div>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('[data-ok]', c).onclick = () => {
      let ok = 0, bad = 0;
      $('#ml', c).value.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        const i = line.lastIndexOf('|'), label = i > -1 ? line.slice(0, i).trim() : '', raw = (i > -1 ? line.slice(i + 1) : line).trim();
        const url = n.type === 'links' ? Core.safeUrl(raw) : Core.safePhoto(raw);
        if (!url) return bad++;
        n.data.items.push(n.type === 'links' ? { id: uid() + ok, titre: label, url, cat: '', note: '' } : { id: uid() + ok, url, titre: label, album: '' }); ok++;
      });
      closeSheet(); if (ok) done(); toast(`${ok} ajouté${ok > 1 ? 's' : ''}${bad ? `, ${bad} ignoré${bad > 1 ? 's' : ''}` : ''}.`);
    };
  });
}

/* ---------- Coffre de mots de passe (chiffré) ---------- */
async function bodyPassword(box, n) {
  const tok = renderTok;
  const msg = html => { box.innerHTML = html; };
  if (!Vault.available()) return msg('<p class="empty">Le chiffrement n’est pas disponible ici (il faut une connexion HTTPS ou localhost).</p>');
  if (!state.vault) {
    msg(`<div class="card"><h3 style="margin-top:0">🔐 Coffre à mots de passe</h3>
      <p>Ces notes sont chiffrées sur ton appareil avec un mot de passe supplémentaire, distinct de tout autre.</p>
      <p><strong>Il ne peut pas être récupéré</strong> : s’il est perdu, le contenu est définitivement illisible.</p>
      <button class="btn-gold" id="v-setup" style="width:100%">Créer mon mot de passe du coffre</button></div>`);
    return ($('#v-setup', box).onclick = () => vaultSetupSheet(() => render()));
  }
  if (!vaultKey) {
    msg(`<form class="card" id="v-form"><h3 style="margin-top:0">🔒 Coffre verrouillé</h3>
      <input type="password" id="v-pw" placeholder="Mot de passe du coffre" autocomplete="current-password">
      <button class="btn-gold" type="submit" style="width:100%;margin-top:10px">Déverrouiller</button></form>`);
    const input = $('#v-pw', box); setTimeout(() => input.focus(), 80);
    return ($('#v-form', box).onsubmit = async e => {
      e.preventDefault();
      if (await unlockVault(input.value)) render(); else { toast('Mot de passe incorrect.'); input.select(); }
    });
  }
  let data = { items: [] };
  if (n.data.enc) {
    if (n.data.kid && n.data.kid !== state.vault.salt) return msg('<p class="empty">⚠️ Cette note a été chiffrée avec un autre mot de passe de coffre (créé sur un autre appareil ?).</p>');
    try { data = await Vault.decrypt(vaultKey, n.data.enc); } catch (e) { return msg('<p class="empty">⚠️ Impossible de déchiffrer cette note.</p>'); }
    if (!data || !Array.isArray(data.items)) data = { items: [] };
  }
  if (tok !== renderTok || !vaultKey) return;
  let seq = 0, q = '';
  const persist = async () => {
    const my = ++seq, key = vaultKey; if (!key) return;
    const enc = await Vault.encrypt(key, data);
    if (my !== seq) return;
    n.data.enc = enc; n.data.kid = state.vault.salt; touch(n); save();
  };
  const draw = () => {
    const f = norm(q);
    const list = data.items.filter(it => !f || norm(it.site + ' ' + it.login).includes(f)).sort((a, b) => a.site.localeCompare(b.site, 'fr'));
    $('#p-list', box).innerHTML = list.length ? list.map(it => `<div class="card item" data-id="${it.id}"><div class="grow" data-edit style="cursor:pointer;min-width:0">
      <strong>${esc(it.site || '(sans nom)')}</strong><div class="meta">${esc(it.login)}</div><div class="meta pw" hidden>${esc(it.pwd)}</div></div>
      <button data-show aria-label="Afficher">👁</button><button data-cl aria-label="Copier l’identifiant">👤</button><button data-cp aria-label="Copier le mot de passe">🔑</button></div>`).join('')
      : `<p class="empty">${data.items.length ? 'Aucun résultat.' : 'Aucune entrée.'}</p>`;
    $$('#p-list .card', box).forEach(el => {
      const it = data.items.find(x => x.id === el.dataset.id);
      $('[data-edit]', el).onclick = () => pwSheet(it);
      $('[data-show]', el).onclick = () => { const p = $('.pw', el); p.hidden = !p.hidden; };
      $('[data-cl]', el).onclick = () => copyText(it.login, 'Identifiant copié');
      $('[data-cp]', el).onclick = () => { copyText(it.pwd, 'Mot de passe copié (effacé dans 30 s)'); setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000); };
    });
  };
  const pwSheet = it => {
    openSheet(`<h3>${it ? 'Modifier' : 'Nouvelle entrée'}</h3><form class="form">
      <label>Site / service<input name="site" value="${esc(it?.site)}" autocomplete="off"></label>
      <label>Identifiant<input name="login" value="${esc(it?.login)}" autocomplete="off" autocapitalize="off"></label>
      <label>Mot de passe<div class="row"><input name="pwd" id="pw-f" class="grow" value="${esc(it?.pwd)}" autocomplete="off" autocapitalize="off"><button type="button" data-gen>🎲</button></div></label>
      <label>Note<textarea name="note" rows="3" style="min-height:70px">${esc(it?.note)}</textarea></label>
      <div class="row" style="margin-top:8px">${it ? '<button type="button" class="btn-red" data-del>🗑</button>' : ''}<button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Enregistrer</button></div></form>`, c => {
      $('[data-no]', c).onclick = closeSheet;
      $('[data-gen]', c).onclick = () => { $('#pw-f', c).value = Vault.generate(18); };
      const del = $('[data-del]', c);
      if (del) del.onclick = () => confirmSheet('Supprimer cette entrée ? (définitif)', 'Supprimer', () => { data.items.splice(data.items.indexOf(it), 1); persist(); draw(); });
      $('form', c).onsubmit = e => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target).entries());
        if (it) Object.assign(it, fd); else data.items.push({ id: uid(), ...fd });
        closeSheet(); persist(); draw();
      };
    });
  };
  msg(`<div class="row" style="margin-bottom:10px"><input type="search" id="p-q" class="grow" placeholder="Filtrer…">
    <button id="p-lock" title="Verrouiller">🔒</button><button class="btn-green" id="p-add">＋ Ajouter</button></div><div id="p-list"></div>`);
  $('#p-q', box).oninput = e => { q = e.target.value; draw(); };
  $('#p-add', box).onclick = () => pwSheet(null);
  $('#p-lock', box).onclick = () => lockVault();
  draw();
}

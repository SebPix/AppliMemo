/* AppliMémo — socle : utilitaires, état, annulation, fenêtres, routeur.
 * Les vues sont dans journee.js, notes.js, library.js, settings.js ; le démarrage dans main.js. */
'use strict';

const STORE_KEY = 'applimemo.v1';      // clé conservée : Core.migrate() convertit les anciens formats
const PREFS_KEY = 'applimemo.prefs';   // préférences propres à l'appareil
const BLOCK_COLORS = ['#e8d3b5', '#c8e6c9', '#cfe3ff', '#ffd2c8', '#e3d7ff', '#d6f2e8', '#fff3b0', '#ffffff'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const TYPE_META = {
  checklist: { icon: '☑️', label: 'Check-listes', one: 'Check-liste', def: 'Check-liste' },
  todo:      { icon: '❗', label: 'À faire', one: 'Note À faire', def: 'À faire' },
  password:  { icon: '🔐', label: 'Mots de passe', one: 'Coffre de mots de passe', def: 'Mots de passe' },
  divers:    { icon: '📝', label: 'Mémos divers', one: 'Mémo divers', def: '' },
  ecritures: { icon: '✍️', label: 'Écritures', one: 'Écriture', def: 'Écriture' },
  birthdays: { icon: '🎂', label: 'Anniversaires', one: 'Anniversaires', def: 'Anniversaires' },
  links:     { icon: '🌐', label: 'Adresses web', one: 'Adresses web', def: 'Adresses web' },
  emails:    { icon: '✉️', label: 'Adresses mail', one: 'Adresses mail', def: 'Adresses mail' },
  places:    { icon: '📍', label: 'Lieux', one: 'Lieux', def: 'Lieux' },
  photos:    { icon: '🖼️', label: 'Photos favorites', one: 'Photos favorites', def: 'Photos favorites' },
  voice:     { icon: '🎙️', label: 'Mémos vocaux', one: 'Mémo vocal', def: 'Mémos vocaux' },
};

/* ---------- Utilitaires ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let lastUid = 0;   // croissant même dans la même milliseconde : l'ordre des identifiants = ordre de création
const uid = () => { let t = Date.now(); if (t <= lastUid) t = lastUid + 1; lastUid = t; return t.toString(36) + Math.random().toString(36).slice(2, 5); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${JOURS[new Date(y, m - 1, d).getDay()]} ${pad(d)} ${MOIS[m - 1]} ${y}`;
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Barre de recherche des onglets racine (sous les premiers boutons). */
const searchHTML = (id, ph, v = '') => `<input type="search" id="${id}" class="root-q" placeholder="${ph}" value="${esc(v)}" autocomplete="off">`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
async function copyText(text, what = 'Copié') {
  try { await navigator.clipboard.writeText(text); toast(what + ' ✓'); } catch (e) { toast('Copie impossible.'); }
}

/* ---------- Préférences (appareil) ---------- */
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { /* ignoré */ }
  return Object.assign({ theme: 'auto', lockMin: 2, bunny: '', levelDays: {} }, p);
}
let prefs = loadPrefs();
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignoré */ } applyTheme(); }
function applyTheme() { document.documentElement.dataset.theme = prefs.theme; }

/* ---------- État & persistance ---------- */
const defaultState = () => Core.emptyState(todayISO());
function loadState() {
  try { return Core.migrate(JSON.parse(localStorage.getItem(STORE_KEY)), todayISO()); }
  catch (e) { return defaultState(); }   // données corrompues : on repart de zéro
}
let state = loadState();
const now = () => Date.now();
const touch = x => { x.updatedAt = now(); return x; };
const kill = x => { x.deletedAt = x.updatedAt = now(); return x; };   // suppression « pierre tombale »
const live = list => list.filter(x => !x.deletedAt);
const blocsOf = d => live(d.blocs).sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
const newestFirst = list => list.sort((a, b) => (a.id < b.id ? 1 : -1));
function setOrder(d, list) { list.forEach((b, i) => { if (b.pos !== i) { b.pos = i; touch(b); } }); }
function day(iso = state.current) {
  // une nouvelle journée est grise (1 semaine) par défaut ; les journées existantes gardent leur durée
  return state.days[iso] || (state.days[iso] = { date: iso, subtitle: '', updatedAt: 0, keep: 'week', blocs: [] });
}
const dayIsEmpty = d => !d.subtitle && !live(d.blocs).length;
const liveDays = () => Object.values(state.days).filter(d => !dayIsEmpty(d)).sort((a, b) => b.date.localeCompare(a.date));
const liveNotes = () => live(state.notes);
const MEMO_TYPES = Core.TYPES.filter(t => t !== 'checklist' && t !== 'todo');   // check-listes et notes À faire ont leur propre onglet
const noteById = id => liveNotes().find(n => n.id === id);

let saveTimer = null;
function save() {
  $('#save-state').textContent = '…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); $('#save-state').textContent = '✓'; }
  catch (e) { $('#save-state').textContent = '⚠'; toast('Stockage plein : exporte une sauvegarde.'); }
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* ---------- Durée d'archivage de chaque élément ----------
 * Chaque journée, note, check-liste, tâche et version a une durée d'archivage. Passé ce délai SANS MODIFICATION,
 * l'élément est effacé automatiquement (à l'ouverture de l'app). Code couleur : bandeau vertical à gauche. */
const KEEP = {
  never: { label: 'Illimitée', short: 'Illimitée', color: '#d63031', ms: 0, desc: 'Ne jamais effacer' },
  year:  { label: '1 année', short: '1 année', color: '#e67e22', ms: 365 * 864e5, desc: 'Effacé 1 an après la dernière modification' },
  month: { label: '1 mois', short: '1 mois', color: '#2b8cbd', ms: 30 * 864e5, desc: 'Effacé 1 mois après la dernière modification' },
  week:  { label: '1 semaine', short: '1 semaine', color: '#95a5a6', ms: 7 * 864e5, desc: 'Effacé 1 semaine après la dernière modification' },
  ondemand: { label: 'À la demande', short: 'À la demande', color: '#8e44ad', ms: 0, desc: 'Jamais effacé tout seul : l’app te propose de supprimer à la date choisie' },   // pastille arc-en-ciel
};
const KEEP_ORDER = Core.KEEPS;
const keepOf = x => (KEEP[x && x.keep] ? x.keep : 'never');
const keepClass = x => `kc k-${keepOf(x)}`;
const nextKeep = k => KEEP_ORDER[(KEEP_ORDER.indexOf(k) + 1) % KEEP_ORDER.length];
const isDue = (x, t = Date.now()) => keepOf(x) === 'ondemand' && !!x.proposeAt && x.proposeAt <= t;
/** Dernière activité : une journée compte aussi la dernière modification de ses blocs. */
const lastActivity = x => (x.blocs ? Math.max(x.updatedAt || 0, ...x.blocs.map(b => b.updatedAt || 0)) : x.updatedAt || 0);
const expiresAt = x => { const ms = KEEP[keepOf(x)].ms, la = lastActivity(x); return ms && la ? la + ms : 0; };
const isExpired = (x, t = Date.now()) => { const e = expiresAt(x); return !!e && t > e; };
const dateFR = ms => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const expiryLabel = x => (expiresAt(x) ? `Effacé le ${dateFR(expiresAt(x))} sans modification`
  : keepOf(x) === 'ondemand' && x.proposeAt ? `Suppression proposée le ${dateFR(x.proposeAt)}` : '');
/** at : date (ms) de la proposition de suppression, pour « à la demande » uniquement. */
function setKeep(x, k, at) { x.keep = k; if (k === 'ondemand' && at) x.proposeAt = at; else delete x.proposeAt; touch(x); save(); }
/** Tape sur une pastille pour passer à la durée suivante ; « à la demande » demande d'abord la date. */
function cycleKeep(x, after) {
  const k = nextKeep(keepOf(x));
  if (k === 'ondemand') proposeSheet(at => { setKeep(x, k, at); after(k); });
  else { setKeep(x, k); after(k); }
}

/** Efface (pierre tombale, contenu vidé) tout ce qui a dépassé sa durée d'archivage. Renvoie le nombre d'éléments. */
function purgeExpired(t = Date.now()) {
  let n = 0;
  for (const d of Object.values(state.days)) if (!dayIsEmpty(d) && isExpired(d, t)) { wipeDay(d); n++; }
  for (const x of live(state.todos)) if (isExpired(x, t)) { wipeTodo(x); n++; }
  for (const x of live(state.notes)) if (isExpired(x, t)) { wipeNote(x); n++; }
  for (const x of live(state.lists)) if (isExpired(x, t)) { wipeList(x); n++; }
  if (n) save();
  return n;
}
function wipeDay(d) { live(d.blocs).forEach(b => { b.titre = ''; b.texte = ''; delete b.html; kill(b); }); d.subtitle = ''; touch(d); }
const wipeTodo = x => { x.text = ''; x.note = ''; delete x.noteHtml; kill(x); };
const wipeNote = x => { x.title = ''; x.data = defaultData(x.type); kill(x); };
const wipeList = x => { x.name = ''; x.items = []; kill(x); };

/* ---------- « À la demande » : l'app propose de supprimer à une date choisie ---------- */
/** Date (minuit local) : demain, +1 semaine, +1 mois, +1 an. */
const PROPOSE = [
  ['Demain', d => d.setDate(d.getDate() + 1)], ['Dans 1 semaine', d => d.setDate(d.getDate() + 7)],
  ['Dans 1 mois', d => d.setMonth(d.getMonth() + 1)], ['Dans 1 an', d => d.setFullYear(d.getFullYear() + 1)],
];
function proposeAtFor(i) { const d = new Date(); d.setHours(0, 0, 0, 0); PROPOSE[i][1](d); return d.getTime(); }
/** Fenêtre « Proposer la suppression » : onPick(date en ms). */
function proposeSheet(onPick, onCancel) {
  openSheet(`<h3>Proposer la suppression</h3><div class="btn-list">${PROPOSE.map(([l], i) => `<button class="keepopt" data-p="${i}"><i class="kdot k-ondemand"></i>
    <span style="flex:1;text-align:left"><strong>${esc(l)}</strong><br><span class="meta">le ${esc(dateFR(proposeAtFor(i)))}</span></span></button>`).join('')}</div>
    <button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-no]', c).onclick = () => { closeSheet(); onCancel && onCancel(); };
    $$('[data-p]', c).forEach(b => (b.onclick = () => { closeSheet(); onPick(proposeAtFor(+b.dataset.p)); }));
  });
}
/** Éléments « à la demande » dont la date de proposition est arrivée. */
function dueProposals(t = Date.now()) {
  const out = [];
  for (const d of liveDays()) if (isDue(d, t)) out.push({ x: d, kind: 'La journée', name: longDate(d.date), wipe: wipeDay });
  for (const x of live(state.todos)) if (isDue(x, t)) out.push({ x, kind: 'La tâche', name: x.text || '(sans texte)', wipe: wipeTodo });
  for (const x of live(state.notes)) if (isDue(x, t)) out.push({ x, kind: 'Le mémo', name: `${noteIcon(x)} ${noteTitle(x)}`, wipe: wipeNote });
  for (const x of live(state.lists)) if (isDue(x, t)) out.push({ x, kind: x.kind === 'template' ? 'La liste type' : 'La version', name: x.name, wipe: wipeList });
  return out;
}
/** Propose, une par une, la suppression des éléments arrivés à échéance (sans rien faire si une fenêtre est déjà ouverte). */
function checkProposals() {
  if (!$('#sheet').hidden) return;
  const it = dueProposals()[0]; if (!it) return;
  const next = () => { render(); checkProposals(); };
  openSheet(`<h3>Supprimer ?</h3><p>${esc(it.kind)} <strong>« ${esc(it.name)} »</strong> est arrivé${it.kind.startsWith('La') ? 'e' : ''} à la date de suppression que tu avais choisie.</p>
    <div class="btn-list"><button class="btn-red" data-del>🗑 Supprimer</button><button data-later>⏰ Reporter…</button><button data-keep>Garder (ne plus demander)</button></div>`, c => {
    $('[data-del]', c).onclick = () => { closeSheet(); it.wipe(it.x); if (it.x.date) { it.x.keep = 'never'; delete it.x.proposeAt; } save(); toast('Supprimé.'); next(); };
    $('[data-later]', c).onclick = () => proposeSheet(at => { it.x.proposeAt = at; touch(it.x); save(); next(); }, () => {});
    $('[data-keep]', c).onclick = () => { closeSheet(); delete it.x.proposeAt; touch(it.x); save(); next(); };
  });
}

/** Fenêtre de choix des 4 durées. */
function keepSheet(current, onPick, title = 'Durée d’archivage') {
  openSheet(`<h3>${esc(title)}</h3><div class="btn-list">${KEEP_ORDER.map(k => `<button class="keepopt k-${k}" data-k="${k}"><i class="kdot k-${k}"></i>
    <span style="flex:1;text-align:left"><strong>${esc(KEEP[k].label)}</strong><br><span class="meta">${esc(KEEP[k].desc)}</span></span>${k === current ? '<b>✓</b>' : ''}</button>`).join('')}</div>`, c =>
    $$('[data-k]', c).forEach(b => (b.onclick = () => { closeSheet(); if (b.dataset.k === 'ondemand') proposeSheet(at => onPick('ondemand', at)); else onPick(b.dataset.k); })));
}
/** Bouton du bandeau supérieur : point de couleur + durée courante ; ouvre la fenêtre de choix. */
function keepAction(x, after) {
  const k = keepOf(x);
  return { icon: `<i class="kdot k-${k}"></i>`, label: `Archive : ${KEEP[k].short}`, fn: () => keepSheet(k, (nk, at) => { setKeep(x, nk, at); after && after(); }) };
}

/* ---------- Annuler ---------- */
function withUndo(message, action) {
  const snap = JSON.stringify(state);
  action();
  save();
  toast(message, 'Annuler', () => {
    const cur = state.current;
    state = Core.restoreFrom(Core.migrate(JSON.parse(snap), cur), state, now());
    save(); render();
  });
}

/* ---------- Toast & feuilles modales ---------- */
let toastTimer;
function toast(msg, actionLabel, onAction) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  t.hidden = false;
  if (actionLabel) $('button', t).onclick = () => { t.hidden = true; onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), actionLabel ? 6000 : 2500);
}
function openSheet(html, bind) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-card">${html}</div>`;
  s.hidden = false;
  s.onclick = e => { if (e.target === s) closeSheet(); };
  const card = $('.sheet-card', s);
  bind && bind(card);
  return card;
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
function confirmSheet(title, okLabel, onOk) {
  openSheet(`<h3>${esc(title)}</h3><div class="row"><button class="grow" data-no>Annuler</button><button class="grow btn-red" data-ok>${esc(okLabel)}</button></div>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('[data-ok]', c).onclick = () => { closeSheet(); onOk(); };
  });
}
/** Demande un texte : onOk(valeur) */
function promptSheet(title, { label = '', value = '', okLabel = 'OK', type = 'text', prefix = '' } = {}, onOk) {
  openSheet(`<h3>${esc(title)}</h3><form><label>${esc(label)}<div class="row">${prefix ? `<span style="font-weight:600">${esc(prefix)}</span>` : ''}
    <input type="${type}" name="v" value="${esc(value)}" autocomplete="off" class="grow"></div></label>
    <div class="row" style="margin-top:12px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">${esc(okLabel)}</button></div></form>`, c => {
    const input = $('input', c); setTimeout(() => { input.focus(); input.select(); }, 50);
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = e => { e.preventDefault(); const v = input.value; closeSheet(); onOk(v); };
  });
}

/* ---------- Routeur (hash) ----------
 * #/journee[/AAAA-MM-JJ]  #/afaire  #/memos  #/memos/type/<type>  #/note/<id>
 * #/biblio  #/tag/<clé>  #/reglages                                           */
const VIEWS = {};            // rempli par les fichiers de vues : VIEWS[nom] = (app, params) => …
let renderTok = 0;           // invalide les rendus asynchrones périmés
let navCount = 0;            // nombre de navigations depuis le chargement (pour le bouton retour)
const APP_VERSION = '1.1.3';
const TITLES = { menu: `APPLI MEMO / version N° ${APP_VERSION}`, journee: 'MA JOURNÉE', afaire: 'À FAIRE', checklists: 'CHECK-LISTES', memos: 'MÉMOS', biblio: 'BIBLIOTHÈQUE', reglages: 'PRÉFÉRENCES' };

function parseRoute() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const name = parts[0] || 'menu';
  if (name === 'memos' && parts[1] === 'type') return { name: 'type', type: parts[2] };
  if (name === 'note') return { name: 'note', id: parts[1] };
  if (name === 'tag') return { name: 'tag', key: parts[1] };
  if (name === 'checklists' && parts[1] === 'type' && parts[2]) return { name: 'cltype', id: parts[2] };
  if (name === 'afaire' && parts[1] === 'tout') return { name: 'atout' };
  if (name === 'afaire' && parts[1] === 'theme') return { name: 'atheme', theme: parts.slice(2).join('/') };
  if (name === 'journee' && parts[1] === 'type') return { name: 'jtype' };
  if (name === 'journee') return { name: 'journee', date: /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : null };
  return VIEWS[name] ? { name } : { name: 'journee', date: null };
}
const TAB_OF = { journee: 'journee', afaire: 'afaire', checklists: 'checklists', memos: 'memos', type: 'memos', note: 'memos', biblio: 'biblio', tag: 'biblio', atheme: 'afaire', atout: 'afaire', cltype: 'checklists', jtype: 'journee', reglages: null };
const PARENT = { cltype: '#/checklists', jtype: '#/journee', atheme: '#/afaire', atout: '#/afaire', type: '#/memos', note: '#/memos', tag: '#/biblio', reglages: '#/menu' };

/* Mémoire par onglet : on retrouve la dernière fenêtre ouverte dans un onglet en y revenant depuis un autre ; un clic sur l'onglet déjà actif ramène à sa racine. */
const tabLast = {};
/* Page MENU d'accueil : tous les onglets en gros boutons, plus Préférences et ＋ Créer (barre du bas masquée sur cette page). */
VIEWS.menu = app => {
  const T = [['journee', '📅', 'Journée'], ['afaire', '❗', 'À faire'], ['checklists', '☑️', 'Check-listes'], ['memos', '📝', 'Mémos'], ['biblio', '📚', 'Bibliothèque'], ['quick', '<b class="rb-star">★</b>', 'Accès rapide']];
  app.innerHTML = `<div class="menu-wrap"><div class="menu-all"><div class="menu-grid">${T.map(([v, ic, lab]) => `<button type="button" class="menu-btn" data-go="${v}"><span class="mi">${ic}</span><strong>${lab}</strong></button>`).join('')}</div>
    <div class="menu-low"><button type="button" class="menu-small" data-go="reglages" aria-label="Préférences"><span class="mi">⚙︎</span><span>Préférences</span></button>
    <button type="button" class="menu-small menu-create" id="menu-add" aria-label="Créer"><span class="mi">＋</span><span>Créer</span></button></div></div></div>`;
  $$('[data-go]', app).forEach(b => (b.onclick = () => {
    const v = b.dataset.go;
    if (v === 'reglages') return nav('#/reglages');
    if (v === 'biblio' || v === 'quick') { libOverview = v === 'quick'; return nav('#/biblio'); }   // Bibliothèque et Accès rapide : deux boutons distincts
    nav(rememberedHash(v));   // un onglet s'ouvre sur sa dernière fenêtre
  }));
  $('#menu-add', app).onclick = quickAddSheet;
};
const tabOf = r => { const n = r.name === 'note' ? noteById(r.id) : null; return n && n.type === 'checklist' ? 'checklists' : n && n.type === 'todo' ? 'afaire' : TAB_OF[r.name]; };
const rememberedHash = tab => {
  const h = tabLast[tab]; if (!h) return '#/' + tab;
  const parts = decodeURIComponent(h.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const gone = (parts[0] === 'note' && !noteById(parts[1]))
    || (parts[0] === 'checklists' && parts[1] === 'type' && !state.lists.some(l => l.id === parts[2] && l.kind === 'template' && !l.deletedAt));
  return gone ? '#/' + tab : h;   // la note ou la liste type a été supprimée : retour à la racine
};
function nav(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function render() {
  closeSheet();
  if (!['note', 'atheme', 'atout'].includes(parseRoute().name)) dueShown = '';   // l'échéance des tâches est reproposée à chaque ouverture d'une fenêtre À faire
  adoptLegacyTodos();   // anciennes tâches isolées → une note « À faire » (une seule fois)
  const r = parseRoute();
  const app = $('#app');
  renderTok++;
  const n = r.name === 'note' ? noteById(r.id) : null;
  const tab = n && n.type === 'checklist' ? 'checklists' : n && n.type === 'todo' ? 'afaire' : TAB_OF[r.name];
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === tab));
  if (tab) tabLast[tab] = location.hash || '#/' + tab;
  $('#btn-back').hidden = !PARENT[r.name];
  $('#view-title').textContent = TITLES[r.name] || '';
  topSub = '';
  document.body.classList.remove('tpl-page');
  document.body.classList.toggle('on-menu', r.name === 'menu');   // page MENU : pas de barre d'onglets en bas   // fond vert des listes types : posé par leur vue
  $$('.top-row .tnav').forEach(x => x.remove()); $('.top-row').classList.remove('has-nav', 'has-tgl');
  { const fr = $('#filter-rows'); fr.hidden = true; fr.innerHTML = ''; }   // lignes de filtres : propres à la liste complète d'Accès rapide   // flèches de durée : propres à la fenêtre d'un niveau
  libChrome(r);
  setActions(null);
  VIEWS[r.name](app, r);
  syncTop();
  window.scrollTo(0, 0);
}

/* Bandeau du haut. Vocabulaire : ligne titre ; sous le titre, ligne 1a = boutons contextuels (#top-actions),
 * ligne 1b = outils de mise en forme (#fmt-bar, voir rich.js).
 *  - 1a : présente si la page a des boutons ; affichée par défaut.
 *  - 1b : disponible seulement s'il y a un texte à remplir dans la page (un éditeur .rte) ; si 1a est vide, 1b s'affiche seule.
 *  - Flèche ▴/▾ : seulement si 1a ET 1b existent (il y a alors quelque chose à échanger) ; si ni 1a ni 1b, seule la ligne titre reste.
 * Tout est recalculé par syncTop() quand la page ou son contenu change (éditeur déplié / replié, etc.). */
let topActions = [], fmtOpen = false;   // fmtOpen : l'utilisateur a choisi d'afficher 1b à la place de 1a (quand les deux existent)
let topSub = '', topSubKeep = 'never';   // nom de l'élément en cours (note, journée), affiché sous le titre quand la carte d'en-tête est repliée, couleur = durée d'archivage
function setSubtitle(t, item) { topSub = t || ''; topSubKeep = keepOf(item); syncTop(); }
function setActions(list) {
  topActions = list || [];
  $('#top-actions').innerHTML = topActions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}"><span>${a.icon}</span>${esc(a.label)}</button>`).join('');
  syncTop();
}
// appui d'1 s sur un bouton qui a une action « hold » (ex. thématique : renommer / supprimer) ; le clic qui suit est alors ignoré
let holdTimer = 0, held = false;
$('#top-actions').addEventListener('pointerdown', e => {
  const b = e.target.closest('button'), a = b && topActions[+b.dataset.i];
  clearTimeout(holdTimer); held = false;
  if (a && a.hold) holdTimer = setTimeout(() => { held = true; a.hold(); }, 1000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('#top-actions').addEventListener(ev, () => clearTimeout(holdTimer)));
$('#top-actions').addEventListener('contextmenu', e => e.preventDefault());
$('#top-actions').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (held) { held = false; return; }
  topActions[+b.dataset.i].fn();
});
function updateTop() { document.documentElement.style.setProperty('--toph', $('.topbar').offsetHeight + 'px'); }
window.addEventListener('resize', updateTop);
function setTitle(t) { $('#view-title').textContent = t; }

/* Appuis successifs sur le titre : (carte d'en-tête, ligne 1a/1b) → (masquée, visible) → (masquée, masquée) → (masquée, visible) → (visibles) → …
 * Les étapes qui ne changeraient rien (pas de carte, pas de ligne 1a/1b) sont sautées : aucun clic inutile. Remis à zéro à chaque changement de page. */
const FOLD_STEPS = [[0, 0], [1, 0], [1, 1], [1, 0]];
let foldIdx = 0;
let actionsExpanded = false, shownLine = '';   // appui long (1 s) sur le titre : la ligne visible (1a ou 1b) se déploie à la verticale (2 à 3 boutons par ligne)
const hasCard = () => { const c = $('#app').firstElementChild; return !!c && c.matches('.day-head, .note-head'); };   // seules les vraies cartes d'en-tête (journée, mémo) se replient avec le titre ; jamais le contenu de la fenêtre
function topLines() {
  const has1a = topActions.length > 0, has1b = !!$('#app .rte');
  const show1b = has1b && (fmtOpen || !has1a);
  return { has1a, has1b, show1b, show1a: has1a && !show1b, arrow: has1a && has1b };
}
const foldEff = (idx, rowOn) => ({ c: !!FOLD_STEPS[idx][0] && hasCard(), r: !!FOLD_STEPS[idx][1] && rowOn });
const sameFold = (a, b) => a.c === b.c && a.r === b.r;
function syncTop() {
  const L = topLines(), rowOn = L.show1a || L.show1b;
  $('#top-actions').hidden = !L.show1a;
  $('#fmt-bar').hidden = !L.show1b;
  $('.top-row2').hidden = !rowOn;
  $('#btn-fmt').hidden = $('.top-row2 > .vsep').hidden = !L.arrow;
  const btn = $('#btn-fmt');
  btn.textContent = L.show1b ? '▾' : '▴';
  btn.setAttribute('aria-expanded', L.show1b);
  btn.setAttribute('aria-label', L.show1b ? 'Revenir aux boutons' : 'Afficher la mise en forme du texte');
  if (!L.show1b) { const p = $('#fmt-pop'); p.hidden = true; }
  const f = foldEff(foldIdx, rowOn);
  const line = L.show1b ? 'b' : L.show1a ? 'a' : '';
  if (!line || f.r || line !== shownLine) actionsExpanded = false;   // on replie en changeant de ligne ou quand la ligne n'est plus visible
  shownLine = line;
  const vis = L.show1b ? $('#fmt-bar') : $('#top-actions');
  $('#top-actions').classList.toggle('expanded', actionsExpanded && line === 'a');
  $('#fmt-bar').classList.toggle('expanded', actionsExpanded && line === 'b');
  $('.top-row2').classList.toggle('expanded', actionsExpanded);
  if (actionsExpanded) vis.style.setProperty('--cols', Math.min(3, Math.max(2, Math.floor((vis.clientWidth || 300) / 110))));
  document.body.toggleAttribute('data-hide-card', f.c);
  const sub = $('#top-sub'); sub.textContent = topSub; sub.className = 'top-sub k-' + topSubKeep; sub.hidden = !(f.c && topSub);
  document.body.toggleAttribute('data-sub', !sub.hidden);
  document.body.toggleAttribute('data-hide-row', f.r);
  if (f.r) $('#fmt-pop').hidden = true;
  const title = $('#view-title'), cur = f;
  const foldable = FOLD_STEPS.some((_, i) => !sameFold(foldEff(i, rowOn), cur));
  title.classList.toggle('foldable', foldable);
  if (foldable) { title.setAttribute('role', 'button'); title.tabIndex = 0; } else { title.removeAttribute('role'); title.removeAttribute('tabindex'); }
  updateTop();
}
function foldNext() {
  const L = topLines(), rowOn = L.show1a || L.show1b, cur = foldEff(foldIdx, rowOn);
  for (let k = 1; k <= FOLD_STEPS.length; k++) {
    const i = (foldIdx + k) % FOLD_STEPS.length;
    if (!sameFold(foldEff(i, rowOn), cur)) { foldIdx = i; break; }
  }
  syncTop();
}
/* Appui long (1 s) sur le titre : déploie / replie la ligne visible (1a ou 1b). Sans effet si tous ses boutons tiennent déjà sur une ligne. */
let pressTimer = 0, longFired = false;
const titleEl = $('#view-title');
function toggleExpand() {
  const a = topLines().show1b ? $('#fmt-bar') : $('#top-actions');
  if (!actionsExpanded && (a.hidden || a.scrollWidth <= a.clientWidth + 1)) return false;
  actionsExpanded = !actionsExpanded; syncTop(); return true;
}
titleEl.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  longFired = false; clearTimeout(pressTimer);
  pressTimer = setTimeout(() => { longFired = toggleExpand(); }, 1000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(t => titleEl.addEventListener(t, () => clearTimeout(pressTimer)));
titleEl.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', () => { if (actionsExpanded) syncTop(); });
titleEl.addEventListener('click', () => { if (longFired) { longFired = false; return; } foldNext(); });
$('#view-title').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); foldNext(); } });
// un éditeur de texte qui apparaît / disparaît change la disponibilité de la ligne 1b
new MutationObserver(syncTop).observe($('#app'), { childList: true, subtree: true });   // callbacks déjà groupés par le navigateur
window.addEventListener('hashchange', () => { navCount++; foldIdx = 0; actionsExpanded = false; render(); });
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]'); if (!b) return;
  const v = b.dataset.view, cur = tabOf(parseRoute());
  nav(cur === v ? '#/' + v : rememberedHash(v));   // autre onglet : dernière fenêtre ; onglet actif : racine
});
// roue crantée : 1 clic = Préférences ; 2 clics rapprochés = retour à la page MENU d'accueil
let gearAt = 0;
$('#btn-gear').onclick = () => { const t = Date.now(); if (t - gearAt < 450) { gearAt = 0; nav('#/menu'); } else { gearAt = t; nav('#/reglages'); } };
$('#btn-back').onclick = () => {
  const r = parseRoute();
  const n = r.name === 'note' ? noteById(r.id) : null;
  if (r.name === 'atheme' || r.name === 'atout' || (n && n.type === 'todo')) return nav('#/afaire');   // fenêtres À faire : retour direct à l'onglet racine (même après avoir circulé entre durées)
  if (navCount > 0) history.back(); else nav(n ? (n.type === 'checklist' ? '#/checklists' : n.type === 'todo' ? '#/afaire' : `#/memos/type/${n.type}`) : PARENT[r.name] || '#/memos');
};

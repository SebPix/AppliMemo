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
  todo:      { icon: '👁️', label: 'À faire', one: 'Note À faire', def: 'À faire' },
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
  return Object.assign({ theme: 'auto', lockMin: 2, bunny: '', levelDays: {}, gmail: '', gClient: '', gCal: 'primary', gTitleOnly: true }, p);
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
const saveHooks = [];   // fonctions appelées après chaque modification (ex. synchronisation Google Agenda, voir gcal.js)
function save() {
  $('#save-state').textContent = '…';
  saveHooks.forEach(f => f());
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
  s.style.background = '';
  const card = $('.sheet-card', s);
  bind && bind(card);
  swipeToClose(s, card);
  return card;
}
/** Feuille du bas fermable en la glissant vers le bas (menu ＋ Créer, choix…). Désactivé si la feuille contient un champ de saisie
 *  (on ne perd pas un texte tapé par un geste involontaire) ; le geste ne démarre que si la feuille est défilée tout en haut. */
function swipeToClose(s, card) {
  if (card.querySelector('input, textarea, select, [contenteditable]')) return;
  card.insertAdjacentHTML('afterbegin', '<div class="sheet-grip" aria-hidden="true"></div>');
  let y0 = 0, dy = 0, drag = false, atTop = false;
  card.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; y0 = e.touches[0].clientY; dy = 0; drag = false; atTop = card.scrollTop <= 0; card.style.transition = 'none'; }, { passive: true });
  card.addEventListener('touchmove', e => {
    const d = e.touches[0].clientY - y0;
    if (!drag) { if (atTop && d > 8) drag = true; else return; }
    e.preventDefault();   // la feuille suit le doigt au lieu de défiler
    dy = Math.max(0, d);
    card.style.transform = `translateY(${dy}px)`;
    s.style.background = `rgba(0,0,0,${.4 * (1 - Math.min(1, dy / (card.offsetHeight || 1)))})`;
  }, { passive: false });
  const end = () => {
    if (!drag) return;
    drag = false; card.style.transition = 'transform .18s ease-out';
    if (dy > 80 || dy > card.offsetHeight * .3) { card.style.transform = 'translateY(100%)'; s.style.background = 'rgba(0,0,0,0)'; setTimeout(closeSheet, 170); }
    else { card.style.transform = ''; s.style.background = ''; }
  };
  card.addEventListener('touchend', end); card.addEventListener('touchcancel', end);
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
const APP_VERSION = '1.1.5';
const TITLES = { menu: `APPLI MEMO / version N° ${APP_VERSION}`, journee: 'JOURNÉES / PLANNING', afaire: 'À FAIRE', checklists: 'CHECK-LISTES', memos: 'MÉMOS', biblio: 'BIBLIOTHÈQUE', reglages: 'PRÉFÉRENCES' };

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
  if (name === 'journee' && parts[1] === 'planning') return { name: 'planning' };
  if (name === 'journee') return { name: 'journee', date: /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : null };
  return VIEWS[name] ? { name } : { name: 'journee', date: null };
}
const TAB_OF = { journee: 'journee', afaire: 'afaire', checklists: 'checklists', memos: 'memos', type: 'memos', note: 'memos', biblio: 'biblio', tag: 'biblio', atheme: 'afaire', atout: 'afaire', cltype: 'checklists', jtype: 'journee', planning: 'journee', reglages: null };
const PARENT = { cltype: '#/checklists', jtype: '#/journee', planning: '#/journee', atheme: '#/afaire', atout: '#/afaire', type: '#/memos', note: '#/memos', tag: '#/biblio', reglages: '#/menu' };

/* Mémoire par onglet : on retrouve la dernière fenêtre ouverte dans un onglet en y revenant depuis un autre ; un clic sur l'onglet déjà actif ramène à sa racine. */
const tabLast = {};
/* Page MENU d'accueil : tous les onglets en gros boutons, plus Préférences et ＋ Créer (barre du bas masquée sur cette page). */
VIEWS.menu = app => {
  const T = [['journee', '📅', 'Journées'], ['afaire', '👁️', 'À faire'], ['checklists', '☑️', 'Check-listes'], ['memos', '📝', 'Mémos'], ['biblio', '📚', 'Bibliothèque'], ['quick', '<b class="rb-star">★</b>', 'Accès rapide']];
  app.innerHTML = `<div class="menu-wrap"><div class="menu-all"><div class="menu-grid">${T.map(([v, ic, lab]) => `<button type="button" class="menu-btn" data-go="${v}"><span class="mi">${ic}</span><strong>${lab}</strong></button>`).join('')}</div>
    <div class="menu-low"><button type="button" class="menu-small" data-go="reglages" aria-label="Préférences"><span class="mi">⚙︎</span><span>Préférences</span></button>
    <button type="button" class="menu-small menu-create" id="menu-add" aria-label="Créer"><span class="mi">＋</span><span>Créer</span></button>
    <button type="button" class="menu-small menu-amelio ${ameliIsOn() ? 'on' : ''}" id="menu-amelio" aria-pressed="${ameliIsOn()}" aria-label="Améliorations"><span class="mi">💡</span><span>Améliorations</span></button></div></div></div>`;
  $$('[data-go]', app).forEach(b => (b.onclick = () => {
    const v = b.dataset.go;
    if (v === 'reglages') return nav('#/reglages');
    if (v === 'biblio' || v === 'quick') { libOverview = v === 'quick'; return nav('#/biblio'); }   // Bibliothèque et Accès rapide : deux boutons distincts
    nav(rememberedHash(v));   // un onglet s'ouvre sur sa dernière fenêtre
  }));
  $('#menu-add', app).onclick = quickAddSheet;
  $('#menu-amelio', app).onclick = ameliToggle;
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
/* Couleurs par rubrique : barre du haut (--sbar) et fond de page (--sbg), voir styles.css « body[data-sect] ».
 * Page MENU et Préférences gardent le jaune d'origine (pas de data-sect). */
const SECT_BAR = { journee: '#ed1a1a', afaire: '#1a6bed', checklists: '#15cf5c', memos: '#e39f17', lib: '#9278b0', quick: '#b3b3b3' };
function sectionOf(r, n) {
  if (r.name === 'biblio') return libOverview ? 'quick' : 'lib';   // Accès rapide = page 2/2 de la Bibliothèque
  if (r.name === 'tag') return 'lib';
  if (r.name === 'note') return !n ? 'memos' : n.type === 'checklist' ? 'checklists' : n.type === 'todo' ? 'afaire' : 'memos';
  const t = { journee: 'journee', jtype: 'journee', planning: 'journee', afaire: 'afaire', atheme: 'afaire', atout: 'afaire', checklists: 'checklists', cltype: 'checklists', memos: 'memos', type: 'memos' }[r.name];
  return t || '';
}
function applySection(r, n) {
  const sect = sectionOf(r, n);
  if (sect) document.body.dataset.sect = sect; else delete document.body.dataset.sect;
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = SECT_BAR[sect] || '#c4a33f';
}
let slideDir = 0;   // sens du dernier glissement entre rubriques (+1 suivante, −1 précédente) : anime l'arrivée de la page, voir swipe.js
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
  $('#view-title').textContent = TITLES[r.name] || '';
  $('#view-title').classList.remove('tt'); topSub = ''; topSubAlways = false; titleEdit = null;
  document.body.classList.remove('tpl-page');
  document.documentElement.classList.remove('plan-snap');   // aimantation du planning : posée par sa vue
  applySection(r, n);
  document.body.classList.toggle('on-menu', r.name === 'menu');   // page MENU : pas de barre d'onglets en bas   // fond vert des listes types : posé par leur vue
  $$('.top-row .tnav').forEach(x => x.remove()); $('.top-row').classList.remove('has-nav', 'has-tgl');
  { const fr = $('#filter-rows'); fr.hidden = true; fr.innerHTML = ''; }   // lignes de filtres : propres à la liste complète d'Accès rapide   // flèches de durée : propres à la fenêtre d'un niveau
  { const ds = $('#day-strip'); ds.hidden = true; ds.innerHTML = ''; }   // ligne de boutons d'une journée : posée par sa vue
  libChrome(r);
  { // icône du menu (rubrique) de la page, tout à gauche de la barre du haut, sur toutes les pages d'une rubrique
    const ico = { journee: '📅', afaire: '👁️', checklists: '☑️', memos: '📝', biblio: libOverview ? '<b class="rb-star">★</b>' : '📚' }[tab] || '';
    const ti = $('#top-ico'); ti.innerHTML = ico; ti.hidden = !ico;
    const up = !!parentHash(r);
    $('#top-arrow').hidden = !up;   // en avançant dans l'arborescence : flèche double « page précédente » à gauche de l'icône
    $('#top-back').hidden = !ico && !up;
  }
  setActions(null);
  VIEWS[r.name](app, r);
  syncTop();
  window.scrollTo(0, 0);
  if (slideDir) { app.removeAttribute('data-slide'); void app.offsetWidth; app.setAttribute('data-slide', slideDir > 0 ? 'next' : 'prev'); slideDir = 0; } else app.removeAttribute('data-slide');
}

/* Bandeau du haut. Vocabulaire : ligne titre ; sous le titre, ligne 1a = boutons contextuels (#top-actions),
 * ligne 1b = outils de mise en forme (#fmt-bar, voir rich.js). Elles se déroulent par des clics sur le titre : voir barNext() plus bas. */
let topActions = [];
let topSubAlways = false;   // vrai : le sous-titre (date de la journée, résumé du planning) reste affiché même carte d'en-tête dépliée
let titleEdit = null;       // action du stylo ✏️ du titre (renommer la journée / le planning)
let topSub = '', topSubKeep = 'never';   // nom de l'élément en cours (note, journée), affiché sous le titre quand la carte d'en-tête est repliée, couleur = durée d'archivage
function setSubtitle(t, item) { topSub = t || ''; topSubKeep = keepOf(item); syncTop(); }
/** Titre des pages Journée / Planning : « icône + nom ✏️ » dans la barre du haut, avec la date (ou un résumé) juste dessous. */
function setDayTitle({ icon, name, sub, item, onEdit, extra = '' }) {
  titleEdit = onEdit || null;
  const t = $('#view-title');
  t.classList.add('tt');
  t.innerHTML = `<span class="tt-ico">${icon}</span><span class="tt-name">${esc(name)}</span>${onEdit ? '<span class="tt-pen" role="button" tabindex="0" aria-label="Modifier le nom" title="Modifier le nom">✏️</span>' : ''}${extra}`;
  topSub = sub || ''; topSubKeep = keepOf(item); topSubAlways = true; syncTop();
}
function setActions(list) {
  topActions = list || [];
  $('#top-actions').innerHTML = topActions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}"><span>${a.icon}</span>${esc(a.label)}</button>`).join('');
  syncTop();
}
// appui d'1 s sur un bouton qui a une action « hold » (ex. thématique : renommer / supprimer) ; le clic qui suit est ignoré
// (même comportement pour la ligne 1a et pour la fenêtre centrale qui reprend ses boutons)
let holdTimer = 0, held = false;
function bindActionHost(host, afterRun) {
  host.addEventListener('pointerdown', e => {
    const b = e.target.closest('button'), a = b && topActions[+b.dataset.i];
    clearTimeout(holdTimer); held = false;
    if (a && a.hold) holdTimer = setTimeout(() => { held = true; if (afterRun) afterRun(); a.hold(); }, 1000);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => host.addEventListener(ev, () => clearTimeout(holdTimer)));
  host.addEventListener('contextmenu', e => e.preventDefault());
  host.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (held) { held = false; return; }
    const a = topActions[+b.dataset.i]; if (!a) return;
    if (afterRun) afterRun();
    a.fn();
  });
}
bindActionHost($('#top-actions'));
function updateTop() { document.documentElement.style.setProperty('--toph', $('.topbar').offsetHeight + 'px'); }
window.addEventListener('resize', updateTop);
function setTitle(t) { $('#view-title').textContent = t; }

/* Barre du haut — même comportement dans toutes les rubriques. Les boutons de la page ne sont plus sous le titre : ils s'ouvrent dans la LUCARNE,
 * une fenêtre au centre de l'écran, par un clic sur le titre (un deuxième clic sur le titre, ou un clic en dehors de la lucarne, la referme).
 * Sans bouton sur la page, le clic ne fait rien. État : 'none' | 'pop' (remis à zéro à chaque changement de page).
 * La mise en forme du texte n'est pas dans la lucarne : elle a sa propre bande (#fmt-strip, couleur intermédiaire entre la barre et le fond),
 * affichée d'office dès que la page contient un texte à remplir (.rte) et rétractable / dépliable par son bouton (#fmt-toggle).
 * Tout est recalculé par syncTop() quand la page ou son contenu change. */
let barState = 'none';
let fmtRetracted = false;   // bande de mise en forme rétractée (préférence de l'appareil)
let fmtMulti = false;       // appui long (1 s) sur « Mise en forme » : la bande passe sur 2 lignes ou plus ; une seule ligne par défaut (remis à zéro à chaque page)
try { fmtRetracted = localStorage.getItem('applimemo.fmt.retracted') === '1'; } catch (e) {}
function barLines() { return { has1a: topActions.length > 0, has1b: !!$('#app .rte') }; }
function effBar(L) { return barState === 'pop' && L.has1a ? 'pop' : 'none'; }
/** La lucarne : les boutons de la page (liste 1a), en grille, dans une fenêtre au centre. */
function renderBarPop(show) {
  const bp = $('#bar-pop'); bp.hidden = !show;
  if (!show) return;
  const label = ($('#view-title').innerText || '').replace(/✏️|\s+/g, ' ').trim();
  $('.bp-title', bp).textContent = label;
  $('.bp-grid', bp).innerHTML = topActions.map((a, i) => `<button type="button" data-i="${i}" class="${a.cls || ''}"><span>${a.icon}</span>${esc(a.label)}</button>`).join('');
}
function syncTop() {
  const L = barLines(), st = effBar(L);
  $('#top-actions').hidden = true;   // plus de ligne de boutons sous le titre : tout est dans la lucarne
  $('.top-row2').hidden = true;
  renderBarPop(st === 'pop');
  // bande de mise en forme : visible d'office s'il y a un texte à remplir ; rétractée = fine ligne avec « Mise en forme ▾ »
  const strip = $('#fmt-strip'), tg = $('#fmt-toggle');
  strip.hidden = !L.has1b;
  strip.classList.toggle('retracted', fmtRetracted);
  strip.classList.toggle('multi', fmtMulti && !fmtRetracted && L.has1b);
  tg.textContent = fmtRetracted ? 'Mise en forme ▾' : 'Mise en forme ▴';
  tg.setAttribute('aria-expanded', String(!fmtRetracted));
  tg.setAttribute('aria-label', fmtRetracted ? 'Déplier la mise en forme du texte' : 'Rétracter la mise en forme du texte');
  if (!L.has1b || fmtRetracted) $('#fmt-pop').hidden = true;
  const sub = $('#top-sub'); sub.textContent = topSub; sub.className = 'top-sub k-' + topSubKeep + (topSubAlways ? ' always' : ''); sub.hidden = !(topSub && topSubAlways);
  document.body.toggleAttribute('data-sub', !sub.hidden);
  updateTop();
}
function barNext() {
  const L = barLines(), cur = effBar(L);
  barState = cur === 'none' && L.has1a ? 'pop' : 'none';
  syncTop();
}
// lucarne : un clic en dehors la ferme ; un bouton lance son action puis ferme la lucarne
bindActionHost($('.bp-grid', $('#bar-pop')), () => { barState = 'none'; syncTop(); });
$('#bar-pop').addEventListener('click', e => { if (e.target === $('#bar-pop')) { barState = 'none'; syncTop(); } });
{ // appui long (1 s) sur « Mise en forme » : une ligne ↔ plusieurs lignes ; le clic bref rétracte / déplie
  const tgb = $('#fmt-toggle'); let t = 0, fired = false;
  tgb.addEventListener('pointerdown', e => { if (e.button > 0) return; fired = false; clearTimeout(t); t = setTimeout(() => { fired = true; fmtMulti = !fmtMulti; if (fmtMulti) fmtRetracted = false; syncTop(); }, 1000); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => tgb.addEventListener(ev, () => clearTimeout(t)));
  tgb.addEventListener('contextmenu', e => e.preventDefault());
  tgb.addEventListener('click', e => { if (fired) { fired = false; e.stopImmediatePropagation(); } }, true);
}
$('#fmt-toggle').onclick = () => {
  fmtRetracted = !fmtRetracted;
  try { localStorage.setItem('applimemo.fmt.retracted', fmtRetracted ? '1' : '0'); } catch (e) {}
  syncTop();
};
/* Le retour en arrière se fait par le bloc flèches + icône (#top-back), l'accueil par le bouton à 4 lignes (#btn-home). */
const titleEl = $('#view-title');
titleEl.addEventListener('contextmenu', e => e.preventDefault());
titleEl.addEventListener('click', e => { if (e.target.closest('.tt-pen')) { if (titleEdit) titleEdit(); return; } if (e.target.closest('button, a')) return; barNext(); });
titleEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (e.target.closest('.tt-pen')) { if (titleEdit) titleEdit(); } else barNext(); } });
// un éditeur de texte qui apparaît / disparaît change la disponibilité de la ligne 1b
new MutationObserver(syncTop).observe($('#app'), { childList: true, subtree: true });   // callbacks déjà groupés par le navigateur
window.addEventListener('hashchange', () => { navCount++; barState = 'none'; fmtMulti = false; render(); });
$('#tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]'); if (!b) return;
  const v = b.dataset.view, cur = tabOf(parseRoute());
  nav(cur === v ? '#/' + v : rememberedHash(v));   // autre onglet : dernière fenêtre ; onglet actif : racine
});
// bouton d'accueil (4 lignes horizontales)
$('#btn-home').onclick = () => nav('#/menu');   // bouton à 4 lignes horizontales, en haut à droite : page d'accueil (les Préférences sont sur l'accueil)
/** Page « au-dessus » dans l'arborescence (null : page racine → le clic sur le titre mène alors à l'accueil). */
function parentHash(r) {
  if (r.name === 'journee') return r.date ? '#/journee' : null;
  if (r.name === 'note') {
    const n = noteById(r.id);
    return !n ? '#/memos' : n.type === 'checklist' ? '#/checklists' : n.type === 'todo' ? '#/afaire' : `#/memos/type/${n.type}`;
  }
  return PARENT[r.name] || null;
}
/** Clic sur le titre : monte d'un niveau dans l'arborescence ; depuis une page racine, retour à l'accueil. */
function goUp() { nav(parentHash(parseRoute()) || '#/menu'); }
$('#top-back').onclick = goUp;   // flèches + icône de la rubrique = un seul bloc cliquable (page racine : accueil)

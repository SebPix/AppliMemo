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
  password:  { icon: '🔐', label: 'Mots de passe', one: 'Coffre de mots de passe', def: 'Mots de passe' },
  divers:    { icon: '📝', label: 'Mémos divers', one: 'Mémo divers', def: '' },
  birthdays: { icon: '🎂', label: 'Anniversaires', one: 'Anniversaires', def: 'Anniversaires' },
  links:     { icon: '🌐', label: 'Adresses web', one: 'Adresses web', def: 'Adresses web' },
  emails:    { icon: '✉️', label: 'Adresses mail', one: 'Adresses mail', def: 'Adresses mail' },
  places:    { icon: '📍', label: 'Lieux', one: 'Lieux', def: 'Lieux' },
  photos:    { icon: '🖼️', label: 'Photos favorites', one: 'Photos favorites', def: 'Photos favorites' },
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
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
async function copyText(text, what = 'Copié') {
  try { await navigator.clipboard.writeText(text); toast(what + ' ✓'); } catch (e) { toast('Copie impossible.'); }
}

/* ---------- Préférences (appareil) ---------- */
function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { /* ignoré */ }
  return Object.assign({ theme: 'auto', lockMin: 2, bunny: '' }, p);
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
const MEMO_TYPES = Core.TYPES.filter(t => t !== 'checklist');   // les check-listes ont leur propre onglet
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
};
const KEEP_ORDER = Core.KEEPS;
const keepOf = x => (KEEP[x && x.keep] ? x.keep : 'never');
const keepClass = x => `kc k-${keepOf(x)}`;
const nextKeep = k => KEEP_ORDER[(KEEP_ORDER.indexOf(k) + 1) % KEEP_ORDER.length];
/** Dernière activité : une journée compte aussi la dernière modification de ses blocs. */
const lastActivity = x => (x.blocs ? Math.max(x.updatedAt || 0, ...x.blocs.map(b => b.updatedAt || 0)) : x.updatedAt || 0);
const expiresAt = x => { const ms = KEEP[keepOf(x)].ms, la = lastActivity(x); return ms && la ? la + ms : 0; };
const isExpired = (x, t = Date.now()) => { const e = expiresAt(x); return !!e && t > e; };
const dateFR = ms => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
const expiryLabel = x => (expiresAt(x) ? `Effacé le ${dateFR(expiresAt(x))} sans modification` : '');
function setKeep(x, k) { x.keep = k; touch(x); save(); }

/** Efface (pierre tombale, contenu vidé) tout ce qui a dépassé sa durée d'archivage. Renvoie le nombre d'éléments. */
function purgeExpired(t = Date.now()) {
  let n = 0;
  for (const d of Object.values(state.days)) {
    if (dayIsEmpty(d) || !isExpired(d, t)) continue;
    live(d.blocs).forEach(b => { b.titre = ''; b.texte = ''; kill(b); }); d.subtitle = ''; touch(d); n++;
  }
  for (const x of live(state.todos)) if (isExpired(x, t)) { x.text = ''; x.note = ''; kill(x); n++; }
  for (const x of live(state.notes)) if (isExpired(x, t)) { x.title = ''; x.data = defaultData(x.type); kill(x); n++; }
  for (const x of live(state.lists)) if (isExpired(x, t)) { x.name = ''; x.items = []; kill(x); n++; }
  if (n) save();
  return n;
}

/** Fenêtre de choix des 4 durées. */
function keepSheet(current, onPick, title = 'Durée d’archivage') {
  openSheet(`<h3>${esc(title)}</h3><div class="btn-list">${KEEP_ORDER.map(k => `<button class="keepopt k-${k}" data-k="${k}"><i class="kdot k-${k}"></i>
    <span style="flex:1;text-align:left"><strong>${esc(KEEP[k].label)}</strong><br><span class="meta">${esc(KEEP[k].desc)}</span></span>${k === current ? '<b>✓</b>' : ''}</button>`).join('')}</div>`, c =>
    $$('[data-k]', c).forEach(b => (b.onclick = () => { closeSheet(); onPick(b.dataset.k); })));
}
/** Bouton du bandeau supérieur : point de couleur + durée courante ; ouvre la fenêtre de choix. */
function keepAction(x, after) {
  const k = keepOf(x);
  return { icon: `<i class="kdot k-${k}"></i>`, label: `Archive : ${KEEP[k].short}`, fn: () => keepSheet(k, nk => { setKeep(x, nk); after && after(); }) };
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
const TITLES = { journee: 'MA JOURNÉE', afaire: 'À FAIRE', checklists: 'CHECK-LISTES', memos: 'MÉMOS', biblio: 'BIBLIOTHÈQUE', reglages: 'PRÉFÉRENCES' };

function parseRoute() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  const name = parts[0] || 'journee';
  if (name === 'memos' && parts[1] === 'type') return { name: 'type', type: parts[2] };
  if (name === 'note') return { name: 'note', id: parts[1] };
  if (name === 'tag') return { name: 'tag', key: parts[1] };
  if (name === 'journee') return { name: 'journee', date: /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') ? parts[1] : null };
  return VIEWS[name] ? { name } : { name: 'journee', date: null };
}
const TAB_OF = { journee: 'journee', afaire: 'afaire', checklists: 'checklists', memos: 'memos', type: 'memos', note: 'memos', biblio: 'biblio', tag: 'biblio', reglages: null };
const PARENT = { type: '#/memos', note: '#/memos', tag: '#/biblio', reglages: '#/journee' };

function nav(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function render() {
  closeSheet();
  const r = parseRoute();
  const app = $('#app');
  renderTok++;
  const n = r.name === 'note' ? noteById(r.id) : null;
  const tab = n && n.type === 'checklist' ? 'checklists' : TAB_OF[r.name];
  $$('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.view === tab));
  $('#btn-back').hidden = !PARENT[r.name];
  $('#view-title').textContent = TITLES[r.name] || '';
  setActions(null);
  VIEWS[r.name](app, r);
  updateTop();
  window.scrollTo(0, 0);
}

/* Barre d'actions contextuelle : 2e ligne du bandeau supérieur (défile si trop large). */
let topActions = [];
function setActions(list) {
  topActions = list || [];
  const el = $('#top-actions');
  el.hidden = !topActions.length;
  el.innerHTML = topActions.map((a, i) => `<button data-i="${i}" class="${a.cls || ''}"><span>${a.icon}</span>${esc(a.label)}</button>`).join('');
  updateTop();
}
$('#top-actions').addEventListener('click', e => { const b = e.target.closest('button'); if (b) topActions[+b.dataset.i].fn(); });
function updateTop() { document.documentElement.style.setProperty('--toph', $('.topbar').offsetHeight + 'px'); }
window.addEventListener('resize', updateTop);
function setTitle(t) { $('#view-title').textContent = t; }
window.addEventListener('hashchange', () => { navCount++; render(); });
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) nav('#/' + b.dataset.view); });
$('#btn-gear').onclick = () => nav('#/reglages');
$('#btn-back').onclick = () => {
  const r = parseRoute();
  const n = r.name === 'note' ? noteById(r.id) : null;
  if (navCount > 0) history.back(); else nav(n ? (n.type === 'checklist' ? '#/checklists' : `#/memos/type/${n.type}`) : PARENT[r.name] || '#/memos');
};

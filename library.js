/* Bibliothèque : arborescence de tout le contenu, recherche plein texte, thèmes (#) et sélection pour export. */
'use strict';

let libQuery = '';
let libSelect = false;
const libSel = new Set();                                   // clés : 'd:AAAA-MM-JJ', 'n:<id>'
const libOpen = new Set(['checks', 'memos', 'themes', ...MEMO_TYPES.map(t => 'type:' + t)]);

/* ---------- Index de tout le contenu ---------- */
function buildIndex() {
  const E = [];
  const add = e => { e.tags = Core.extractTags(e.title + '\n' + e.text); e.hay = norm(e.title + '\n' + e.text); E.push(e); };
  for (const d of liveDays()) {
    const blocs = blocsOf(d);
    add({ key: 'd:' + d.date, kind: 'Journées', icon: '📅', keep: keepOf(d), title: longDate(d.date), sub: d.subtitle, href: '#/journee/' + d.date, date: d.date,
      text: [d.subtitle, ...blocs.map(b => (b.titre + '\n' + b.texte).trim())].filter(Boolean).join('\n'), meta: `${blocs.length} bloc${blocs.length > 1 ? 's' : ''}` });
  }
  for (const n of liveNotes()) add({ key: 'n:' + n.id, kind: TYPE_META[n.type].label, icon: noteIcon(n), keep: keepOf(n), title: noteTitle(n), sub: '',
    href: '#/note/' + n.id, text: noteText(n), meta: noteMeta(n), type: n.type, locked: n.type === 'password' });
  return E;
}
function allTags(E) {
  const m = new Map();
  for (const e of E) for (const t of e.tags) {
    const x = m.get(t.key) || m.set(t.key, { key: t.key, label: t.label, count: 0 }).get(t.key);
    x.count++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
function snippet(e, words, tagKeys) {
  const text = e.text.replace(/\s+/g, ' ');
  const nt = norm(text);
  let i = -1;
  for (const w of words) { i = nt.indexOf(w); if (i > -1) break; }
  if (i < 0) for (const k of tagKeys) { i = nt.indexOf('#' + k); if (i > -1) break; }
  if (i < 0) return text.slice(0, 90);
  const s = Math.max(0, i - 25);
  return (s > 0 ? '…' : '') + text.slice(s, s + 100) + (text.length > s + 100 ? '…' : '');
}
function parseQuery(q) {
  const terms = q.trim().split(/\s+/).filter(Boolean);
  return { words: terms.filter(t => t[0] !== '#').map(norm), tagKeys: terms.filter(t => t[0] === '#' && t.length > 1).map(t => Core.tagKey(t.slice(1))) };
}
function runSearch(E, q) {
  const { words, tagKeys } = parseQuery(q);
  return E.filter(e => tagKeys.every(k => e.tags.some(t => t.key.startsWith(k))) && words.every(w => e.hay.includes(w)));
}

/* ---------- Vue Bibliothèque ---------- */
const entrySect = e => e.date ? 's-journee' : e.type === 'todo' ? 's-afaire' : e.type === 'checklist' ? 's-checklists' : e.type ? 's-memos' : '';   // rubrique d'une entrée de l'index
const row = (e, snip) => {
  const inner = `<span>${e.icon}</span><span class="grow" style="min-width:0"><strong>${esc(e.title)}</strong>${e.sub ? ` <span class="meta">· ${esc(e.sub)}</span>` : ''}
    ${snip ? `<div class="meta">${esc(snip)}</div>` : ''}</span><span class="meta">${esc(e.meta || '')}</span>`;
  return libSelect
    ? `<label class="lrow item ${e.keep ? 'kc k-' + e.keep : ''} ${entrySect(e)}"><input type="checkbox" data-sel="${e.key}" ${libSel.has(e.key) ? 'checked' : ''}> ${inner}</label>`
    : `<a class="lrow item ${e.keep ? 'kc k-' + e.keep : ''} ${entrySect(e)}" href="${e.href}">${inner}</a>`;
};
const section = (k, icon, title, count, body, keys, cls = '') => `<details data-k="${k}" ${libOpen.has(k) ? 'open' : ''} class="tree ${cls}">
  <summary><span>${icon} ${esc(title)}</span><span class="meta">${count}</span>${libSelect && keys && keys.length ? `<button class="mini" data-all="${esc(keys.join(','))}">tout</button>` : ''}</summary>${body}</details>`;

function drawLibrary() {
  const E = buildIndex(), body = $('#lib-body');
  if (libQuery.trim()) {
    const { words, tagKeys } = parseQuery(libQuery);
    const last = libQuery.trim().split(/\s+/).pop();
    const sugg = last[0] === '#' ? allTags(E).filter(t => t.key.startsWith(Core.tagKey(last.slice(1)))).slice(0, 8) : [];
    const res = runSearch(E, libQuery).slice(0, 150);
    const groups = new Map();
    res.forEach(e => { if (!groups.has(e.kind)) groups.set(e.kind, []); groups.get(e.kind).push(e); });
    body.innerHTML = `${sugg.length ? `<div class="tags">${sugg.map(t => `<button class="chip" data-tag="${esc(t.label)}">#${esc(t.label)} <span class="meta">${t.count}</span></button>`).join('')}</div>` : ''}
      <div class="meta" style="margin:6px 4px">${res.length} résultat${res.length > 1 ? 's' : ''}</div>
      ${[...groups].map(([k, list]) => `<div class="h2">${esc(k)}</div>${list.map(e => row(e, snippet(e, words, tagKeys))).join('')}`).join('')}`;
    $$('[data-tag]', body).forEach(b => (b.onclick = () => {
      const parts = libQuery.trim().split(/\s+/); parts[parts.length - 1] = '#' + b.dataset.tag; libQuery = parts.join(' ') + ' ';
      const i = $('#lib-q'); i.value = libQuery; i.focus(); drawLibrary();
    }));
  } else {
    const days = E.filter(e => e.date), months = new Map();
    days.forEach(e => { const m = e.date.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(e); });
    if (months.size && !libOpen.has('_init')) { libOpen.add('_init'); libOpen.add('m:' + [...months.keys()][0]); }
    const tags = allTags(E);
    const byType = t => E.filter(e => e.type === t);
    body.innerHTML = [
      section('days', '📅', 'Journées', days.length, days.length ? [...months].map(([m, list]) =>
        section('m:' + m, '', `${MOIS[+m.slice(5) - 1]} ${m.slice(0, 4)}`, list.length, list.map(e => row(e)).join(''), list.map(e => e.key))).join('') : '<p class="empty small">Aucune journée.</p>', days.map(e => e.key), 's-journee'),
      section('todo', '❗', 'À faire', byType('todo').length, byType('todo').length ? byType('todo').map(e => row(e)).join('') : '<p class="empty small">Aucune note À faire.</p>', byType('todo').map(e => e.key), 's-afaire'),
      section('checks', '☑️', 'Check-listes', byType('checklist').length, byType('checklist').length ? byType('checklist').map(e => row(e)).join('') : '<p class="empty small">Aucune check-liste.</p>', byType('checklist').map(e => e.key), 's-checklists'),
      section('memos', '📝', 'Mémos', E.filter(e => e.type && e.type !== 'checklist' && e.type !== 'todo').length, MEMO_TYPES.map(t => {
        const l = byType(t);
        return section('type:' + t, TYPE_META[t].icon, TYPE_META[t].label, l.length, l.length ? l.map(e => row(e)).join('') : '<p class="empty small">Vide.</p>', l.map(e => e.key));
      }).join(''), null, 's-memos'),
      section('themes', '#', 'Thèmes', tags.length, tags.length ? `<div class="tags" style="padding:6px 10px">${tags.map(t =>
        `<a class="chip" href="#/tag/${encodeURIComponent(t.key)}">#${esc(t.label)} <span class="meta">${t.count}</span></a>`).join('')}</div>`
        : '<p class="empty small">Écris <b>#mot</b> dans n’importe quelle note : il apparaîtra ici.</p>'),
    ].join('');
  }
  $$('[data-sel]', body).forEach(c => (c.onchange = () => { c.checked ? libSel.add(c.dataset.sel) : libSel.delete(c.dataset.sel); drawSelBar(); }));
  $$('[data-all]', body).forEach(b => (b.onclick = e => {
    e.preventDefault(); const keys = b.dataset.all.split(',');
    const all = keys.every(k => libSel.has(k)); keys.forEach(k => (all ? libSel.delete(k) : libSel.add(k))); drawLibrary(); drawSelBar();
  }));
}
function drawSelBar() {
  const bar = $('#sel-bar'); if (!bar) return;
  bar.hidden = !libSelect;
  $('#sel-n', bar).textContent = `${libSel.size} sélectionné${libSel.size > 1 ? 's' : ''}`;
  $$('button[data-x]', bar).forEach(b => (b.disabled = !libSel.size));
}

/* Deux pages dans l'onglet : 1/2 « Bibliothèque » (arborescence, page par défaut) et 2/2 « Accès rapide » (favoris, récents, À faire par urgence).
 * Un 2e appui sur l'onglet (déjà ouvert) passe à l'autre page ; depuis un autre onglet, on retrouve la dernière page vue. */
const LIBPAGE_KEY = 'applimemo.libpage';
let libOverview = false, libFull = false, libFullQ = '';   // libOverview : dernière page vue (mémorisée, y compris entre deux lancements)
try { libOverview = localStorage.getItem(LIBPAGE_KEY) === 'quick'; } catch (e) {}
// Phase de capture : on note si on était DÉJÀ dans l'onglet avant que le gestionnaire de navigation ne change l'adresse.
let wasInBiblio = false;
$('#tabbar').addEventListener('click', () => { wasInBiblio = parseRoute().name === 'biblio'; }, true);
$('#tabbar').addEventListener('click', e => {
  if (e.target.closest('button[data-view=biblio]') && wasInBiblio) { libOverview = !libOverview; render(); }   // déjà dedans : on alterne ; sinon on arrive sur la dernière page vue
});
/** Appelé par render() avant chaque page : mémorise la page et dessine l'onglet (nom, icône, « 1/2 » ou « 2/2 » en haut à droite de l'icône). */
function libChrome() {
  try { localStorage.setItem(LIBPAGE_KEY, libOverview ? 'quick' : 'lib'); } catch (e) {}
  const html = `<span class="ic">${libOverview ? '<b class="rb-star">★</b>' : '📚'}<sup class="pg">${libOverview ? '2/2' : '1/2'}</sup></span>${libOverview ? 'Accès rapide' : 'Bibliothèque'}`, tb = $('#tabbar [data-view=biblio]');
  tb.dataset.pg = libOverview ? 'quick' : 'lib';   // l'onglet prend la couleur de la page affichée (voir styles.css)
  if (tb.dataset.h !== html) { tb.dataset.h = html; tb.innerHTML = html; }   // ne réécrit que si ça change : sinon la cible d'un clic sur l'icône disparaît entre appui et relâchement
}

/** Rubrique d'une note (couleur de ses lignes dans Accès rapide : s-journee, s-afaire, s-checklists, s-memos). */
const noteSect = n => n.type === 'todo' ? 's-afaire' : n.type === 'checklist' ? 's-checklists' : 's-memos';

/** Liste complète : toutes les notes, la plus récemment modifiée en premier, filtrable par mot-clé. */
/** Tous les éléments (notes + journées) avec de quoi filtrer : catégorie, durabilité, thématiques (#mots-clés et thématiques À faire). */
function fullItems() {
  const themesOf = (text, extra = []) => [...new Set([...Core.extractTags(text).map(t => t.label), ...extra])];
  return [...liveNotes().map(n => ({ at: n.updatedAt, name: noteTitle(n), cat: n.type === 'todo' ? 'À faire' : TYPE_META[n.type].label, keep: keepOf(n),
      themes: themesOf(noteTitle(n) + '\n' + noteText(n), n.type === 'todo' ? [...new Set(n.data.items.map(i => i.theme).filter(Boolean))] : []),
      hay: norm(noteTitle(n) + ' ' + noteText(n)),
      html: `<a class="card item lrow ${keepClass(n)} ${noteSect(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : noteIcon(n)}</span><span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(n.type === 'todo' ? 'À faire' : TYPE_META[n.type].label)}</span></a>` })),
    ...liveDays().map(d => { const bl = blocsOf(d), title = longDate(d.date), txt = [d.subtitle, ...bl.map(x => x.titre + ' ' + x.texte)].join('\n');
      return { at: d.updatedAt, name: d.date, cat: 'Journées', keep: keepOf(d), themes: themesOf(txt), hay: norm([title, d.date, txt].join(' ')),
        html: `<a class="card item lrow ${keepClass(d)} s-journee" href="#/journee/${d.date}"><span>📅</span><span class="grow">${esc(title)}</span><span class="meta">Journée</span></a>` }; })];
}
/* Filtres de la liste complète : la ligne 1a porte les rubriques ; chacune déploie ses propositions sur une ligne en dessous (plusieurs choix possibles). */
const libFilt = { cat: new Set(), keep: new Set(), th: new Set(), sort: 'mod' };
const libFiltOpen = new Set();   // rubriques dont la ligne de propositions est déployée
const SORTS = { mod: 'Date de modification', name: 'Nom (A → Z)', cat: 'Catégorie' };
const filtActive = () => libFilt.cat.size + libFilt.keep.size + libFilt.th.size > 0;
function drawFullList(box, useFilters = false) {
  const words = norm(libFullQ).split(/\s+/).filter(Boolean);
  const F = useFilters ? libFilt : { cat: new Set(), keep: new Set(), th: new Set(), sort: 'mod' };
  const thSet = new Set([...F.th].map(norm));
  const items = fullItems()
    .filter(x => words.every(w => x.hay.includes(w)) && (!F.cat.size || F.cat.has(x.cat)) && (!F.keep.size || F.keep.has(x.keep)) && (!thSet.size || x.themes.some(t => thSet.has(norm(t)))))
    .sort((x, y) => F.sort === 'name' ? x.name.localeCompare(y.name, 'fr') : F.sort === 'cat' ? x.cat.localeCompare(y.cat, 'fr') || y.at - x.at : y.at - x.at);
  box.innerHTML = items.length ? items.map(x => x.html).join('') : '<p class="empty small">Rien ne correspond.</p>';
}
/** Liste complète : ligne 1a (rubriques + ↺ à droite) et lignes de propositions dans la barre jaune. */
function fullFilterBar() {
  const E = fullItems();
  const dims = [
    { k: 'cat', label: 'Catégorie', opts: [...new Set(E.map(x => x.cat))].sort((x, y) => x.localeCompare(y, 'fr')).map(c => [c, c]) },
    { k: 'keep', label: 'Durabilité', opts: KEEP_ORDER.filter(k => E.some(x => x.keep === k)).map(k => [k, KEEP[k].label]) },
    { k: 'th', label: 'Thématique', opts: [...new Map(E.flatMap(x => x.themes).map(t => [norm(t), t])).values()].sort((x, y) => x.localeCompare(y, 'fr')).map(t => [t, t]) },
    { k: 'sort', label: 'Tri', opts: Object.entries(SORTS), single: true },
  ];
  setActions([
    ...dims.map(d => ({ icon: '', label: d.label + (d.single ? '' : libFilt[d.k].size ? ` (${libFilt[d.k].size})` : ''), cls: libFiltOpen.has(d.k) ? 'on' : '',
      fn: () => { libFiltOpen.has(d.k) ? libFiltOpen.delete(d.k) : libFiltOpen.add(d.k); render(); } })),
    { icon: '↺', label: '', cls: 'filt-reset' + (filtActive() ? '' : ' off'), fn: () => { libFilt.cat.clear(); libFilt.keep.clear(); libFilt.th.clear(); libFilt.sort = 'mod'; render(); } },
  ]);
  const rows = $('#filter-rows');
  rows.innerHTML = dims.filter(d => libFiltOpen.has(d.k)).map(d => `<div class="frow" data-d="${d.k}"><span class="flab">${d.label}</span><div class="fchips">${
    d.opts.length ? d.opts.map(([v, lab]) => `<button type="button" class="fchip ${(d.single ? libFilt.sort === v : libFilt[d.k].has(v)) ? 'on' : ''}" data-v="${esc(v)}">${esc(lab)}</button>`).join('') : '<span class="meta">Aucune proposition</span>'}</div></div>`).join('');
  rows.hidden = !libFiltOpen.size;
  $$('.fchip', rows).forEach(b => (b.onclick = () => {
    const k = b.closest('.frow').dataset.d, v = b.dataset.v;
    if (k === 'sort') libFilt.sort = v; else libFilt[k].has(v) ? libFilt[k].delete(v) : libFilt[k].add(v);
    render();
  }));
}
const qMore = { fav: false, rec: false, th: false };   // « Afficher plus » déployé ?
function libraryOverview(app) {
  // titre + deux boutons côte à côte (le mode actif est en surbrillance)
  $('#view-title').innerHTML = `ACCÈS RAPIDE<span class="vt-tgl"><button type="button" data-vt="full" class="${libFull ? 'on' : ''}">Liste complète</button><button type="button" data-vt="short" class="${libFull ? '' : 'on'}">Liste réduite</button></span>`;
  $$('#view-title [data-vt]').forEach(b => {
    ['pointerdown', 'pointerup'].forEach(ev => b.addEventListener(ev, e => e.stopPropagation()));
    b.onclick = e => { e.stopPropagation(); libFull = b.dataset.vt === 'full'; render(); };
  });
  document.querySelector('.top-row').classList.add('has-tgl');
  if (libFull) {
    fullFilterBar();   // ligne 1a : rubriques de filtres ; leurs propositions se déploient en dessous, dans la barre jaune
  } else setActions(null);   // liste réduite : pas de ligne 1a, barre jaune rétractée
  if (libFull) {
    app.innerHTML = `<input type="search" id="full-q" placeholder="Rechercher un mot-clé…" value="${esc(libFullQ)}" autocomplete="off" style="margin-bottom:10px"><div id="full-list"></div>`;
    drawFullList($('#full-list'), true);
    $('#full-q').oninput = debounce(e => { libFullQ = e.target.value; drawFullList($('#full-list'), true); }, 120);
    return;
  }
  const notes = liveNotes(), byMod = (x, y) => y.updatedAt - x.updatedAt;
  const favs = notes.filter(n => n.fav).sort(byMod), recents = [...notes, ...liveDays().map(d => ({ day: d, updatedAt: d.updatedAt }))].sort(byMod);   // notes ET journées enregistrées
  const link = n => n.day ? `<a class="card item lrow ${keepClass(n.day)} s-journee" href="#/journee/${n.day.date}"><span>📅</span><span class="grow">${esc(longDate(n.day.date))}</span></a>`
    : `<a class="card item lrow ${keepClass(n)} ${noteSect(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : noteIcon(n)}</span><span class="grow">${esc(noteTitle(n))}</span></a>`;
  const lnotes = levelNotes(), levelTiles = todoLevels().map(l => {
    const n = lnotes.find(x => x.data.level === l.id), c = n ? openCount(n) : 0;
    return `<button type="button" class="tile lvl-tile" data-lvl="${l.id}"><span class="ti">${l.icon}</span><strong>${l.id === 'urgentissime' ? 'Urgentissime (NOW)' : esc(l.label)}</strong>
      <span class="meta">${c} tâche${c > 1 ? 's' : ''}</span><span class="keep-hint">${esc(fmtDays(levelDays(l.id)))}</span></button>`; }).join('');
  const ths = [...themeList(), ''], thShown = qMore.th ? ths : ths.slice(0, 8);   // 2 lignes de 4 au plus
  /* 5 premiers ; « Afficher plus » seulement s'il y en a davantage */
  const part = (list, key, empty) => {
    if (!list.length) return `<p class="empty small">${empty}</p>`;
    const more = qMore[key], shown = more ? list : list.slice(0, 5);
    return shown.map(link).join('') + (list.length > 5 ? `<button type="button" class="more-row" data-more="${key}">${more ? 'Afficher moins ▴' : `Afficher plus (${list.length - 5}) ▾`}</button>` : '');
  };
  app.innerHTML = `${searchHTML('quick-q', 'Rechercher dans toutes les notes et journées…', libFullQ)}<div id="quick-res" hidden></div>
    <div id="quick-body"><div class="h2">★ Favoris</div>${part(favs, 'fav', 'Aucun favori. Touche ☆ dans une note pour en ajouter.')}
    <div class="h2">Récents</div>${part(recents, 'rec', 'Aucune note pour l’instant.')}
    <div class="h2">À faire</div>
    <div class="tiles lvl-tiles lvl-tall">${levelTiles}</div>
    <div class="theme-block"><div class="h2">Thématiques</div>
    <div class="theme-tiles">${thShown.map(t => `<button type="button" class="tile theme-tile${t === '' ? ' no-theme' : ''}" data-theme="${esc(t)}"><strong>${t === '' ? NO_THEME : esc(t)}</strong><span class="meta">${themeEntries(t, '').filter(e => !e.t.done).length}</span></button>`).join('')}</div>
    ${ths.length > 8 ? `<button type="button" class="more-row" data-more="th">${qMore.th ? 'Afficher moins ▴' : `Afficher plus (${ths.length - 8}) ▾`}</button>` : ''}</div></div>`;
  const quickSearch = () => {
    const on = !!norm(libFullQ).trim(); $('#quick-res', app).hidden = !on; $('#quick-body', app).hidden = on;
    if (on) drawFullList($('#quick-res', app));
  };
  $('#quick-q', app).oninput = debounce(e => { libFullQ = e.target.value; quickSearch(); }, 120);
  quickSearch();
  $$('[data-more]', app).forEach(b => (b.onclick = () => { qMore[b.dataset.more] = !qMore[b.dataset.more]; render(); }));
  $$('[data-lvl]', app).forEach(b => (b.onclick = () => openLevelNote(b.dataset.lvl)));   // ouvre directement la fenêtre du niveau
  $$('[data-theme]', app).forEach(b => (b.onclick = () => nav('#/afaire/theme/' + encodeURIComponent(b.dataset.theme))));
}

VIEWS.biblio = app => {
  if (libOverview) return libraryOverview(app);
  app.innerHTML = `<div class="row" style="margin-bottom:10px"><input type="search" id="lib-q" class="grow" placeholder="Rechercher… (#thème, mot)" value="${esc(libQuery)}" autocomplete="off">
      <button id="lib-sel" class="${libSelect ? 'btn-gold' : ''}">${libSelect ? 'Annuler' : 'Sélection'}</button></div>
    <div id="lib-body"></div>
    <div id="sel-bar" class="selbar" hidden><span id="sel-n" class="grow"></span><button data-x="pdf" class="btn-blue">PDF</button><button data-x="json">JSON</button></div>`;
  $('#lib-q').oninput = debounce(e => { libQuery = e.target.value; drawLibrary(); }, 120);
  $('#lib-sel').onclick = () => { libSelect = !libSelect; if (!libSelect) libSel.clear(); VIEWS.biblio(app); };
  $('#sel-bar [data-x=pdf]').onclick = () => printKeys([...libSel]);
  $('#sel-bar [data-x=json]').onclick = () => exportJSON([...libSel]);
  drawLibrary(); drawSelBar();
};
$('#app').addEventListener('toggle', e => {
  const d = e.target.closest && e.target.closest('details[data-k]');
  if (d) d.open ? libOpen.add(d.dataset.k) : libOpen.delete(d.dataset.k);
}, true);

/* ---------- Page d'un thème (#) ---------- */
VIEWS.tag = (app, r) => {
  const E = buildIndex(), tag = allTags(E).find(t => t.key === r.key);
  const res = E.filter(e => e.tags.some(t => t.key === r.key));
  setTitle('#' + (tag ? tag.label : r.key).toUpperCase());
  const groups = new Map();
  res.forEach(e => { if (!groups.has(e.kind)) groups.set(e.kind, []); groups.get(e.kind).push(e); });
  app.innerHTML = res.length ? `<div class="meta" style="margin:0 4px 6px">${res.length} page${res.length > 1 ? 's' : ''} contiennent <strong>#${esc(tag.label)}</strong></div>
    ${[...groups].map(([k, list]) => `<div class="h2">${esc(k)}</div>${list.map(e => `<a class="lrow item" href="${e.href}"><span>${e.icon}</span>
      <span class="grow" style="min-width:0"><strong>${esc(e.title)}</strong><div class="meta">${esc(snippet(e, [], [r.key]))}</div></span></a>`).join('')}`).join('')}`
    : `<p class="empty">Plus aucune note ne contient ce thème.</p>`;
};

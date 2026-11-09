/* Bibliothèque : arborescence de tout le contenu, recherche plein texte, thèmes (#) et sélection pour export. */
'use strict';

let libQuery = '';
let libSelect = false;
const libSel = new Set();                                   // clés : 'd:AAAA-MM-JJ', 'todo', 'n:<id>'
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
  const todos = live(state.todos);
  if (todos.length) add({ key: 'todo', kind: 'À faire', icon: '❗', title: 'À faire', sub: '', href: '#/afaire', text: todos.map(t => t.text).join('\n'),
    meta: `${todos.filter(t => !t.done).length} à faire` });
  for (const n of liveNotes()) add({ key: 'n:' + n.id, kind: TYPE_META[n.type].label, icon: TYPE_META[n.type].icon, keep: keepOf(n), title: noteTitle(n), sub: '',
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
const row = (e, snip) => {
  const inner = `<span>${e.icon}</span><span class="grow" style="min-width:0"><strong>${esc(e.title)}</strong>${e.sub ? ` <span class="meta">· ${esc(e.sub)}</span>` : ''}
    ${snip ? `<div class="meta">${esc(snip)}</div>` : ''}</span><span class="meta">${esc(e.meta || '')}</span>`;
  return libSelect
    ? `<label class="lrow item ${e.keep ? 'kc k-' + e.keep : ''}"><input type="checkbox" data-sel="${e.key}" ${libSel.has(e.key) ? 'checked' : ''}> ${inner}</label>`
    : `<a class="lrow item ${e.keep ? 'kc k-' + e.keep : ''}" href="${e.href}">${inner}</a>`;
};
const section = (k, icon, title, count, body, keys) => `<details data-k="${k}" ${libOpen.has(k) ? 'open' : ''} class="tree">
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
    const tags = allTags(E), todo = E.find(e => e.key === 'todo');
    const byType = t => E.filter(e => e.type === t);
    body.innerHTML = [
      section('days', '📅', 'Journées', days.length, days.length ? [...months].map(([m, list]) =>
        section('m:' + m, '', `${MOIS[+m.slice(5) - 1]} ${m.slice(0, 4)}`, list.length, list.map(e => row(e)).join(''), list.map(e => e.key))).join('') : '<p class="empty small">Aucune journée.</p>', days.map(e => e.key)),
      section('todo', '❗', 'À faire', todo ? todo.meta : 0, todo ? row(todo) : '<p class="empty small">Aucune tâche.</p>', todo ? [todo.key] : []),
      section('checks', '☑️', 'Check-listes', byType('checklist').length, byType('checklist').length ? byType('checklist').map(e => row(e)).join('') : '<p class="empty small">Aucune check-liste.</p>', byType('checklist').map(e => e.key)),
      section('memos', '📝', 'Mémos', E.filter(e => e.type && e.type !== 'checklist').length, MEMO_TYPES.map(t => {
        const l = byType(t);
        return section('type:' + t, TYPE_META[t].icon, TYPE_META[t].label, l.length, l.length ? l.map(e => row(e)).join('') : '<p class="empty small">Vide.</p>', l.map(e => e.key));
      }).join('')),
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

/* Un 2e appui sur l'onglet Bibliothèque (déjà ouverte) bascule vers « Favoris & récents » (+ accès par urgence) ; encore un appui : retour à la bibliothèque. */
let libOverview = false;
$('#tabbar').addEventListener('click', e => {
  if (e.target.closest('button[data-view=biblio]') && parseRoute().name === 'biblio') { libOverview = !libOverview; render(); }
});
window.addEventListener('hashchange', () => { libOverview = false; });

function libraryOverview(app) {
  const notes = liveNotes(), favs = notes.filter(n => n.fav).sort((a, b) => noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  const recents = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  const link = n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : TYPE_META[n.type].icon}</span><span class="grow">${esc(noteTitle(n))}</span></a>`;
  app.innerHTML = `<div class="h2">★ Favoris</div>${favs.length ? favs.map(link).join('') : '<p class="empty small">Aucun favori. Touche ☆ dans une note pour en ajouter.</p>'}
    <div class="h2">Récents</div>${recents.length ? recents.map(link).join('') : '<p class="empty small">Aucune note pour l’instant.</p>'}
    <div class="h2">À faire — par urgence</div>
    ${TODO_QUICK.filter(t => t.id !== 'perso').map(t => `<a class="card item lrow" href="#/afaire" data-level="${t.id}"><span>${t.icon}</span><span class="grow">${esc(t.label)}</span></a>`).join('')}`;
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

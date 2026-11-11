/* Mémos typés : accueil, liste par type, éditeurs (check-liste, divers, anniversaires,
 * liens, mails, lieux, photos Bunny, coffre de mots de passe). */
'use strict';

/* ---------- Données ---------- */
function defaultData(type) {
  return type === 'divers' || type === 'ecritures' ? { text: '' } : type === 'password' ? { enc: null, kid: '' } : type === 'todo' ? { items: [], level: '' } : { items: [] };
}
function newNote(type, title) {
  const n = touch({ id: uid(), type, title, fav: false, data: defaultData(type) });
  state.notes.push(n); save();
  return n;
}
/** Texte brut d'une note (recherche, hashtags, PDF). Le coffre n'est jamais indexé. */
function noteText(n) {
  const d = n.data;
  if (n.type === 'divers' || n.type === 'ecritures') return d.text;
  if (n.type === 'password') return '';
  if (n.type === 'voice') return d.items.map(i => [i.titre, i.note].filter(Boolean).join(' ')).join('\n');
  if (n.type === 'todo') return d.items.map(i => [i.t, i.note].filter(Boolean).join(' ')).join('\n');
  return d.items.map(it => Object.entries(it).filter(([k, v]) => k !== 'id' && k !== 'done' && v !== null && v !== '').map(([, v]) => v).join(' ')).join('\n');
}
function noteMeta(n) {
  const d = n.data;
  if (n.type === 'checklist') { const its = d.items.filter(i => !i.blk); return `${its.filter(i => i.done).length}/${its.length}`; }
  if (n.type === 'todo') return `${d.items.filter(i => !i.done).length} à faire`;
  if (n.type === 'divers' || n.type === 'ecritures') return '';   // le nom seulement, pas le début du texte
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
let mmQ = '', clQ = '';
VIEWS.memos = app => {
  const notes = liveNotes().filter(n => n.type !== 'checklist' && n.type !== 'todo');
  const favs = notes.filter(n => n.fav), recents = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const list = arr => arr.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${TYPE_META[n.type].icon}</span>
    <span class="grow">${esc(noteTitle(n))}</span></a>`).join('');   // favoris et récents : le titre seulement
  app.innerHTML = `
    <div class="tiles">${MEMO_TYPES.map(t => `<a class="tile" href="#/memos/type/${t}"><span class="ti">${TYPE_META[t].icon}</span>
      <strong>${TYPE_META[t].label}</strong><span class="meta">${notes.filter(n => n.type === t).length}</span></a>`).join('')}</div>
    ${searchHTML('mm-q', 'Rechercher un mémo…', mmQ)}<div id="mm-res" hidden></div>
    <div id="mm-body">${favs.length ? `<div class="h2">★ Favoris</div>${list(favs)}` : ''}
    ${recents.length ? `<div class="h2">Récents</div>${list(recents)}` : '<p class="empty">Aucun mémo pour l’instant.<br>Choisis un type ci-dessus pour commencer.</p>'}</div>`;
  const mmSearch = () => {
    const words = norm(mmQ).split(/\s+/).filter(Boolean), res = $('#mm-res', app);
    res.hidden = !words.length; $('#mm-body', app).hidden = !!words.length;
    if (!words.length) return;
    const hits = notes.filter(n => words.every(w => norm(noteTitle(n) + ' ' + noteText(n)).includes(w))).sort((x, y) => y.updatedAt - x.updatedAt);
    res.innerHTML = hits.length ? hits.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : TYPE_META[n.type].icon}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(TYPE_META[n.type].label)}</span></a>`).join('') : '<p class="empty small">Aucun mémo ne correspond.</p>';
  };
  $('#mm-q', app).oninput = debounce(e => { mmQ = e.target.value; mmSearch(); }, 120);
  mmSearch();
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
  if (t === 'todo') return nav('#/afaire');
  if (!TYPE_META[t]) return nav('#/memos');
  setTitle(TYPE_META[t].label.toUpperCase());
  const notes = liveNotes().filter(n => n.type === t).sort((a, b) => (b.fav - a.fav) || noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  app.innerHTML = `<button class="btn-gold" id="t-new" style="width:100%;margin-bottom:12px">＋ Nouveau : ${esc(TYPE_META[t].one)}</button>
    ${notes.length ? notes.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : TYPE_META[t].icon}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(noteMeta(n))}</span></a>`).join('') : '<p class="empty">Rien ici pour l’instant.</p>'}`;
  $('#t-new').onclick = () => createNoteFlow(t);
};

/* ---------- Check-listes (onglet à part) ---------- */
const clSel = new Set();   // check-listes cochées (racine de l'onglet)
function cloneChecklist(src) {
  const c = JSON.parse(JSON.stringify(src));
  Object.assign(c, { id: uid(), title: noteTitle(src) + ' (copie)', fav: false, updatedAt: now() }); delete c.deletedAt;
  c.data.items.forEach((it, i) => { it.id = uid() + i; });
  state.notes.push(c); return c;
}
VIEWS.checklists = app => {
  const lists = liveNotes().filter(n => n.type === 'checklist').sort((a, b) => (b.fav - a.fav) || noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  [...clSel].forEach(id => { if (!lists.some(l => l.id === id)) clSel.delete(id); });
  app.innerHTML = `<div class="cl-top"><button type="button" class="sq" id="cl-new"><span class="sq-ic">＋</span><span>Nouvelle check-liste</span></button>
      <button type="button" class="sq" id="cl-tpl"><span class="sq-ic">📑</span><span>Listes types</span></button></div>
    ${searchHTML('cl-q', 'Rechercher une check-liste…', clQ)}
    ${lists.length ? `<div class="cl-sel"><label class="cl-all"><input type="checkbox" id="cl-all" aria-label="Tout sélectionner"> <span class="meta" id="cl-cnt"></span></label>
      <div class="cl-acts"><button class="mini" data-act="rename">✎ Renommer</button><button class="mini" data-act="dup">⧉ Dupliquer</button><button class="mini danger" data-act="del">🗑 Supprimer</button>
        <button class="mini" data-act="save">💾 Archiver</button><button class="mini" data-act="ver">🕘 Bibliothèque</button></div></div>` : ''}
    <div id="cl-list">${lists.length ? lists.map(n => `<div class="cl-li" data-id="${n.id}"><input type="checkbox" data-sel aria-label="Sélectionner" ${clSel.has(n.id) ? 'checked' : ''}>
      <a class="card item lrow grow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : '☑️'}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(noteMeta(n))}</span></a></div>`).join('')
      : '<p class="empty">Aucune check-liste.<br>Crée-en une, ou pars d’une liste type.</p>'}</div>`;
  const byId = id => lists.find(l => l.id === id);
  const visible = () => {
    const words = norm(clQ).split(/\s+/).filter(Boolean);
    return lists.filter(l => words.every(w => norm(noteTitle(l) + ' ' + noteText(l)).includes(w)));
  };
  const sync = () => {
    const vis = visible(), ids = new Set(vis.map(l => l.id));
    $$('#cl-list .cl-li', app).forEach(el => { el.hidden = !ids.has(el.dataset.id); $('[data-sel]', el).checked = clSel.has(el.dataset.id); });
    const sel = [...clSel].filter(id => ids.has(id)), all = $('#cl-all', app);
    if (!all) return;
    all.checked = vis.length > 0 && sel.length === vis.length;
    $('#cl-cnt', app).textContent = sel.length ? `${sel.length} sélectionnée${sel.length > 1 ? 's' : ''}` : 'Tout sélectionner';
    $$('[data-act]', app).forEach(b => { b.disabled = ['dup', 'del'].includes(b.dataset.act) ? !sel.length : sel.length !== 1; });
  };
  $('#cl-q', app).oninput = debounce(e => { clQ = e.target.value; sync(); }, 120);
  $$('#cl-list [data-sel]', app).forEach(cb => (cb.onchange = () => { const id = cb.closest('.cl-li').dataset.id; cb.checked ? clSel.add(id) : clSel.delete(id); sync(); }));
  const all = $('#cl-all', app);
  if (all) all.onchange = () => { visible().forEach(l => (all.checked ? clSel.add(l.id) : clSel.delete(l.id))); sync(); };
  const picked = () => visible().filter(l => clSel.has(l.id));
  $$('[data-act]', app).forEach(b => (b.onclick = () => {
    const ps = picked(), one = ps[0];
    if (b.dataset.act === 'rename') promptSheet('Renommer la check-liste', { label: 'Nom', value: one.title, okLabel: 'Renommer' }, v => { one.title = v.trim() || TYPE_META.checklist.def; touch(one); save(); render(); });
    else if (b.dataset.act === 'dup') { ps.forEach(cloneChecklist); save(); clSel.clear(); toast(ps.length > 1 ? `${ps.length} check-listes dupliquées.` : 'Check-liste dupliquée.'); render(); }
    else if (b.dataset.act === 'del') confirmSheet(ps.length > 1 ? `Supprimer ces ${ps.length} check-listes ?` : `Supprimer « ${noteTitle(one)} » ?`, 'Supprimer',
      () => { withUndo('Supprimé', () => ps.forEach(kill)); clSel.clear(); render(); });
    else if (b.dataset.act === 'save') saveVersion(checkCtx(one));
    else if (b.dataset.act === 'ver') versionsSheet(checkCtx(one));
  }));
  sync();
  $('#cl-new').onclick = () => createNoteFlow('checklist');
  $('#cl-tpl').onclick = checklistTemplates;
  if (tplReturn) { tplReturn = false; checklistTemplates(); }
};
/** Listes types : visibles uniquement ici (jamais dans la liste des check-listes). Chacune : créer une check-liste, modifier, renommer, dupliquer, supprimer. */
function checklistTemplates() {
  const draw = () => {
    const ts = listsFor({ scope: 'checklist' }, 'template');
    openSheet(`<h3>Listes types</h3>
      <div class="row tpl-top"><button class="btn-gold grow" data-new>＋ Nouvelle liste type</button><button class="grow" data-from>Depuis une liste</button></div>
      ${ts.length ? `<div class="tpl-list">${ts.map(t => `<div class="tpl-row" data-id="${t.id}">
        <button class="tpl-use" data-use title="Modifier cette liste type"><strong>${esc(t.name)}</strong> <span class="meta">${countLabel(t.items.length, 'élément')}</span></button>
        <button class="mini" data-ren aria-label="Renommer" title="Renommer">✎</button>
        <button class="mini" data-dup>Dupliquer</button><button class="mini danger" data-del aria-label="Supprimer" title="Supprimer">🗑</button></div>`).join('')}</div>`
      : '<p class="empty small">Aucune liste type. Crée-en une, ou pars d’une check-liste existante.</p>'}
      <button class="grow" data-close style="width:100%;margin-top:10px">Fermer</button>`, c => {
      $('[data-close]', c).onclick = closeSheet;
      // « Depuis une liste » : choisir une check-liste de la racine ; sa copie devient une liste type (l'originale reste dans les check-listes)
      $('[data-from]', c).onclick = () => {
        const ls = liveNotes().filter(x => x.type === 'checklist').sort((x, y) => noteTitle(x).localeCompare(noteTitle(y), 'fr'));
        openSheet(`<h3>Dupliquer depuis une check-liste</h3>${ls.length ? `<div class="btn-list">${ls.map(x => `<button data-pick="${x.id}" style="text-align:left"><strong>${esc(noteTitle(x))}</strong> <span class="meta">${countLabel(x.items ? x.items.length : x.data.items.filter(i => !i.blk).length, 'élément')}</span></button>`).join('')}</div>`
          : '<p class="empty small">Aucune check-liste à dupliquer.</p>'}<button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c3 => {
          $('[data-no]', c3).onclick = draw;
          $$('[data-pick]', c3).forEach(b2 => (b2.onclick = () => {
            const src = noteById(b2.dataset.pick);
            state.lists.push(touch({ id: uid(), scope: 'checklist', kind: 'template', ref: '', keep: 'never', name: noteTitle(src), sub: '',
              items: checkCtx(src).items().map(i => ({ ...i, done: false })) }));
            save(); toast('Liste type créée ⭐'); draw();
          }));
        });
      };
      $('[data-new]', c).onclick = () => openSheet(`<h3>Nouvelle liste type</h3><form class="form"><label>Nom<input name="v" placeholder="Liste type" autocomplete="off"></label>
        <label>Éléments <span class="meta">(une ligne de texte = un élément de la liste)</span><textarea name="t" rows="10"></textarea></label>
        <div class="row" style="margin-top:10px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Créer</button></div></form>`, c2 => {
        $('[data-no]', c2).onclick = draw;
        $('form', c2).onsubmit = e => {
          e.preventDefault();
          const f = e.target, name = f.elements.v.value.trim() || 'Liste type', lines = f.elements.t.value.split('\n').map(l => l.trim()).filter(Boolean);
          state.lists.push(touch({ id: uid(), scope: 'checklist', kind: 'template', ref: '', keep: 'never', name, sub: '', items: lines.map(x => ({ t: x, done: false, prio: 0, note: '' })) }));
          save(); toast('Liste type créée ⭐'); draw();
        };
        $('input', c2).focus();
      });
      $$('.tpl-row', c).forEach(el => {
        const t = state.lists.find(x => x.id === el.dataset.id);
        $('[data-ren]', el).onclick = () => promptSheet('Renommer la liste type', { label: 'Nom', value: t.name, okLabel: 'Renommer' }, v => { t.name = v.trim() || t.name; touch(t); save(); draw(); });
        $('[data-dup]', el).onclick = () => { state.lists.push(touch({ ...JSON.parse(JSON.stringify(t)), id: uid(), name: t.name + ' (copie)' })); save(); toast('Liste type dupliquée.'); draw(); };
        $('[data-del]', el).onclick = () => openSheet(`<h3>Supprimer la liste type « ${esc(t.name)} » ?</h3><div class="row"><button class="grow" data-no>Annuler</button><button class="grow btn-red" data-ok>Supprimer</button></div>`, c3 => {
          $('[data-no]', c3).onclick = draw;
          $('[data-ok]', c3).onclick = () => { kill(t); save(); draw(); toast('Liste type supprimée.'); };
        });
        // clic sur la liste : on arrive directement dans la check-liste type, à remplir comme une check-liste ordinaire
        $('[data-use]', el).onclick = () => { closeSheet(); nav('#/checklists/type/' + t.id); };
      });
    });
  };
  draw();
}
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

/** Étoile favori de la barre du haut (blanche, pleine si favori). */
const favStar = on => `<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.6l6.4-.9z" fill="${on ? '#fff' : 'none'}" stroke="#fff" stroke-width="1" stroke-linejoin="round"/></svg>`;

/* ---------- Page d'une note ---------- */
VIEWS.note = (app, r) => {
  const n = noteById(r.id);
  if (!n) { app.innerHTML = '<p class="empty">Ce mémo n’existe plus.<br><a href="#/memos">Retour aux mémos</a></p>'; return; }
  if (n.type === 'todo' && n.data.level) return levelWindow(app, n);   // fenêtre d'un niveau : thématiques en 1a, tâches
  const isCL = n.type === 'checklist';
  setTitle(TYPE_META[n.type].label.toUpperCase());
  const dupNote = () => {
    const c = JSON.parse(JSON.stringify(n));
    Object.assign(c, { id: uid(), title: noteTitle(n) + ' (copie)', fav: false, updatedAt: now() }); delete c.deletedAt;
    if (c.data.items) c.data.items.forEach((it, i) => { const old = it.id; it.id = uid() + i; if (c.type === 'voice') copyAudio(old, it.id); });
    state.notes.push(c); save(); toast('Note dupliquée.'); nav('#/note/' + c.id);
  };
  const delNote = () => confirmSheet(`Supprimer « ${noteTitle(n)} » ?`, 'Supprimer',
    () => { withUndo('Supprimé', () => kill(n)); nav(isCL ? '#/checklists' : n.type === 'todo' ? '#/afaire' : '#/memos/type/' + n.type); });
  app.innerHTML = isCL ? `<div id="n-tags" class="tags"></div><div id="n-body"></div>` : `<div class="card note-head ${keepClass(n)}" id="n-head">
      <div class="row nh-row"><div id="n-tags" class="tags grow"></div>
        ${expiryLabel(n) ? `<button type="button" class="info-btn" id="n-info" aria-label="Afficher ou masquer les informations de suppression" aria-pressed="false" title="Informations">i</button>` : ''}</div>
      ${expiryLabel(n) ? `<p class="meta day-info" id="n-expiry" hidden>${esc(expiryLabel(n))}</p>` : ''}</div>
    <div id="n-body"></div>`;
  const refreshTags = () => {
    const html = tagChips(n.title + ' ' + noteText(n), 12);
    $('#n-tags').innerHTML = html;
    const head = $('#n-head'); if (head) head.hidden = !html && !expiryLabel(n);   // carte d'en-tête vide : masquée
  };
  refreshTags();
  if (isCL) {
    // check-liste : pas de ligne « nom » ; le nom est dans la barre jaune (☑ et nom à la couleur de conservation), l'étoile favori à sa droite
    setSubtitle('', n);
    const star = favStar;
    $('#view-title').innerHTML = `<span class="cl-tabic">CHECK-LISTES</span><span class="title-pill cl-pill k-${keepOf(n)}"><span class="cl-pname">${esc(noteTitle(n))}</span></span><button type="button" id="n-fav" class="title-fav" aria-label="Favori">${star(n.fav)}</button>`;
    const fav = $('#n-fav');
    ['pointerdown', 'pointerup'].forEach(ev => fav.addEventListener(ev, e => e.stopPropagation()));
    fav.onclick = e => { e.stopPropagation(); n.fav = !n.fav; touch(n); save(); fav.innerHTML = star(n.fav); };
  } else {
    // mémo : comme une journée, « icône + nom ✏️ ★ » dans la barre du haut (type du mémo en dessous quand il a un nom) ; le favori ★ reste à côté du nom
    const readonly = n.type === 'todo' && n.data.now;
    setDayTitle({ icon: noteIcon(n), name: noteTitle(n), sub: n.title ? TYPE_META[n.type].one : '', item: n,
      onEdit: readonly ? null : () => promptSheet('Nom du mémo', { label: 'Nom', value: n.title || '', okLabel: 'OK' }, v => { n.title = v.trim(); touch(n); save(); render(); }),
      extra: `<button type="button" id="n-fav" class="title-fav" aria-label="Favori">${favStar(n.fav)}</button>` });
    const fav = $('#n-fav');
    fav.onclick = e => { e.stopPropagation(); n.fav = !n.fav; touch(n); save(); fav.innerHTML = favStar(n.fav); };
    const info = $('#n-info');
    if (info) info.onclick = () => { const on = $('#n-expiry').hidden; $('#n-expiry').hidden = !on; info.classList.toggle('on', on); info.setAttribute('aria-pressed', String(on)); };
  }
  // Dupliquer / PDF / Supprimer : dans la ligne 1a du bandeau (+ sauvegarde, versions, listes types pour les check-listes). Pas de PDF pour le coffre.
  // check-liste : renommer / dupliquer / supprimer / sauvegarder / versions / listes types sont à la racine de l'onglet Check-listes
  isCL ? setActions([keepAction(n, () => render()), { icon: n.cal ? '📆✓' : '📆', label: 'Agenda', fn: () => Gcal.noteSheet(n, () => render()) }, { icon: '📄', label: 'PDF', fn: () => printKeys(['n:' + n.id]) },
    ...listActions(checkCtx(n), { pdf: false }).filter(a => a.label === 'Définir comme type')]) : setActions([keepAction(n, () => render()), { icon: n.cal ? '📆✓' : '📆', label: 'Agenda', fn: () => Gcal.noteSheet(n, () => render()) }, { icon: '⧉', label: 'Dupliquer', fn: dupNote },
    ...(n.type !== 'password' ? [{ icon: '📄', label: 'PDF', fn: () => printKeys(['n:' + n.id]) }] : []),
    { icon: '🗑', label: 'Supprimer', fn: delNote, cls: 'danger' }, ...(isCL ? listActions(checkCtx(n), { pdf: false }) : []), ...(n.type === 'todo' ? listActions(todoCtx(n), { pdf: false }) : [])]);
  const box = $('#n-body');
  ({ checklist: bodyChecklist, todo: bodyTodo, divers: bodyDivers, ecritures: bodyDivers, password: bodyPassword, voice: bodyVoice }[n.type] || bodyItems)(box, n, refreshTags);
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
  let moveMode = false;          // mode « déplacer » : chaque élément se glisse à une autre position
  const openBlk = new Set();     // blocs de texte dépliés (affichage uniquement)
  const real = () => items.filter(i => !i.blk);
  const resize = ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  const draw = () => {
    const cols = n.data.cols || 2;
    const its = real(), done = its.filter(i => i.done).length, allDone = its.length > 0 && done === its.length;
    // répartition de gauche à droite : on remplit chaque ligne avant de passer à la suivante ; un bloc occupe une ligne entière
    let col = 0, rowsUsed = 0;
    items.forEach(i => { if (i.blk) { if (col) rowsUsed++; col = 0; rowsUsed++; } else if (++col === cols) { col = 0; rowsUsed++; } });
    const empties = (col ? cols - col : 0) + Math.max(0, Math.max(CL_ROWS, rowsUsed + 1) - rowsUsed - (col ? 1 : 0)) * cols;
    box.innerHTML = `<button type="button" class="add-many" id="c-add"><span class="plus-box">＋</span><span class="grow"><strong>Ajouter un ou plusieurs éléments</strong></span></button>
      <div class="cl-bar"><span class="meta grow">${done}/${its.length}</span>
        <span class="seg" role="group" aria-label="Colonnes">${[1, 2, 3].map(c => `<button data-cols="${c}" class="${c === cols ? 'on' : ''}" aria-label="${c} colonne${c > 1 ? 's' : ''}">${c}</button>`).join('')}</span>
        ${items.length ? `<button class="mini ${moveMode ? 'on blink' : ''}" id="c-move" title="Déplacer les éléments" aria-pressed="${moveMode}">✥</button>` : ''}
        ${its.length ? `<label class="cl-all" title="Tout sélectionner / désélectionner"><input type="checkbox" id="c-all" ${allDone ? 'checked' : ''} aria-label="Tout cocher ou décocher"></label>` : ''}</div>
      <div class="bar" style="margin:4px 0 8px"><i style="width:${its.length ? Math.round(100 * done / its.length) : 0}%"></i></div>
      <div class="cl-grid ${moveMode ? 'moving' : ''}" style="--cols:${cols}">${items.map(i => i.blk
        ? `<div class="cl-row blk" data-id="${i.id}"><button class="blk-tg" data-tg aria-label="Déplier / replier">${openBlk.has(i.id) ? '▾' : '▸'}</button>
            <textarea class="blk-t ${openBlk.has(i.id) ? '' : 'collapsed'}" rows="1" placeholder="Bloc de texte…" aria-label="Bloc de texte">${esc(i.t)}</textarea>
            ${openBlk.has(i.id) ? '<button class="blk-del mini" data-bdel aria-label="Supprimer le bloc">🗑</button>' : ''}</div>`
        : `<div class="cl-row ${i.done ? 'done' : ''}" data-id="${i.id}"><input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Coché"><span class="cl-t">${esc(i.t)}</span></div>`).join('')}${
        Array.from({ length: empties }, () => '<div class="cl-empty" data-empty aria-label="Ligne vide : ajouter un bloc de texte"></div>').join('')}</div>`;
    $$('[data-cols]', box).forEach(b => (b.onclick = () => { n.data.cols = +b.dataset.cols; touch(n); save(); draw(); }));
    $$('.cl-row:not(.blk)', box).forEach(el => {
      const it = items.find(x => x.id === el.dataset.id);
      $('input[type=checkbox]', el).onchange = e => { it.done = e.target.checked; touch(n); save(); draw(); };
      $('.cl-t', el).onclick = () => linePop(it, {
        onEdit: v => { it.t = v; touch(n); save(); draw(); },
        onDelete: () => withUndo('Ligne supprimée', () => { items.splice(items.indexOf(it), 1); draw(); }),
      });
    });
    // blocs de texte : flèche = déplier / replier (replié : première ligne seulement) ; Entrée = nouvelle ligne dans le bloc
    $$('.cl-row.blk', box).forEach(el => {
      const it = items.find(x => x.id === el.dataset.id), ta = $('textarea', el);
      if (openBlk.has(it.id)) resize(ta);
      ta.oninput = () => { it.t = ta.value; touch(n); save(); if (openBlk.has(it.id)) resize(ta); };
      ta.onblur = () => { if (!it.t.trim() && items.includes(it)) { items.splice(items.indexOf(it), 1); touch(n); save(); draw(); } };   // un bloc laissé vide disparaît
      $('[data-tg]', el).onclick = () => { openBlk.has(it.id) ? openBlk.delete(it.id) : openBlk.add(it.id); draw(); if (openBlk.has(it.id)) { const t2 = $(`.cl-row[data-id="${it.id}"] textarea`, box); t2.focus(); } };
      const del = $('[data-bdel]', el);
      if (del) del.onclick = () => withUndo('Bloc supprimé', () => { items.splice(items.indexOf(it), 1); draw(); });
    });
    // clic sur une ligne vide : un bloc de texte pleine largeur est créé (à la suite), les autres éléments se réagencent
    $$('[data-empty]', box).forEach(el => (el.onclick = () => {
      const b = { id: uid(), t: '', done: false, blk: true };
      items.push(b); touch(n); save(); draw();   // créé replié : une seule ligne
      const ta = $(`.cl-row[data-id="${b.id}"] textarea`, box); if (ta) ta.focus();
    }));
    $('#c-add', box).onclick = () => openSheet(`<h3>Ajouter un ou plusieurs éléments</h3><p class="meta">Une ligne de texte = un élément de la liste.</p>
      <textarea id="cp" rows="10"></textarea><div class="row" style="margin-top:12px"><button class="grow" data-no>Annuler</button><button class="grow btn-gold" data-ok>Ajouter</button></div>`, c => {
      $('[data-no]', c).onclick = closeSheet;
      $('[data-ok]', c).onclick = () => {
        const lines = $('#cp', c).value.split('\n').map(l => l.replace(/^\s*(?:[-*•☐☑]|\[[ xX]?\])\s*/, '').trim()).filter(Boolean);
        lines.forEach(t => items.push({ id: uid(), t, done: false }));
        if (lines.length) { touch(n); save(); draw(); } closeSheet(); toast(`${lines.length} élément${lines.length > 1 ? 's' : ''} ajouté${lines.length > 1 ? 's' : ''}.`);
      };
    });
    const all = $('#c-all', box); if (all) all.onchange = () => { real().forEach(i => (i.done = all.checked)); touch(n); save(); draw(); };
    const mv = $('#c-move', box); if (mv) mv.onclick = () => { moveMode = !moveMode; draw(); };
    if (moveMode) bindDrag();
  };

  /* Mode déplacer : on touche un élément et on le glisse vers une autre position (il se place avant la cible, ou en fin de liste sur une ligne vide). */
  function bindDrag() {
    const grid = $('.cl-grid', box);
    grid.onpointerdown = e => {
      const el = e.target.closest('.cl-row'); if (!el || !grid.contains(el)) return;
      e.preventDefault();
      const it = items.find(x => x.id === el.dataset.id); if (!it) return;
      const r0 = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      el.classList.add('lifting'); try { el.setPointerCapture(e.pointerId); } catch (_) {}
      let target = null, before = true;
      const clear = () => $$('.drop-before, .drop-after', grid).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      const move = ev => {
        el.style.transform = `translate(${ev.clientX - x0}px, ${ev.clientY - y0}px)`;
        clear(); target = null;
        const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x !== el && x.matches && x.matches('.cl-row, .cl-empty') && grid.contains(x));
        if (!under) return;
        target = under;
        if (under.matches('.cl-empty')) { under.classList.add('drop-before'); return; }
        const r = under.getBoundingClientRect(), cols = n.data.cols || 2;
        before = (cols === 1 || under.classList.contains('blk')) ? ev.clientY < r.top + r.height / 2 : ev.clientX < r.left + r.width / 2;
        under.classList.add(before ? 'drop-before' : 'drop-after');
      };
      const up = () => {
        grid.removeEventListener('pointermove', move); grid.removeEventListener('pointerup', up); grid.removeEventListener('pointercancel', up);
        el.classList.remove('lifting'); el.style.transform = ''; clear();
        if (target) {
          items.splice(items.indexOf(it), 1);
          if (target.matches('.cl-empty')) items.push(it);
          else { const t = items.find(x => x.id === target.dataset.id); items.splice(t ? items.indexOf(t) + (before ? 0 : 1) : items.length, 0, it); }
          touch(n); save();
        }
        draw();
      };
      grid.addEventListener('pointermove', move); grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
    };
  }
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
      <button class="btn-gold" type="submit" style="width:100%;margin-top:10px">Déverrouiller</button>
      <button type="button" id="v-hint" style="width:100%;margin-top:8px">💡 Indice</button><p id="v-hint-t" class="meta" hidden style="margin-top:8px"></p></form>`);
    $('#v-hint', box).onclick = () => { const p = $('#v-hint-t', box); p.hidden = !p.hidden; p.textContent = state.vault.hint || 'Aucune indication enregistrée (⚙︎ Préférences → Mots de passe).'; };
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

/** Icône d'une note : celle de son type ; pour une note « À faire », celle de son niveau (🔥 ❗ 👍 🌳). */
const noteIcon = n => (n.type === 'todo' ? levelIcon(n.data.level) : TYPE_META[n.type].icon);

/* ---------- Une check-liste type : même écran qu'une check-liste, en vert ---------- */
let tplReturn = false;   // au retour (flèche), on rouvre la fenêtre « Listes types »
const makeFromTemplate = t => promptSheet('Nom de la nouvelle check-liste', { label: 'Nom', value: t.name, okLabel: 'Créer' }, v => makeFromTemplateNamed(t, v.trim() || t.name));
const makeFromTemplateNamed = (t, name) => {
  const nn = newNote('checklist', name);
  nn.data.items = t.items.map(i => (i.blk ? { id: uid(), t: i.t, done: false, blk: true } : { id: uid(), t: i.t, done: false })); if (t.cols) nn.data.cols = t.cols;
  touch(nn); save(); nav('#/note/' + nn.id);
};
VIEWS.cltype = (app, r) => {
  const l = state.lists.find(x => x.id === r.id && x.kind === 'template' && !x.deletedAt);
  if (!l) { nav('#/checklists'); return; }
  tplReturn = true;
  l.items.forEach(i => { if (!i.id) i.id = uid(); });
  // la liste type sert de « note » à l'éditeur de check-liste : titre, données et date de modification sont ceux de la liste type
  const pn = { id: l.id, type: 'checklist', fav: false, keep: 'never',
    get title() { return l.name; }, set title(v) { l.name = v; }, get data() { return l; },
    get updatedAt() { return l.updatedAt; }, set updatedAt(v) { l.updatedAt = v; } };
  document.body.classList.add('tpl-page');
  setSubtitle('', null);
  $('#view-title').innerHTML = `<span class="cl-tabic">LISTE TYPE</span><span class="title-pill cl-pill tpl-pill"><span class="cl-pname">${esc(l.name)}</span></span>`;
  setActions([{ icon: '＋', label: 'Créer une check-liste', fn: () => makeFromTemplate(l) },
    { icon: '✎', label: 'Renommer', fn: () => promptSheet('Renommer la liste type', { label: 'Nom', value: l.name, okLabel: 'Renommer' }, v => { l.name = v.trim() || l.name; touch(l); save(); render(); }) }]);
  app.innerHTML = '<div id="n-body"></div>';
  bodyChecklist($('#n-body'), pn);
};

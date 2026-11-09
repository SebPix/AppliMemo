/* Versions enregistrées et listes types — partagées par « À faire » et les check-listes.
 *
 * Un « contexte » décrit la liste courante :
 *   { scope: 'todo' | 'checklist', ref: id de la check-liste ('' pour À faire), label,
 *     items(): [{t, done, prio, note}], apply(items), refresh(), pdf() }
 * Versions : propres à une liste (scope + ref). Listes types : communes à tout le scope. */
'use strict';

const todoCtx = () => ({
  scope: 'todo', ref: '', label: 'À faire',
  items: () => newestFirst(live(state.todos)).map(t => ({ t: t.text, done: t.done, prio: t.prio, note: t.note || '', ...(t.noteHtml ? { noteHtml: t.noteHtml } : {}) })),
  apply(items) {
    live(state.todos).forEach(kill);
    [...items].reverse().forEach(i => state.todos.push(touch({ id: uid(), text: i.t, done: !!i.done, prio: i.prio || 0, note: i.note || '', ...(i.noteHtml ? { noteHtml: i.noteHtml } : {}) })));
  },
  refresh: () => VIEWS.afaire($('#app')),
  pdf: () => printKeys(['todo']),
});
/** Journée : versions propres à une date ; journées types communes. Sauvegarder fixe aussi la durée de la journée. */
const dayCtx = date => ({
  scope: 'day', ref: date, label: 'Journée', typeWord: 'journée type', typeLabel: 'Journées types', unit: 'bloc',
  items: () => blocsOf(day(date)).map(b => ({ titre: b.titre, texte: b.texte, ...(b.html ? { html: b.html } : {}), couleur: b.couleur, horaire: b.horaire })),
  sub: () => day(date).subtitle,
  apply(items, l) {
    const d = day(date);
    live(d.blocs).forEach(kill);
    items.forEach((i, k) => d.blocs.push(touch({ id: uid(), titre: i.titre, texte: i.texte, ...(i.html ? { html: i.html } : {}), couleur: i.couleur, horaire: i.horaire, pos: k })));
    if (l && (l.kind === 'version' || l.sub)) d.subtitle = l.sub || '';
    touch(d);
  },
  onSave: (k, at) => setKeep(day(date), k, at),
  refresh: () => render(),
  pdf: () => printKeys(['d:' + date]),
});
const checkCtx = n => ({
  scope: 'checklist', ref: n.id, label: noteTitle(n),
  items: () => n.data.items.map(i => ({ t: i.t, done: i.done, prio: 0, note: '' })),
  apply(items) { n.data.items = items.map(i => ({ id: uid(), t: i.t, done: !!i.done })); touch(n); },
  refresh: () => render(),
  pdf: () => printKeys(['n:' + n.id]),
});

const fmtStamp = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const listsFor = (ctx, kind) => newestFirst(live(state.lists).filter(l => l.scope === ctx.scope && l.kind === kind && (kind === 'template' || l.ref === ctx.ref)));
const countLabel = (n, unit = 'ligne') => `${n} ${unit}${n > 1 ? 's' : ''}`;

/** Boutons communs de la barre du haut : sauvegarder, versions, listes types, définir comme type, PDF. */
function listActions(ctx, { pdf = true } = {}) {
  return [
    { icon: '💾', label: 'Sauvegarder', fn: () => saveVersion(ctx) },
    { icon: '🕘', label: 'Versions', fn: () => versionsSheet(ctx) },
    { icon: '📑', label: ctx.typeLabel || 'Listes types', fn: () => templatesSheet(ctx) },
    { icon: '⭐', label: 'Définir comme type', fn: () => defineTemplate(ctx) },
    ...(pdf ? [{ icon: '📄', label: 'PDF', fn: ctx.pdf }] : []),
  ];
}

/** Sauvegarde : demande le nom et la durée de conservation (grise = 1 semaine par défaut). */
function saveVersion(ctx) {
  if (!ctx.items().length && !(ctx.sub && ctx.sub())) return toast('Rien à sauvegarder : c’est vide.');
  openSheet(`<h3>Sauvegarder cette version</h3><form class="form"><label>Nom de la version<input name="v" value="${esc(`Version du ${fmtStamp()}`)}" autocomplete="off"></label>
    <div class="h2" style="margin-top:4px">Durée de sauvegarde</div>
    ${KEEP_ORDER.map(k => `<label class="keeppick kc k-${k}"><input type="radio" name="k" value="${k}" ${k === 'week' ? 'checked' : ''}><span><strong>${esc(KEEP[k].label)}</strong> <span class="meta">${esc(KEEP[k].desc)}</span></span></label>`).join('')}
    <div class="row" style="margin-top:10px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Sauvegarder</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = e => {
      e.preventDefault();
      const f = e.target, k = f.elements.k.value, name = f.elements.v.value.trim() || `Version du ${fmtStamp()}`;
      const finish = at => {
        const l = touch({ id: uid(), scope: ctx.scope, kind: 'version', ref: ctx.ref, keep: k, name, sub: ctx.sub ? ctx.sub() : '', items: ctx.items() });
        if (k === 'ondemand' && at) l.proposeAt = at;
        state.lists.push(l);
        if (ctx.onSave) ctx.onSave(k, at);
        save(); closeSheet(); toast(`Version sauvegardée 💾 (${KEEP[k].label})`);
        if (ctx.onSave) ctx.refresh();
      };
      if (k === 'ondemand') { closeSheet(); proposeSheet(finish); } else finish();
    };
  });
}
function defineTemplate(ctx) {
  if (!ctx.items().length) return toast('C’est vide : rien à définir comme type.');
  promptSheet(`Définir comme ${ctx.typeWord || 'liste type'}`, { label: `Nom de la ${ctx.typeWord || 'liste type'}`, value: ctx.label, okLabel: 'Enregistrer' }, name => {
    state.lists.push(touch({ id: uid(), scope: ctx.scope, kind: 'template', ref: '', keep: 'never', name: name.trim() || ctx.label,
      sub: ctx.sub ? ctx.sub() : '', items: ctx.items().map(i => (ctx.scope === 'day' ? i : { ...i, done: false })) }));
    save(); toast('Liste type enregistrée ⭐');
  });
}

function pickerSheet(ctx, kind, title, emptyMsg, loadLabel) {
  const draw = () => {
    const ls = listsFor(ctx, kind);
    openSheet(`<h3>${esc(title)}</h3>${ls.length ? `<div class="btn-list">${ls.map(l => `<div class="row ${keepClass(l)}" data-id="${l.id}" style="padding-left:8px">
      <button class="grow" data-load style="text-align:left"><strong>${esc(l.name)}</strong><br><span class="meta">${countLabel(l.items.length, ctx.unit)}${expiryLabel(l) ? ` · ${esc(expiryLabel(l))}` : ''}</span></button>
      <button data-keep aria-label="Durée d’archivage" title="Durée d’archivage : ${esc(KEEP[keepOf(l)].label)}"><i class="kdot k-${keepOf(l)}"></i></button>
      <button data-del aria-label="Supprimer">🗑</button></div>`).join('')}</div>` : `<p class="empty small">${esc(emptyMsg)}</p>`}
      <button class="grow" data-close style="width:100%;margin-top:10px">Fermer</button>`, c => {
      $('[data-close]', c).onclick = closeSheet;
      $$('[data-id]', c).forEach(el => {
        const l = state.lists.find(x => x.id === el.dataset.id);
        $('[data-load]', el).onclick = () => {
          closeSheet();
          withUndo(`${loadLabel} : ${l.name}`, () => ctx.apply(l.items.map(i => (ctx.scope === 'day' ? { ...i } : { ...i, done: kind === 'template' ? false : i.done })), l));
          ctx.refresh();
        };
        $('[data-keep]', el).onclick = () => cycleKeep(l, () => draw());
        $('[data-del]', el).onclick = () => { kill(l); save(); draw(); };
      });
    });
  };
  draw();
}
const versionsSheet = ctx => pickerSheet(ctx, 'version', 'Charger une ancienne version', 'Aucune version sauvegardée. Utilise « Sauvegarder ».', 'Version chargée');
const templatesSheet = ctx => pickerSheet(ctx, 'template', `Sélectionner une ${ctx.typeWord || 'liste type'}`, `Aucune ${ctx.typeWord || 'liste type'}. Utilise « Définir comme type ».`, 'Modèle chargé');

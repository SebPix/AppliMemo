/* Onglet « ＋ » (à gauche de la barre du bas) : menu pour créer n'importe quoi en un geste.
 *   Journée      › Aujourd'hui · Date à définir · Journée type
 *   À faire      › Urgentissime · Urgent · Moyen terme · Long terme · Nouvelle thématique   (en préparation : voir TODO_QUICK)
 *   Check-listes › Nouvelle · Depuis une liste type
 *   Mémo         › tous les types de mémo */
'use strict';

/** Entrées de « À faire » : en attente des précisions de l'utilisateur (niveaux d'urgence, note personnalisée).
 *  Pour l'instant : ouvre « À faire » et place le curseur dans « Nouvelle tâche… ». */
const TODO_QUICK = [
  { id: 'urgentissime', icon: '🔥', label: 'Urgentissime' },
  { id: 'urgent', icon: '❗', label: 'Urgent' },
  { id: 'moyen', icon: '🌱', label: 'Moyen terme' },
  { id: 'long', icon: '🌲', label: 'Long terme' },
  { id: 'infini', icon: '♾️', label: 'Infini' },
  { id: 'perso', icon: '🏷️', label: 'Nouvelle thématique' },
];

function quickTodo(level) {
  closeSheet();
  if (level === 'perso') { nav('#/afaire'); setTimeout(addThemeSheet, 80); }   // page À faire, puis fenêtre « Nouvelle thématique »
  else openLevelNote(level);   // ouverture directe de la note du niveau
}

/** Journée type : choisit la date puis le modèle. */
function dayTemplateSheet() {
  const ts = listsFor({ scope: 'day' }, 'template');
  openSheet(`<h3>Journée type</h3><label class="meta">Date de la journée<input type="date" id="qa-date" value="${todayISO()}" style="margin-top:4px"></label>
    <div class="btn-list" style="margin-top:12px">${ts.length ? ts.map(t => `<button data-id="${t.id}"><strong>${esc(t.name)}</strong> <span class="meta">${countLabel(t.items.length, 'bloc')}</span></button>`).join('')
      : '<p class="empty small">Aucune journée type. Ouvre une journée puis « Définir comme type ».</p>'}</div>
    <button class="grow" data-close style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-close]', c).onclick = closeSheet;
    $$('[data-id]', c).forEach(b => (b.onclick = () => {
      const date = $('#qa-date', c).value, t = state.lists.find(x => x.id === b.dataset.id);
      if (!date || !t) return;
      closeSheet(); applyDayTemplate(t, date);
    }));
  });
}

function quickAddSheet() {
  // Liste plate : un titre de section (texte seul), puis des lignes à toucher, chacune séparée de la suivante par un filet fin.
  const item = (id, icon, label) => `<button class="qa-row" data-qa="${id}"><span>${icon}</span>${esc(label)}</button>`;
  const group = (key, title, items) => `<section class="qa-sec" data-g="${key}"><div class="qa-h">${esc(title)}</div>${items.join('')}</section>`;
  openSheet(`<div class="qa-list">
    ${group('journee', 'Journées', [item('j-today', '📅', 'Aujourd’hui'), item('j-date', '🗓️', 'Date à définir'), item('j-type', '🧩', 'Journée type')])}
    ${group('afaire', 'À faire', TODO_QUICK.map(t => item('t-' + t.id, t.icon, t.label)))}
    ${group('checklists', 'Check-listes', [item('c-new', '＋', 'Nouvelle'), item('c-tpl', '📑', 'Depuis une liste type')])}
    ${group('memos', 'Mémo', MEMO_TYPES.map(t => item('m-' + t, TYPE_META[t].icon, TYPE_META[t].one)))}</div>`, c => {
    $$('[data-qa]', c).forEach(b => (b.onclick = () => {
      const k = b.dataset.qa;
      if (k === 'j-today') { closeSheet(); nav('#/journee/' + todayISO()); }
      else if (k === 'j-date') openDateSheet();
      else if (k === 'j-type') dayTemplateSheet();
      else if (k.startsWith('t-')) quickTodo(k.slice(2));
      else if (k === 'c-new') { closeSheet(); createNoteFlow('checklist'); }
      else if (k === 'c-tpl') checklistFromTemplate();
      else if (k.startsWith('m-')) { closeSheet(); createNoteFlow(k.slice(2)); }
    }));
  });
}
$('#tab-add').onclick = quickAddSheet;

/* Navigation par glissement horizontal entre les rubriques (comme les onglets, dans leur ordre) :
 *   MENU → Journée → À faire → Check-listes → Mémos → Bibliothèque → Accès rapide → MENU → …   (en boucle)
 * Doigt de la droite vers la gauche = rubrique suivante ; de la gauche vers la droite = précédente.
 * Jamais vers ＋ Créer ni Préférences ; inactif sur les Préférences. Chaque rubrique s'ouvre sur sa dernière fenêtre (comme son onglet). */
'use strict';
const SWIPE_RING = ['menu', 'journee', 'afaire', 'checklists', 'memos', 'lib', 'quick'];
function swipeIndex() {
  const r = parseRoute();
  if (r.name === 'menu') return 0;
  const t = tabOf(r);
  if (t === 'biblio') return libOverview ? 6 : 5;
  return SWIPE_RING.indexOf(t);   // -1 : Préférences, etc.
}
function swipeGo(dir) {
  const i = swipeIndex(); if (i < 0) return;
  const k = SWIPE_RING[(i + dir + SWIPE_RING.length) % SWIPE_RING.length];
  slideDir = dir;
  if (k === 'lib' || k === 'quick') { libOverview = k === 'quick'; nav('#/biblio'); }
  else nav(k === 'menu' ? '#/menu' : rememberedHash(k));
}
(() => {
  let sx = 0, sy = 0, st = 0, armed = false;
  const hScroller = el => { for (let p = el; p && p !== document.body; p = p.parentElement) {   // contenu qui défile latéralement (chips, boutons du haut…) : le geste lui appartient
    const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
  document.addEventListener('touchstart', e => {
    armed = false;
    if (e.touches.length !== 1 || swipeIndex() < 0) return;
    const t = e.touches[0], el = e.target;
    if (t.clientX < 24) return;   // bord gauche : geste « retour » d'iOS
    if (!$('#sheet').hidden || !$('#pop').hidden) return;
    if (!el.closest || el.closest('input, textarea, select, [contenteditable], audio, .topbar, .tabbar, .selbar, .moving, .dragging, .lifting, .bloc .time, .amelio') || hScroller(el)) return;
    armed = true; sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!armed) return; armed = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy) || Date.now() - st > 800) return;   // franc, horizontal et assez vif : pas un défilement vertical ni une sélection de texte
    swipeGo(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('touchcancel', () => { armed = false; }, { passive: true });
})();

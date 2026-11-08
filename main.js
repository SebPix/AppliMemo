/* Démarrage. */
'use strict';
applyTheme();
if (!location.hash) history.replaceState(null, '', '#/journee');
const purged = purgeExpired();
render();
flush();
if (purged) toast(`${purged} élément${purged > 1 ? 's' : ''} arrivé${purged > 1 ? 's' : ''} au bout de sa durée d’archivage ${purged > 1 ? 'ont été effacés' : 'a été effacé'}.`);
// l'app peut rester ouverte des jours (PWA) : on re-vérifie quand elle revient au premier plan
document.addEventListener('visibilitychange', () => { if (!document.hidden && purgeExpired()) render(); });
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* Améliorations : bloc-notes latéral, propre à chaque page de l'appli.
 *  - Activé / désactivé par le bouton « Améliorations » de la page d'accueil (MENU), à droite de « ＋ Créer ».
 *  - Activé : une languette verticale (80 % de la hauteur) reste visible sur toutes les pages, sans exception.
 *    Un clic la déploie de gauche à droite en une large fenêtre de texte ; ✕ (ou un nouveau clic sur la languette) la rétracte.
 *  - Le texte est mémorisé par page (clé = adresse de la page, ex. #/journee/2026-11-11) : en changeant de page, on change de texte.
 *  - Stockage : localStorage de cet appareil (non synchronisé). */
'use strict';
const AM_ON_KEY = 'applimemo.amelio.on', AM_NOTES_KEY = 'applimemo.amelio.notes';
const amStore = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const amNotes = () => { try { const o = JSON.parse(amStore.get(AM_NOTES_KEY)); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const amKey = () => { try { return decodeURIComponent(location.hash || '#/menu'); } catch (e) { return location.hash || '#/menu'; } };
let amOn = amStore.get(AM_ON_KEY) === '1', amOpen = false, amShownKey = null;

const ameliIsOn = () => amOn;
function ameliToggle() {
  amOn = !amOn;
  if (amOn) amStore.set(AM_ON_KEY, '1'); else { amStore.del(AM_ON_KEY); amOpen = false; }
  ameliApply();
  $$('.menu-amelio').forEach(b => { b.classList.toggle('on', amOn); b.setAttribute('aria-pressed', String(amOn)); });
  return amOn;
}

function ameliEl() {
  let el = $('#amelio');
  if (el) return el;
  el = document.createElement('aside');
  el.id = 'amelio'; el.className = 'amelio'; el.hidden = true;
  el.innerHTML = `<div class="am-bar"><button type="button" class="am-tab" aria-label="Améliorations de cette page" aria-expanded="false"><span>Améliorations</span></button>
      <button type="button" class="am-off" aria-label="Désactiver Améliorations" title="Désactiver Améliorations">💡</button></div>
    <div class="am-panel"><div class="am-head"><strong class="am-title"></strong><button type="button" class="am-close" aria-label="Rétracter la fenêtre Améliorations">✕</button></div>
      <textarea class="am-text" placeholder="Améliorations à apporter à cette page…" spellcheck="true"></textarea></div>`;
  document.body.appendChild(el);
  $('.am-tab', el).onclick = () => { amOpen = !amOpen; ameliApply(); if (amOpen) $('.am-text', el).focus(); };
  $('.am-off', el).onclick = () => { if (amOn) ameliToggle(); };   // ampoule : désactive « Améliorations » (se réactive depuis l'accueil)
  $('.am-close', el).onclick = () => { amOpen = false; ameliApply(); };
  $('.am-text', el).addEventListener('input', e => {
    const key = amShownKey || amKey(), all = amNotes(), v = e.target.value;
    if (v.trim()) all[key] = v; else delete all[key];
    amStore.set(AM_NOTES_KEY, JSON.stringify(all));
    el.classList.toggle('has', !!v.trim());
  });
  return el;
}
/** Titre lisible de la page courante (affiché en tête de la fenêtre). */
function ameliPageLabel() {
  if (amKey() === '#/menu' || amKey() === '#/') return 'Accueil';
  const t = ($('#view-title') && $('#view-title').innerText || '').replace(/✏️/g, '').replace(/\s+/g, ' ').trim();
  return t || amKey();
}
/** Affiche / masque la languette et la fenêtre ; recharge le texte quand la page a changé. */
function ameliApply() {
  const el = ameliEl();
  el.hidden = !amOn;
  if (!amOn) return;
  const key = amKey(), ta = $('.am-text', el);
  if (key !== amShownKey) { amShownKey = key; ta.value = amNotes()[key] || ''; }
  el.classList.toggle('has', !!ta.value.trim());
  el.classList.toggle('open', amOpen);
  $('.am-tab', el).setAttribute('aria-expanded', String(amOpen));
  $('.am-title', el).textContent = ameliPageLabel();
}
// Changement de page : on enregistre déjà à chaque frappe ; on ne fait que charger le texte de la nouvelle page (après son rendu).
window.addEventListener('hashchange', () => setTimeout(ameliApply, 0));
ameliApply();

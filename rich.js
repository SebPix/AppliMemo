/* Texte enrichi : éditeurs « .rte » (contenteditable) + barre de mise en forme dépliable (▾ dans le bandeau du haut).
 * Stockage : voir core.js (texte brut conservé + html nettoyé). Les commandes agissent sur l'éditeur actif (dernier touché). */
'use strict';

const Rich = (() => {
  const COLORS = [['Rouge', '#d32f2f'], ['Orange', '#ef6c00'], ['Or', '#b8860b'], ['Vert', '#2e7d32'], ['Bleu', '#1565c0'], ['Violet', '#6a1b9a'], ['Gris', '#757575']];
  const MARKS = [['Jaune', 'rgba(255,214,0,.5)'], ['Orange', 'rgba(255,152,0,.5)'], ['Vert', 'rgba(76,175,80,.45)'], ['Bleu', 'rgba(33,150,243,.4)'], ['Rose', 'rgba(233,30,99,.35)'], ['Gris', 'rgba(158,158,158,.5)']];
  const SIZES = [['Petit', 2], ['Normal', 3], ['Grand', 5], ['Très grand', 6]];
  const ALIGNS = [['⬅', 'Gauche', 'justifyLeft'], ['⬌', 'Centré', 'justifyCenter'], ['➡', 'Droite', 'justifyRight'], ['☰', 'Justifié', 'justifyFull']];

  /* ---------- Éditeur ---------- */
  const plainHtml = t => esc(t).replace(/\n/g, '<br>');
  /** Contenu à afficher : html mis en forme s'il correspond au texte brut, sinon le texte brut. */
  const content = (html, text) => (Core.richOK(html, text || '') ? Core.cleanHtml(html) : plainHtml(text || ''));
  /** Balisage d'un éditeur riche (à placer dans un innerHTML). */
  const editor = (html, text, ph, cls = '') =>
    `<div class="rte ${cls} ${text ? '' : 'is-empty'}" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-ph="${esc(ph)}">${content(html, text)}</div>`;
  /** Lit un éditeur → { html, text } (html vide si pas de texte). */
  function read(el) {
    const html = Core.cleanHtml(el.innerHTML), text = Core.htmlText(html);
    el.classList.toggle('is-empty', !text);
    return { html: text ? html : '', text };
  }
  /** Affecte à obj[textKey] / obj[htmlKey] le contenu de l'éditeur (htmlKey absent si pas de mise en forme utile). */
  function bind(obj, textKey, htmlKey, el) {
    const v = read(el);
    obj[textKey] = v.text;
    if (v.html) obj[htmlKey] = v.html; else delete obj[htmlKey];
  }
  /** Version lecture seule (PDF…) : bloc HTML sûr. */
  const view = (html, text) => `<div class="rich">${content(html, text)}</div>`;
  /** Ajoute des lignes de texte à la fin d'un champ en gardant sa mise en forme. */
  function append(obj, textKey, htmlKey, lines) {
    const had = obj[textKey] || '', ok = Core.richOK(obj[htmlKey], had);
    obj[textKey] = (had ? had + '\n' : '') + lines;
    if (ok) obj[htmlKey] = obj[htmlKey] + '<br>' + plainHtml(lines);
    else delete obj[htmlKey];
  }

  /* ---------- Éditeur actif et sélection ---------- */
  let active = null, saved = null;
  const hostOf = n => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return e && e.closest ? e.closest('.rte') : null; };
  document.addEventListener('selectionchange', () => {
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0), h = hostOf(r.commonAncestorContainer);
    if (h) { active = h; saved = r.cloneRange(); }
  });
  document.execCommand('defaultParagraphSeparator', false, 'div');
  // Coller / déposer : texte brut uniquement (pas de HTML venu d'ailleurs)
  document.addEventListener('paste', e => {
    if (!hostOf(e.target)) return;
    e.preventDefault();
    document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
  });
  document.addEventListener('drop', e => {
    if (!hostOf(e.target)) return;
    e.preventDefault();
    const t = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (t) { hostOf(e.target).focus(); document.execCommand('insertText', false, t); }
  });

  function run(cmd, val, css = true) {
    if (!active || !document.contains(active)) { toast('Touche d’abord un texte à mettre en forme.'); return; }
    active.focus();
    const s = getSelection();
    if (saved) { s.removeAllRanges(); s.addRange(saved); }
    document.execCommand('styleWithCSS', false, css);
    if (cmd === 'hiliteColor' && !document.execCommand(cmd, false, val)) document.execCommand('backColor', false, val);
    else if (cmd !== 'hiliteColor') document.execCommand(cmd, false, val);
    active.dispatchEvent(new Event('input', { bubbles: true }));
    if (s.rangeCount) saved = s.getRangeAt(0).cloneRange();
  }

  /* ---------- Barre de mise en forme ---------- */
  const bar = $('#fmt-bar'), pop = $('#fmt-pop'), toggleBtn = $('#btn-fmt');
  let popFor = '';
  const swatch = (c, label, i) => `<button class="sw" data-i="${i}" style="background:${c}" aria-label="${esc(label)}"></button>`;
  const POPS = {
    size: { html: SIZES.map(([l], i) => `<button data-i="${i}">${l}</button>`).join(''), fn: i => run('fontSize', SIZES[i][1]) },
    color: { html: COLORS.map(([l, c], i) => swatch(c, l, i)).join(''), fn: i => run('foreColor', COLORS[i][1]) },
    mark: { html: MARKS.map(([l, c], i) => swatch(c, 'Surlignage ' + l, i)).join('') + '<button data-i="-1">Sans surlignage</button>',
      fn: i => run('hiliteColor', i < 0 ? 'rgba(0,0,0,0)' : MARKS[i][1]) },
    align: { html: ALIGNS.map(([ic, l], i) => `<button data-i="${i}"><span>${ic}</span> ${l}</button>`).join(''), fn: i => run(ALIGNS[i][2], null, false) },
  };
  const BTNS = [
    ['bold', '<b>G</b>', 'Gras'], ['italic', '<i>I</i>', 'Italique'], ['underline', '<u>S</u>', 'Souligné'], '|',
    ['size', 'Aa', 'Taille'], ['color', '<b style="color:#d32f2f">A</b>', 'Couleur'], ['mark', '🖍', 'Surlignage'], ['align', '☰', 'Alignement'], '|',
    ['insertUnorderedList', '•', 'Puces'], ['insertOrderedList', '1.', 'Numéros'], '|', ['removeFormat', '⌫', 'Effacer la mise en forme'],
  ];
  bar.innerHTML = BTNS.map(b => (b === '|' ? '<i class="vsep"></i>' : `<button data-c="${b[0]}"><span>${b[1]}</span>${b[2]}</button>`)).join('');

  function closePopup() { pop.hidden = true; popFor = ''; }
  function openPopup(kind, btn) {
    if (popFor === kind) return closePopup();
    popFor = kind; pop.innerHTML = POPS[kind].html; pop.hidden = false;
    const r = btn.getBoundingClientRect(), pw = pop.offsetWidth;
    pop.style.left = Math.max(6, Math.min(r.left, innerWidth - pw - 6)) + 'px';
  }
  // Ne pas voler le focus à l'éditeur (sinon la sélection est perdue)
  const keepFocus = e => { if (e.target.closest('#fmt-bar, #fmt-pop, #btn-fmt')) e.preventDefault(); };
  document.addEventListener('mousedown', keepFocus);
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#fmt-bar, #fmt-pop, #btn-fmt')) closePopup(); });
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const c = b.dataset.c;
    if (POPS[c]) return openPopup(c, b);
    closePopup(); run(c, null, false);
  });
  pop.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const k = popFor; closePopup(); POPS[k].fn(+b.dataset.i);
  });

  /* La flèche ▴ remplace la ligne 1a (boutons) par 1b (mise en forme, qui monte) ; ▾ ramène 1a (qui redescend).
   * Elle n'est visible que si 1a et 1b existent (voir syncTop() dans app.js). */
  toggleBtn.onclick = () => {
    fmtOpen = !fmtOpen; syncTop();
    const el = fmtOpen ? bar : $('#top-actions');
    if (!el.hidden) { el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim'); el.onanimationend = () => el.classList.remove('anim'); }
  };

  return { editor, read, bind, view, append, content };
})();

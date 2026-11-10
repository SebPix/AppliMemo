/* AppliMémo — cœur des données (pur, sans DOM) : migration, nettoyage, fusion, hashtags.
 *
 * Modèle (v3) :
 *   days   : journées indexées par date → { subtitle, updatedAt, blocs:[bloc] }
 *   todos  : liste « À faire »
 *   notes  : mémos typés (checklist, password, divers, ecritures, birthdays, links, emails, places, photos, voice)
 *   vault  : paramètres de chiffrement du coffre à mots de passe (jamais le mot de passe lui-même)
 * Chaque élément porte id, updatedAt (ms) et, s'il est supprimé, deletedAt (« pierre tombale »)
 * pour que la suppression se propage à la fusion. La version la plus récente de chaque id gagne.
 * Les # (hashtags) ne sont pas stockés : ils sont déduits du texte de toutes les notes.
 */
(function (root) {
  'use strict';
  const SCHEMA = 3;
  const TYPES = ['checklist', 'todo', 'password', 'divers', 'ecritures', 'birthdays', 'links', 'emails', 'places', 'photos', 'voice'];
  const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
  /** Durée d'archivage : never (illimitée) | year | month | week | ondemand (« à la demande » : l'app propose la suppression à la date proposeAt) — voir app.js (KEEP). */
  const KEEPS = ['never', 'year', 'month', 'week', 'ondemand'];
  const keep = v => (KEEPS.includes(v) ? v : 'never');

  const str = (v, max = 200000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const arr = v => (Array.isArray(v) ? v : []);
  const color = (v, d) => (COLOR_RE.test(v) ? v : d);
  const int = (v, min, max) => { const n = parseInt(v, 10); return n >= min && n <= max ? n : null; };

  /** Adresse web sûre (http/https uniquement) ; ajoute https:// si besoin ; '' si refusée. */
  function safeUrl(u) {
    u = str(u, 2000).trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) { if (/\s/.test(u) || !u.includes('.')) return ''; u = 'https://' + u; }
    try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : ''; } catch (e) { return ''; }
  }
  /** Photo : URL http(s) ou chemin relatif (préfixé plus tard par l'adresse Bunny des préférences). */
  function safePhoto(u) {
    u = str(u, 2000).trim();
    if (/^https?:\/\//i.test(u)) return safeUrl(u);
    return /^[\w][\w./%~ ()@+-]*$/.test(u) && !u.includes('..') ? u : '';
  }
  const validEmail = e => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e || '');

  /* ---------- Hashtags ---------- */
  const TAG_RE = /(^|[\s(,;:!?])#(\p{L}[\p{L}\p{N}_-]{0,39})/gu;
  const tagKey = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /** Renvoie [{key,label}] sans doublon, dans l'ordre d'apparition. */
  function extractTags(text) {
    const seen = new Map();
    for (const m of String(text || '').matchAll(TAG_RE)) {
      const key = tagKey(m[2]);
      if (!seen.has(key)) seen.set(key, { key, label: m[2] });
    }
    return [...seen.values()];
  }


  /* ---------- Texte enrichi ----------
   * Les champs de texte long gardent leur texte BRUT (texte / note / data.text : recherche, #thèmes, aperçus) et,
   * en plus, un champ HTML nettoyé (html / noteHtml / data.html) quand l'utilisateur a mis en forme.
   * Si le texte brut a été modifié ailleurs (html périmé), richOK() est faux et on retombe sur le texte brut. */
  const RICH_TAG = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', br: 'br', div: 'div', p: 'div', ul: 'ul', ol: 'ol', li: 'li', span: 'span', font: 'font' };
  const CSS_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[01]?(\.\d+)?\s*)?\))$/i;
  const CSS_OK = {
    color: v => CSS_COLOR.test(v),
    'background-color': v => CSS_COLOR.test(v),
    'font-size': v => /^(xx-small|x-small|small|medium|large|x-large|xx-large|\d{1,3}(\.\d+)?(px|pt|em|%))$/.test(v),
    'text-align': v => /^(left|center|right|justify)$/.test(v),
    'font-weight': v => /^(bold|700|800|900)$/.test(v),
    'font-style': v => v === 'italic',
    'text-decoration': v => /^(underline|line-through|underline line-through|line-through underline)$/.test(v),
    'text-decoration-line': v => /^(underline|line-through|underline line-through|line-through underline)$/.test(v),
  };
  function richStyle(css) {
    const out = [];
    for (const decl of String(css).split(';')) {
      const i = decl.indexOf(':'); if (i < 0) continue;
      const k = decl.slice(0, i).trim().toLowerCase(), v = decl.slice(i + 1).trim().toLowerCase().replace(/\s*!important$/, '');
      if (CSS_OK[k] && CSS_OK[k](v)) out.push(`${k === 'text-decoration-line' ? 'text-decoration' : k}:${v}`);
    }
    return out.length ? ` style="${out.join(';')}"` : '';
  }
  const attrOf = (attrs, name) => { const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(attrs); return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null; };
  /** HTML d'éditeur → HTML sûr (liste blanche : gras, italique, souligné, listes, alignement, couleur, surlignage, taille). */
  function cleanHtml(h) {
    h = str(h, 400000);
    let out = '', last = 0; const stack = [];
    const text = t => { out += t.replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
    for (let m; (m = re.exec(h));) {
      text(h.slice(last, m.index)); last = re.lastIndex;
      const tag = RICH_TAG[m[2].toLowerCase()]; if (!tag) continue;
      if (m[1]) {                                              // balise fermante : on ferme jusqu'à l'ouvrante correspondante
        const k = stack.lastIndexOf(tag); if (k < 0) continue;
        while (stack.length > k) out += `</${stack.pop()}>`;
      } else if (tag === 'br') out += '<br>';
      else {
        let a = '';
        if (tag === 'font') {
          const sz = attrOf(m[3], 'size'), col = attrOf(m[3], 'color');
          if (sz !== null && /^[1-7]$/.test(sz.trim())) a += ` size="${sz.trim()}"`;
          if (col !== null && CSS_COLOR.test(col.trim())) a += ` color="${col.trim().toLowerCase()}"`;
        } else {
          let st = attrOf(m[3], 'style') || '';
          const al = attrOf(m[3], 'align'); if (al !== null && /^(left|center|right|justify)$/i.test(al.trim())) st += `;text-align:${al.trim()}`;
          a = richStyle(st.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        }
        out += `<${tag}${a}>`; stack.push(tag);
        if (stack.length > 40) break;
      }
    }
    text(h.slice(last));
    while (stack.length) out += `</${stack.pop()}>`;
    return out;
  }
  const decodeEnt = t => t.replace(/&(nbsp|amp|lt|gt|quot|#39|#x[0-9a-f]+|#\d+);/gi, (m, e) => {
    e = e.toLowerCase();
    if (e === 'nbsp') return ' '; if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"';
    const c = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m;
  });
  /** HTML → texte brut (une ligne par bloc / <br>), sans espace de fin. Même résultat partout : sert à détecter un html périmé. */
  function htmlText(h) {
    let out = '', line = true;                                 // line : on est en début de ligne
    const brk = () => { if (!line) { out += '\n'; line = true; } };
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g; let last = 0;
    const txt = t => { t = decodeEnt(t); if (t) { out += t; line = false; } };
    h = String(h || '');
    for (let m; (m = re.exec(h));) {
      txt(h.slice(last, m.index)); last = re.lastIndex;
      const t = m[2].toLowerCase();
      if (t === 'br') { out += '\n'; line = true; }
      else if (['div', 'p', 'li', 'ul', 'ol'].includes(t)) brk();
    }
    txt(h.slice(last));
    return out.replace(/\s+$/, '');
  }
  const richOK = (html, plain) => !!html && htmlText(html) === plain;
  /** Normalise le couple (html, texte brut) d'un champ : html nettoyé, ou '' s'il est vide, trop gros ou périmé. */
  function richField(html, plain) { html = cleanHtml(html); return html.length <= 100000 && richOK(html, plain) ? html : ''; }
  /** Ajoute o[key] = html nettoyé seulement s'il est valide (les données sans mise en forme gardent leur forme d'origine). */
  const withRich = (o, key, html, plain) => { const h = richField(html, plain); if (h) o[key] = h; return o; };

  /* ---------- Normalisation ---------- */
  function base(x) {
    if (!x || typeof x !== 'object' || !ID_RE.test(x.id)) return null;
    const o = { id: x.id, updatedAt: num(x.updatedAt) };
    if (x.deletedAt) o.deletedAt = num(x.deletedAt) || o.updatedAt || 1;
    if (num(x.proposeAt) > 0) o.proposeAt = num(x.proposeAt);   // « à la demande » : date où l'app propose de supprimer
    return o;
  }
  const iid = (x, i) => (ID_RE.test(x.id) ? x.id : 'i' + i);
  const normBloc = (x, i) => { const o = base(x); return o && (Object.assign(o, {
    titre: str(x.titre, 500), texte: str(x.texte), couleur: color(x.couleur, '#ffffff'),
    horaire: TIME_RE.test(x.horaire) ? x.horaire : null,
    pos: x.pos !== undefined && x.pos !== null && Number.isFinite(+x.pos) ? +x.pos : i }), withRich(o, 'html', x.html, str(x.texte))); };
  const normTodo = x => { const o = base(x); return o && withRich(Object.assign(o, {
    text: str(x.text, 2000), note: str(x.note, 20000), keep: keep(x.keep), done: !!x.done, prio: [0, 1, 2].includes(x.prio) ? x.prio : 0 }), 'noteHtml', x.noteHtml, str(x.note, 20000)); };
  /** Version enregistrée ou liste/journée type.
   *  scope : 'todo' | 'checklist' | 'day' ; ref : id de la check-liste ou date de la journée (versions seulement) ;
   *  items : lignes {t,done,prio,note} — ou, pour une journée, blocs {titre,texte,couleur,horaire} (+ sub = sous-titre). */
  const normList = x => {
    const o = base(x); if (!o) return null;
    const scope = ['checklist', 'day'].includes(x.scope) ? x.scope : 'todo';
    const item = scope === 'day'
      ? i => withRich({ titre: str(i && i.titre, 500), texte: str(i && i.texte), couleur: color(i && i.couleur, '#ffffff'), horaire: i && TIME_RE.test(i.horaire) ? i.horaire : null }, 'html', i && i.html, str(i && i.texte))
      : i => (scope === 'checklist' && i && i.blk) ? { t: str(i.t, 20000), done: false, prio: 0, note: '', blk: true } : withRich({ t: str(i && i.t, 1000), done: !!(i && i.done), prio: i && [0, 1, 2].includes(i.prio) ? i.prio : 0, note: str(i && i.note, 20000) }, 'noteHtml', i && i.noteHtml, str(i && i.note, 20000));
    return Object.assign(o, { scope, kind: x.kind === 'template' ? 'template' : 'version', ref: ID_RE.test(x.ref) ? x.ref : '',
      name: str(x.name, 200), sub: str(x.sub, 500), keep: keep(x.keep), items: arr(x.items).slice(0, 2000).map(item),
      ...(scope === 'checklist' && [1, 2, 3].includes(+x.cols) ? { cols: +x.cols } : {}) });
  };
  const ITEM_NORM = {
    checklist: (x, i) => (x.blk ? { id: iid(x, i), t: str(x.t, 20000), done: false, blk: true } : { id: iid(x, i), t: str(x.t, 1000), done: !!x.done }),   // blk : bloc de texte pleine largeur
    todo: (x, i) => withRich({ id: iid(x, i), t: str(x.t, 1000), done: !!x.done, prio: [0, 1, 2].includes(x.prio) ? x.prio : 0, note: str(x.note, 20000),
      ...(str(x.theme, 60) ? { theme: str(x.theme, 60) } : {}), ...(num(x.due) > 0 ? { due: Math.round(num(x.due)) } : {}),
      ...(x.cl && typeof x.cl === 'object' ? { cl: { items: arr(x.cl.items).slice(0, 2000).map((it, k) => ITEM_NORM.checklist(it && typeof it === 'object' ? it : {}, k)), cols: [1, 2, 3].includes(+x.cl.cols) ? +x.cl.cols : 2 } } : {}) }, 'noteHtml', x.noteHtml, str(x.note, 20000)),
    birthdays: (x, i) => ({ id: iid(x, i), nom: str(x.nom, 200), j: int(x.j, 1, 31) || 1, m: int(x.m, 1, 12) || 1,
      a: int(x.a, 1000, 3000), note: str(x.note, 2000) }),
    links: (x, i) => ({ id: iid(x, i), titre: str(x.titre, 300), url: safeUrl(x.url), cat: str(x.cat, 80), note: str(x.note, 2000) }),
    emails: (x, i) => ({ id: iid(x, i), nom: str(x.nom, 200), email: str(x.email, 200), cat: str(x.cat, 80), note: str(x.note, 2000) }),
    places: (x, i) => ({ id: iid(x, i), nom: str(x.nom, 200), adresse: str(x.adresse, 500), cat: str(x.cat, 80), note: str(x.note, 2000) }),
    voice: (x, i) => ({ id: iid(x, i), titre: str(x.titre, 300), dur: Math.max(0, Math.min(86400, Math.round(num(x.dur)))), at: num(x.at),
      mime: /^audio\/[\w.+-]+(;[\w=.+ -]*)?$/.test(x.mime) ? str(x.mime, 60) : '', note: str(x.note, 2000) }),
    photos: (x, i) => ({ id: iid(x, i), url: safePhoto(x.url), titre: str(x.titre, 300), album: str(x.album, 80) }),
  };
  function normEnc(e) {
    return e && typeof e === 'object' && typeof e.iv === 'string' && typeof e.ct === 'string' && e.iv.length < 100 &&
      e.ct.length < 4e6 && B64_RE.test(e.iv) && B64_RE.test(e.ct) ? { iv: e.iv, ct: e.ct } : null;
  }
  function normNote(x) {
    const o = base(x);
    if (!o || !TYPES.includes(x.type)) return null;
    Object.assign(o, { type: x.type, title: str(x.title, 200), fav: !!x.fav, keep: keep(x.keep) });
    const d = x.data && typeof x.data === 'object' ? x.data : {};
    if (x.type === 'divers' || x.type === 'ecritures') o.data = withRich({ text: str(d.text) }, 'html', d.html, str(d.text));
    else if (x.type === 'password') o.data = { enc: normEnc(d.enc), kid: str(d.kid, 100) };
    else if (x.type === 'checklist') o.data = { items: arr(d.items).map((it, i) => ITEM_NORM.checklist(it && typeof it === 'object' ? it : {}, i)), cols: [1, 2, 3].includes(+d.cols) ? +d.cols : 2 };
    else if (x.type === 'todo') o.data = { items: arr(d.items).map((it, i) => ITEM_NORM.todo(it && typeof it === 'object' ? it : {}, i)), level: ['urgentissime', 'urgent', 'moyen', 'long', 'infini'].includes(d.level) ? d.level : '' };
    else o.data = { items: arr(d.items).map((it, i) => ITEM_NORM[x.type](it && typeof it === 'object' ? it : {}, i)).filter(it => !('url' in it && it.url === '' && x.type === 'photos')) };
    return o;
  }
  function normVault(v) {
    if (!v || typeof v !== 'object' || typeof v.salt !== 'string' || !B64_RE.test(v.salt) || v.salt.length > 100) return null;
    const check = normEnc(v.check);
    const iter = Math.min(2000000, Math.max(100000, Math.round(num(v.iter)) || 310000));
    return check ? { salt: v.salt, iter, check, updatedAt: num(v.updatedAt) } : null;
  }

  function emptyState(current) {
    return { v: SCHEMA, current, days: {}, todos: [], notes: [], lists: [], vault: null };
  }

  /** Accepte n'importe quelle donnée (v1, v2, v3, fichier importé) et renvoie un état v3 sain. */
  function migrate(s, current) {
    const out = emptyState(current);
    if (!s || typeof s !== 'object') return out;
    // v2 → v3 : anciennes thématiques explicites → hashtags dans le texte du bloc
    const oldThemes = new Map(arr(s.themes).filter(t => t && ID_RE.test(t.id)).map(t => [t.id, str(t.name, 100).replace(/\s+/g, '-')]));
    const days = s.days && typeof s.days === 'object' ? s.days : {};
    for (const [date, d] of Object.entries(days)) {
      if (!d || typeof d !== 'object' || !DATE_RE.test(date)) continue;
      const blocs = arr(d.blocs).map((b, i) => {
        const nb = normBloc(b, i);
        const name = nb && b.theme && oldThemes.get(b.theme);
        if (name && !extractTags(nb.texte + ' ' + nb.titre).some(t => t.key === tagKey(name)) && /^\p{L}/u.test(name)) {
          nb.texte = (nb.texte ? nb.texte + '\n' : '') + '#' + name; nb.updatedAt = Math.max(nb.updatedAt, 1);
        }
        return nb;
      }).filter(Boolean);
      out.days[date] = { date, subtitle: str(d.subtitle, 500), updatedAt: num(d.updatedAt), keep: keep(d.keep), ...(num(d.proposeAt) > 0 ? { proposeAt: num(d.proposeAt) } : {}), blocs };
    }
    out.todos = arr(s.todos).map(normTodo).filter(Boolean);
    // anciens « mémos » v2 → notes « divers »
    const old = arr(s.memos).map(x => { const o = base(x); return o && { id: o.id, updatedAt: o.updatedAt, deletedAt: o.deletedAt,
      type: 'divers', title: str(x.titre, 200), data: { text: str(x.texte) } }; }).filter(Boolean);
    out.notes = arr(s.notes).concat(old).map(normNote).filter(Boolean);
    out.lists = arr(s.lists).map(normList).filter(Boolean);
    out.vault = normVault(s.vault);
    return out;
  }

  function mergeById(a, b) {
    const m = new Map();
    for (const x of [...a, ...b]) {
      const y = m.get(x.id);
      if (!y || num(x.updatedAt) > num(y.updatedAt)) m.set(x.id, x);
    }
    return [...m.values()];
  }
  const byPos = (a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1);

  /** Fusionne deux états (déjà passés par migrate). Ne modifie pas ses arguments. */
  function merge(local, remote, current) {
    const a = JSON.parse(JSON.stringify(local)), b = JSON.parse(JSON.stringify(remote));
    const out = emptyState(current);
    for (const date of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
      const x = a.days[date], y = b.days[date];
      const win = !y || (x && x.updatedAt >= y.updatedAt) ? x : y;
      out.days[date] = { date, subtitle: win.subtitle, updatedAt: win.updatedAt, keep: keep(win.keep), ...(win.proposeAt ? { proposeAt: win.proposeAt } : {}),
        blocs: mergeById(x ? x.blocs : [], y ? y.blocs : []).sort(byPos) };
    }
    out.todos = mergeById(a.todos, b.todos);
    out.notes = mergeById(a.notes, b.notes);
    out.lists = mergeById(a.lists, b.lists);
    out.vault = !b.vault || (a.vault && a.vault.updatedAt >= b.vault.updatedAt) ? a.vault : b.vault;
    return out;
  }

  /**
   * Annuler : `snap` est l'état d'avant l'action, `cur` l'état actuel.
   * Tout ce qui diffère est re-daté à `t` (sinon la fusion rejouerait l'action annulée),
   * et ce qui n'existait pas dans `snap` est supprimé par pierre tombale.
   */
  function restoreFrom(snap, cur, t) {
    const stamp = (s, c) => { if (!c || JSON.stringify(s) !== JSON.stringify(c)) s.updatedAt = t; };
    const list = (sl, cl) => {
      const cm = new Map(cl.map(x => [x.id, x]));
      sl.forEach(x => stamp(x, cm.get(x.id)));
      const ids = new Set(sl.map(x => x.id));
      cl.forEach(x => { if (!ids.has(x.id)) sl.push(Object.assign({}, x, { deletedAt: t, updatedAt: t })); });
    };
    list(snap.todos, cur.todos);
    list(snap.notes, cur.notes);
    list(snap.lists, cur.lists);
    for (const date of Object.keys(cur.days)) {
      if (!snap.days[date]) snap.days[date] = { date, subtitle: '', updatedAt: t, keep: 'never', blocs: [] };
    }
    for (const [date, sd] of Object.entries(snap.days)) {
      const cd = cur.days[date];
      if (!cd || sd.subtitle !== cd.subtitle || sd.keep !== cd.keep) sd.updatedAt = t;
      list(sd.blocs, cd ? cd.blocs : []);
    }
    if (snap.vault && JSON.stringify(snap.vault) !== JSON.stringify(cur.vault)) snap.vault.updatedAt = t;
    return snap;
  }

  const Core = { SCHEMA, TYPES, KEEPS, migrate, merge, restoreFrom, emptyState, safeUrl, safePhoto, validEmail, extractTags, tagKey, cleanHtml, htmlText, richOK };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof globalThis !== 'undefined' ? globalThis : self);

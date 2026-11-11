/* Google Agenda (facultatif) : envoie dans l'agenda une journée, une tâche datée ou un mémo daté.
 *
 * Principe : l'app reste « locale d'abord ». Rien n'est envoyé tant qu'on n'a pas renseigné un identifiant client Google
 * (Préférences) et accepté la fenêtre d'autorisation de Google. Pas de serveur : la connexion se fait dans le navigateur
 * (Google Identity Services, jeton valable ~1 h, gardé en mémoire seulement ; se reconnecter = un clic).
 *
 * Chaque événement a un identifiant DÉTERMINISTE déduit de l'élément (evId) : envoyer deux fois met à jour, ne duplique pas,
 * et deux appareils retombent sur le même événement. Chaque événement contient un lien (champ « source » + description)
 * qui rouvre l'élément dans l'app : #/note/<id> ou #/journee/<date>.
 *
 * Données : journée → d.cal = true ; tâche → t.cal = 'AAAA-MM-JJ' (+ t.calTime) ; mémo → n.cal (+ n.calTime).
 * Ici, desired() calcule les événements voulus ; syncAll() ne renvoie que ce qui a changé (empreintes, par appareil)
 * et supprime de l'agenda ce qui n'est plus voulu. */
'use strict';

const Gcal = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  const API = 'https://www.googleapis.com/calendar/v3/calendars/';
  const HASH_KEY = 'applimemo.gcalsync';
  let token = '', expires = 0, loading = null, syncing = false, again = false, lastSync = 0, lastError = '';

  /** Identifiant client OAuth du projet Google Cloud « AppliMemo » (public, pas un secret). Projet en mode Test : seuls les comptes
   *  listés comme « utilisateurs de test » dans la console Google peuvent se connecter. Surchargeable dans Préférences (avancé). */
  const DEFAULT_CLIENT_ID = '396876290746-4s56l282lquir59fg0gcct9627o1s80k.apps.googleusercontent.com';
  const clientId = () => (prefs.gClient || '').trim() || DEFAULT_CLIENT_ID;
  const configured = () => !!clientId();
  const connected = () => !!token && Date.now() < expires;
  /** Par défaut, seul le titre part chez Google (jamais le texte des tâches, blocs ou mémos) ; désactivable dans les Préférences. */
  const titleOnly = () => prefs.gTitleOnly !== false;
  const calId = () => (prefs.gCal || 'primary').trim() || 'primary';
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };

  /* ---------- Liens vers l'app ---------- */
  const appLink = hash => location.origin + location.pathname + hash;
  const linkNote = id => appLink('#/note/' + id);
  const linkDay = date => appLink('#/journee/' + date);

  /* ---------- Identifiants d'événements : base32hex (a-v, 0-9), 2 signes par caractère de la clé ---------- */
  const B32 = '0123456789abcdefghijklmnopqrstuv';
  const evId = key => 'am' + [...key].map(c => { const k = c.charCodeAt(0) & 1023; return B32[k >> 5] + B32[k & 31]; }).join('');

  /* ---------- Construction des événements voulus ---------- */
  const addMin = (date, time, m) => {
    const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number), t = new Date(y, mo - 1, d, h, mi + m);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
  };
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const clip = (s, n) => String(s || '').trim().slice(0, n);
  /** Description : texte entier ; au-delà de la limite de Google (~8 000 caractères), coupé AVEC une mention visible. */
  const MAX_DESC = 7500;
  const cut = s => { s = String(s || '').trim(); return s.length > MAX_DESC ? s.slice(0, MAX_DESC).trimEnd() + '…\n(texte coupé : la suite est dans AppliMémo)' : s; };
  /** { title, date, time, minutes, desc, url, key } → ressource « événement » de l'API. */
  function mk({ title, date, time, minutes = 60, desc, url, key }) {
    const when = time
      ? { start: { dateTime: `${date}T${time}:00`, timeZone: tz() }, end: { dateTime: addMin(date, time, minutes), timeZone: tz() } }
      : { start: { date }, end: { date: addMin(date, '00:00', 1440).slice(0, 10) } };
    return { summary: clip(title, 300) || '(sans titre)', description: [cut(desc), `↗ Ouvrir dans AppliMémo : ${url}`].filter(Boolean).join('\n\n'),
      source: { title: 'AppliMémo', url }, ...when, status: 'confirmed', extendedProperties: { private: { applimemo: key } } };
  }
  /** Texte d'un mémo pour la description de l'événement (le coffre n'envoie jamais rien). */
  function noteBody(n) {
    const d = n.data, box = i => (i.done ? '☑ ' : '☐ ');
    if (n.type === 'password') return '';
    if (n.type === 'divers' || n.type === 'ecritures') return d.text;
    if (n.type === 'checklist') return d.items.map(i => (i.blk ? i.t : box(i) + i.t)).join('\n');
    if (n.type === 'todo') return d.items.map(i => box(i) + (i.t || '') + (i.note && i.note.trim() ? '\n   ' + i.note.trim().replace(/\n/g, '\n   ') : '')).join('\n');
    return noteText(n);
  }
  /** Tous les événements que l'état actuel demande : Map clé → événement. */
  function desired() {
    const out = new Map(), D = s => (titleOnly() ? '' : s);   // D : texte qui n'est envoyé que si « titre seulement » est désactivé
    for (const n of liveNotes()) {
      if (n.type === 'todo') {
        for (const i of n.data.items) if (i.cal && !i.cl) out.set('t:' + i.id, mk({ key: 't:' + i.id, title: (i.done ? '✓ ' : '') + (i.t || '(tâche)'), date: i.cal, time: i.calTime, desc: D(i.note), url: linkNote(n.id) }));
      }
      if (n.cal) out.set('n:' + n.id, mk({ key: 'n:' + n.id, title: noteTitle(n), date: n.cal, time: n.calTime, desc: D(noteBody(n)), url: linkNote(n.id) }));
    }
    for (const d of Object.values(state.days)) {
      if (!d.cal || dayIsEmpty(d)) continue;
      const url = linkDay(d.date), blocs = blocsOf(d), timed = blocs.filter(b => b.horaire).sort((a, b) => a.horaire.localeCompare(b.horaire)), rest = blocs.filter(b => !b.horaire);
      timed.forEach((b, k) => {
        const s = toMin(b.horaire), nx = timed.slice(k + 1).map(x => toMin(x.horaire)).find(m => m > s);
        const minutes = Math.max(1, Math.min(24 * 60 - 1 - s, Math.max(15, Math.min(60, nx ? nx - s : 60))));   // 15 min à 1 h, jamais après 23:59
        out.set('b:' + b.id, mk({ key: 'b:' + b.id, title: b.titre || (titleOnly() ? '' : clip(b.texte.split('\n')[0], 80)) || 'Bloc', date: d.date, time: b.horaire, minutes, desc: D(b.texte), url }));
      });
      if (d.subtitle || rest.length) {
        const lines = rest.map(b => '• ' + (titleOnly() ? b.titre || 'Bloc' : [b.titre, (b.texte || '').trim()].filter(Boolean).join('\n   ')));
        out.set('d:' + d.date, mk({ key: 'd:' + d.date, title: '📅 ' + (d.subtitle || 'Ma journée'), date: d.date, desc: lines.join('\n'), url }));
      }
    }
    return out;
  }

  /* ---------- Empreintes (par appareil) : on ne renvoie que ce qui a changé ---------- */
  const hashOf = o => { const s = JSON.stringify(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h.toString(36) + ':' + s.length; };
  const loadHashes = () => { try { const o = JSON.parse(localStorage.getItem(HASH_KEY)); return o && o.cal === calId() && o.h ? o.h : {}; } catch (e) { return {}; } };
  const saveHashes = h => { try { localStorage.setItem(HASH_KEY, JSON.stringify({ cal: calId(), h })); } catch (e) { /* ignoré */ } };

  /* ---------- Connexion (Google Identity Services) ---------- */
  const gsiReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
  /** Charge le script de Google (à l'avance, pour que le clic de connexion ouvre la fenêtre sans délai). */
  function preload() {
    if (gsiReady() || loading || !configured() || !navigator.onLine) return;
    loading = new Promise(ok => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => { loading = null; ok(); };
      document.head.appendChild(s);
    });
  }
  /** À appeler DANS un clic (sinon la fenêtre Google est bloquée). Résout quand le jeton est obtenu. */
  function connect(choose = false) {
    return new Promise((ok, ko) => {
      if (!gsiReady()) { preload(); return ko(new Error('Google n’est pas encore chargé (connexion internet requise) : réessaie dans un instant.')); }
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE, ...(Core.validEmail(prefs.gmail) ? { hint: prefs.gmail } : {}),
        callback: r => {
          if (r.error) return ko(new Error(r.error_description || r.error));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return ko(new Error('Autorisation Agenda refusée : coche l’accès aux événements.'));
          token = r.access_token; expires = Date.now() + Math.max(60, (+r.expires_in || 3600) - 60) * 1000; lastError = '';
          if (choose || !prefs.gOnce) { try { localStorage.removeItem(HASH_KEY); } catch (e) { /* ignoré */ } }   // compte peut-être différent : tout sera renvoyé (idempotent)
          if (!prefs.gOnce) { prefs.gOnce = true; savePrefs(); }   // compte déjà choisi une fois : les reconnexions suivantes se font sans écran de choix
          ok();
        },
        error_callback: e => ko(new Error(e && e.type === 'popup_closed' ? 'Connexion annulée.' : 'Connexion impossible' + (e && e.type ? ' (' + e.type + ')' : '') + '.')),
      });
      // le « hint » (adresse Gmail) n'est qu'une suggestion : sans cela Google prend le compte par défaut du navigateur, sans proposer d'en changer
      tc.requestAccessToken(choose || !prefs.gOnce ? { prompt: 'select_account' } : {});
    });
  }
  /** Déjà connecté ? sinon ouvre la connexion (à appeler directement depuis un clic). */
  const ensure = () => (connected() ? Promise.resolve() : connect());
  function disconnect() {
    if (token && gsiReady()) try { google.accounts.oauth2.revoke(token); } catch (e) { /* ignoré */ }
    token = ''; expires = 0; prefs.gOnce = false; savePrefs();
    try { localStorage.removeItem(HASH_KEY); } catch (e) { /* ignoré */ }   // prochaine connexion : écran de choix du compte
  }

  /* ---------- API Agenda ---------- */
  async function api(method, id, body) {
    const r = await fetch(API + encodeURIComponent(calId()) + '/events' + (id ? '/' + id : ''), {
      method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { token = ''; expires = 0; throw Object.assign(new Error('Session Google expirée : reconnecte-toi dans les Préférences.'), { auth: true }); }
    if (!r.ok && ![404, 409, 410].includes(r.status)) {
      let m = ''; try { m = (await r.json()).error.message; } catch (e) { /* ignoré */ }
      throw new Error(`Google Agenda (${r.status}) ${m}`.trim());
    }
    return r;
  }
  /** Crée ou remplace l'événement (identifiant déterministe) ; ressuscite un événement supprimé. */
  async function upsert(key, ev) {
    const id = evId(key);
    let r = await api('PUT', id, { ...ev, id });
    if (r.status === 404 || r.status === 410) { r = await api('POST', '', { ...ev, id }); if (r.status === 409) r = await api('PUT', id, { ...ev, id }); }
    if (!r.ok) throw new Error('Événement non enregistré (' + r.status + ').');
  }
  const remove = async key => { const r = await api('DELETE', evId(key)); if (!r.ok && ![404, 410].includes(r.status)) throw new Error('Suppression impossible (' + r.status + ').'); };

  /** Synchronise tout (idempotent). Renvoie { up, del, err }. */
  async function syncAll() {
    if (!connected()) return null;
    if (syncing) { again = true; return null; }
    syncing = true;
    const res = { up: 0, del: 0, err: 0 };
    try {
      const want = desired(), prev = loadHashes(), next = {};
      for (const [key, ev] of want) {
        const h = hashOf(ev);
        if (prev[key] === h) { next[key] = h; continue; }
        try { await upsert(key, ev); next[key] = h; res.up++; } catch (e) { if (e.auth) throw e; res.err++; lastError = e.message; if (prev[key]) next[key] = prev[key]; }
      }
      for (const key of Object.keys(prev)) {
        if (want.has(key)) continue;
        try { await remove(key); res.del++; } catch (e) { if (e.auth) throw e; res.err++; lastError = e.message; next[key] = prev[key]; }
      }
      saveHashes(next); lastSync = Date.now(); if (!res.err) lastError = '';
    } catch (e) { lastError = e.message; res.err++; res.fatal = e.message; }
    finally { syncing = false; }
    if (again) { again = false; setTimeout(syncAll, 300); }
    return res;
  }
  /** Après chaque enregistrement : si on est connecté, on resynchronise (avec un délai, une seule fois pour une rafale de modifications). */
  const changedSoon = debounce(() => { if (connected()) syncAll().then(r => { if (r && r.fatal) toast(r.fatal); }); }, 4000);
  saveHooks.push(changedSoon);

  /** Envoie tout de suite (appelé après un choix de date) : connecte si besoin — à appeler dans le clic. */
  function pushNow(what = 'Envoyé dans Google Agenda ✓') {
    if (!configured()) return toast('Enregistré. Pour l’envoyer dans Google Agenda, renseigne l’identifiant client (⚙︎ Préférences).');
    ensure().then(() => syncAll()).then(r => {
      if (!r) return;
      toast(r.fatal ? r.fatal : r.err ? `Agenda : ${r.err} erreur(s) — ${lastError}` : what);
    }).catch(e => toast('Enregistré, mais pas envoyé : ' + e.message));
  }

  /* ---------- Fenêtres ---------- */
  const copyLink = url => copyText(url, 'Lien copié');
  /** Case « Envoyer aussi le contenu » : même réglage que « Titre seulement » des Préférences (inversé). */
  const contentToggle = () => `<label class="row" style="align-items:flex-start;margin:8px 0"><input type="checkbox" id="g-full" style="width:22px;flex:none;margin-top:2px" ${titleOnly() ? '' : 'checked'}>
    <span class="grow"><b>Envoyer aussi le contenu</b> <span class="meta">(texte, listes, détails dans la note de l’événement). Décoché : seulement le titre et le lien. Réglage commun à tout l’agenda ; le contenu est visible de toute personne ayant accès à ton agenda.</span></span></label>`;
  const bindContent = c => { const b = $('#g-full', c); if (b) b.onchange = () => { prefs.gTitleOnly = !b.checked; savePrefs(); }; };
  /** Choix d'une date (et heure facultative) ; o = { title, cur:{cal,calTime}, url, set(date,time), clear() }. */
  function dateSheet(o) {
    preload();
    const has = !!o.cur.cal;
    openSheet(`<h3>📆 ${esc(o.title)}</h3>
      <form class="form"><label>Date<input type="date" name="d" value="${esc(o.cur.cal || todayISO())}" required></label>
        <label>Heure (facultative — sinon « toute la journée »)<input type="time" name="t" value="${esc(o.cur.calTime || '')}"></label>
        ${contentToggle()}
        <p class="meta">${configured() ? 'L’événement contiendra un lien qui rouvre cet élément dans AppliMémo.' : 'Google Agenda n’est pas encore relié (⚙︎ Préférences) : la date est enregistrée et sera envoyée après la connexion.'}</p>
        <div class="btn-list"><button class="btn-gold" type="submit">${has ? 'Mettre à jour' : 'Ajouter'} dans Google Agenda</button>
          ${has ? '<button type="button" class="btn-red" data-clear>Retirer de l’agenda</button>' : ''}
          <button type="button" data-link>🔗 Copier le lien AppliMémo</button><button type="button" data-no>Annuler</button></div></form>`, c => {
      bindContent(c);
      $('[data-no]', c).onclick = closeSheet;
      $('[data-link]', c).onclick = () => copyLink(o.url);
      $('form', c).onsubmit = e => { e.preventDefault(); const f = e.target; o.set(f.elements.d.value, f.elements.t.value || ''); closeSheet(); pushNow(); };
      const cl = $('[data-clear]', c);
      if (cl) cl.onclick = () => { o.clear(); closeSheet(); if (connected()) pushNow('Retiré de Google Agenda ✓'); else toast('Retiré (l’événement sera supprimé à la prochaine connexion).'); };
    });
  }
  function taskSheet(e, after) {
    const t = e.t;
    dateSheet({ title: 'Tâche dans Google Agenda', cur: t, url: linkNote(e.n.id),
      set: (d, h) => { t.cal = d; if (h) t.calTime = h; else delete t.calTime; touch(e.n); save(); after && after(); },
      clear: () => { delete t.cal; delete t.calTime; touch(e.n); save(); after && after(); } });
  }
  function noteSheet(n, after) {
    dateSheet({ title: 'Mémo dans Google Agenda', cur: n, url: linkNote(n.id),
      set: (d, h) => { n.cal = d; if (h) n.calTime = h; else delete n.calTime; touch(n); save(); after && after(); },
      clear: () => { delete n.cal; delete n.calTime; touch(n); save(); after && after(); } });
  }
  function daySheet(d, after) {
    preload();
    const on = !!d.cal, timed = blocsOf(d).filter(b => b.horaire).length;
    openSheet(`<h3>📆 Journée dans Google Agenda</h3>
      <p>${esc(longDate(d.date))}</p>
      <p class="meta">Chaque bloc avec un <b>horaire</b> devient un événement horaire (${timed} actuellement) ; le sous-titre et les blocs sans horaire forment un événement « toute la journée ». Les modifications faites ensuite dans l’app sont renvoyées automatiquement tant que tu es connecté.</p>
      ${contentToggle()}
      ${configured() ? '' : '<p class="meta">Google Agenda n’est pas encore relié (⚙︎ Préférences) : le choix est enregistré et sera envoyé après la connexion.</p>'}
      <div class="btn-list"><button class="btn-gold" data-on>${on ? 'Renvoyer maintenant' : 'Envoyer cette journée'} dans Google Agenda</button>
        ${on ? '<button class="btn-red" data-off>Retirer cette journée de l’agenda</button>' : ''}
        <button data-link>🔗 Copier le lien de la journée</button><button data-no>Fermer</button></div>`, c => {
      bindContent(c);
      $('[data-no]', c).onclick = closeSheet;
      $('[data-link]', c).onclick = () => copyLink(linkDay(d.date));
      $('[data-on]', c).onclick = () => { d.cal = true; touch(d); save(); closeSheet(); after && after(); pushNow(); };
      const off = $('[data-off]', c);
      if (off) off.onclick = () => { delete d.cal; touch(d); save(); closeSheet(); after && after(); if (connected()) pushNow('Journée retirée de Google Agenda ✓'); else toast('Retirée (les événements seront supprimés à la prochaine connexion).'); };
    });
  }

  /* ---------- Carte des Préférences ---------- */
  const statusText = () => connected() ? `Connecté ✓${lastSync ? ' · dernière synchro ' + new Date(lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}${lastError ? ' · ⚠ ' + lastError : ''}`
    : `Non connecté (la connexion dure ~1 h, un clic suffit pour la renouveler).${lastError ? ' ⚠ ' + lastError : ''}`;
  function settingsCard() {
    return `<div class="card"><h3>📆 Google Agenda</h3>
      <p class="meta">Facultatif. Envoie une journée, une tâche datée ou un mémo daté dans ton agenda ; chaque événement contient un lien qui rouvre l’élément dans l’app. Aucune donnée ne part tant que tu n’es pas connecté.</p>
      <label>Adresse Gmail <input id="g-mail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="prenom.nom@gmail.com" value="${esc(prefs.gmail)}"></label>
      <label style="display:block;margin-top:8px">Agenda cible <input id="g-cal" autocapitalize="off" placeholder="primary (agenda principal)" value="${esc(prefs.gCal === 'primary' ? '' : prefs.gCal)}"></label>
      <label class="row" style="margin-top:10px;align-items:flex-start"><input type="checkbox" id="g-title" style="width:22px;flex:none;margin-top:2px" ${titleOnly() ? 'checked' : ''}>
        <span class="grow"><b>Titre seulement</b> <span class="meta">(recommandé) — n’envoie à Google que le titre, la date et le lien, jamais le texte des tâches, blocs ou mémos. Pourquoi : l’agenda n’est pas chiffré, Google peut le lire, et il est visible de toute personne ou appli ayant accès à ton agenda (partage, rappels sur écran verrouillé…). Décoche pour envoyer aussi le texte.</span></span></label>
      <p class="meta" style="margin-top:8px">Origine de cette page vue par Google : <code>${esc(location.origin)}</code> — elle doit figurer à l’identique dans les « Origines JavaScript autorisées » du client Google.</p>
      <p class="meta" id="g-status" style="margin-top:8px">${esc(statusText())}</p>
      <div class="btn-list"><button id="g-connect" class="btn-gold">Se connecter à Google</button><button id="g-sync">⟳ Synchroniser maintenant</button><button id="g-out">Se déconnecter</button></div>
      <details style="margin-top:10px"><summary class="meta">Avancé : utiliser mon propre identifiant client Google</summary>
        <p class="meta">Par défaut, l’appli utilise l’identifiant du projet de son auteur (mode Test : seuls les comptes ajoutés comme utilisateurs de test peuvent se connecter). Pour te connecter sans dépendre de lui, crée ton propre projet Google et colle ici son identifiant.</p>
        <label>Identifiant client Google (OAuth) <input id="g-client" autocapitalize="off" autocomplete="off" placeholder="par défaut : celui de l’appli" value="${esc(prefs.gClient)}"></label>
        <ol class="meta" style="padding-left:18px">
          <li>Va sur <b>console.cloud.google.com</b> → crée un projet.</li>
          <li><b>API et services</b> → <b>Bibliothèque</b> → active <b>Google Calendar API</b>.</li>
          <li><b>Écran de consentement OAuth</b> : type <i>Externe</i>, mode <i>Test</i> ; ajoute ton adresse Gmail dans <i>Utilisateurs de test</i>.</li>
          <li><b>Identifiants</b> → <i>Créer des identifiants</i> → <i>ID client OAuth</i> → type <i>Application Web</i>. Dans <i>Origines JavaScript autorisées</i> : <code>${esc(location.origin)}</code> (aucune URI de redirection).</li>
          <li>Colle l’identifiant obtenu ci-dessus, puis « Se connecter ». Google affichera « application non validée » : <i>Paramètres avancés</i> → continuer (c’est ton propre projet).</li>
        </ol></details></div>`;
  }
  function bindSettings(root) {
    const st = () => { const s = $('#g-status', root); if (s) s.textContent = statusText(); };
    $('#g-mail', root).onchange = e => {
      const v = e.target.value.trim();
      if (v && !Core.validEmail(v)) return toast('Adresse mail invalide.');
      prefs.gmail = v; savePrefs(); toast(v ? 'Adresse Gmail enregistrée ✓' : 'Adresse Gmail retirée.');
    };
    $('#g-client', root).onchange = e => { prefs.gClient = e.target.value.trim(); disconnect(); prefs.gOnce = false; savePrefs(); preload(); st(); toast(prefs.gClient ? 'Identifiant enregistré ✓ (reconnecte-toi)' : 'Identifiant par défaut rétabli (reconnecte-toi).'); };
    $('#g-cal', root).onchange = e => { prefs.gCal = e.target.value.trim() || 'primary'; savePrefs(); toast('Agenda cible enregistré ✓'); };
    $('#g-title', root).onchange = e => {
      prefs.gTitleOnly = e.target.checked; savePrefs();
      toast(prefs.gTitleOnly ? 'Titre seulement : le texte ne sera plus envoyé.' : 'Le texte sera aussi envoyé à Google Agenda.');
      if (connected()) syncAll().then(st);   // met à jour les événements déjà envoyés (le texte déjà envoyé est écrasé)
    };
    $('#g-connect', root).onclick = () => connect(true).then(() => { st(); toast('Connecté à Google Agenda ✓'); return syncAll(); }).then(st).catch(e => { toast(e.message); st(); });
    $('#g-sync', root).onclick = () => ensure().then(() => syncAll()).then(r => { st(); if (r) toast(r.fatal || (r.err ? `${r.err} erreur(s) : ${lastError}` : `Synchronisé ✓ (${r.up} envoyé(s), ${r.del} retiré(s))`)); }).catch(e => { toast(e.message); st(); });
    $('#g-out', root).onclick = () => { disconnect(); st(); toast('Déconnecté de Google.'); };
  }

  return { configured, connected, desired, evId, linkNote, linkDay, dateSheet, taskSheet, noteSheet, daySheet, settingsCard, bindSettings, syncAll, preload, ensure };
})();

/* Préférences ⚙︎ : apparence, exports (JSON / PDF), import, sécurité du coffre, Bunny, effacement. */
'use strict';

/* ===================== Coffre : verrouillage ===================== */
let vaultKey = null, lockTimer = null;
function armLock() { clearTimeout(lockTimer); if (vaultKey && prefs.lockMin > 0) lockTimer = setTimeout(() => lockVault(), prefs.lockMin * 60000); }
async function unlockVault(pw) {
  const k = await Vault.unlock(pw, state.vault);
  if (!k) return false;
  vaultKey = k; armLock(); return true;
}
function lockVault(silent) {
  if (!vaultKey) return;
  vaultKey = null; clearTimeout(lockTimer);
  if (!silent) toast('Coffre verrouillé 🔒');
  const r = parseRoute(); if (r.name === 'note' || r.name === 'reglages') render();
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (vaultKey) armLock(); }, true));
document.addEventListener('visibilitychange', () => { if (document.hidden && prefs.lockMin === 0) lockVault(true); });

function vaultSetupSheet(onDone) {
  openSheet(`<h3>🔐 Mot de passe du coffre</h3><form class="form">
    <label>Mot de passe (8 caractères minimum)<input type="password" name="a" autocomplete="new-password"></label>
    <label>Confirmer<input type="password" name="b" autocomplete="new-password"></label>
    <label class="row" style="gap:8px"><input type="checkbox" name="ok" style="width:auto"><span>Je comprends qu’il ne peut <strong>pas être récupéré</strong> : sans lui, le contenu est perdu.</span></label>
    <div class="row" style="margin-top:8px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Créer</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.a.value.length < 8) return toast('8 caractères minimum.');
      if (f.a.value !== f.b.value) return toast('Les deux saisies diffèrent.');
      if (!f.ok.checked) return toast('Coche la case pour confirmer.');
      const { vault, key } = await Vault.create(f.a.value);
      state.vault = vault; vaultKey = key; armLock(); save(); closeSheet(); toast('Coffre créé 🔐'); onDone && onDone();
    };
  });
}
function vaultChangeSheet() {
  openSheet(`<h3>Changer le mot de passe du coffre</h3><form class="form">
    <label>Mot de passe actuel<input type="password" name="o" autocomplete="current-password"></label>
    <label>Nouveau (8 caractères minimum)<input type="password" name="a" autocomplete="new-password"></label>
    <label>Confirmer le nouveau<input type="password" name="b" autocomplete="new-password"></label>
    <div class="row" style="margin-top:8px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Changer</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.a.value.length < 8) return toast('8 caractères minimum.');
      if (f.a.value !== f.b.value) return toast('Les deux saisies diffèrent.');
      const oldKey = await Vault.unlock(f.o.value, state.vault);
      if (!oldKey) return toast('Mot de passe actuel incorrect.');
      const notes = liveNotes().filter(n => n.type === 'password' && n.data.enc);
      try {
        const plain = [];
        for (const n of notes) {
          if (n.data.kid && n.data.kid !== state.vault.salt) throw new Error('kid');
          plain.push(await Vault.decrypt(oldKey, n.data.enc));
        }
        const { vault, key } = await Vault.create(f.a.value);
        const encs = []; for (const p of plain) encs.push(await Vault.encrypt(key, p));
        notes.forEach((n, i) => { n.data.enc = encs[i]; n.data.kid = vault.salt; touch(n); });
        state.vault = vault; vaultKey = key; armLock(); save(); closeSheet(); toast('Mot de passe changé ✓'); render();
      } catch (err) { toast('Changement impossible : une note n’est pas déchiffrable avec ce mot de passe. Rien n’a été modifié.'); }
    };
  });
}

/* ===================== Export JSON ===================== */
function subsetState(keys) {
  const s = Core.emptyState(todayISO());
  const clone = x => JSON.parse(JSON.stringify(x));
  let pw = false;
  for (const k of keys) {
    if (k.startsWith('d:') && state.days[k.slice(2)]) { const d = clone(state.days[k.slice(2)]); d.blocs = live(d.blocs); s.days[d.date] = d; }
    else if (k.startsWith('n:')) { const n = noteById(k.slice(2)); if (n) { s.notes.push(clone(n)); if (n.type === 'password') pw = true; } }
  }
  if (pw && state.vault) s.vault = clone(state.vault);
  return s;
}
function exportJSON(keys) {
  flush();
  const data = keys ? subsetState(keys) : state;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `applimemo${keys ? '-selection' : ''}-${todayISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===================== Import ===================== */
$('#file-import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || typeof data !== 'object' || (typeof data.days !== 'object' && !Array.isArray(data.notes))) throw 0;
    const incoming = Core.migrate(data, todayISO());
    openSheet(`<h3>Importer « ${esc(f.name)} »</h3><div class="btn-list">
      <button class="btn-gold" data-a="merge">Fusionner avec mes données (recommandé)</button>
      <button class="btn-red" data-a="replace">Remplacer toutes mes données</button>
      <button data-a="no">Annuler</button>
      <p style="color:var(--muted);font-size:13px;margin:6px 0 0">Fusionner garde la version la plus récente de chaque élément : idéal pour synchroniser deux appareils.</p></div>`, c => {
      $$('[data-a]', c).forEach(b => (b.onclick = () => {
        const a = b.dataset.a; closeSheet(); if (a === 'no') return;
        withUndo(a === 'merge' ? 'Sauvegarde fusionnée' : 'Sauvegarde importée', () => {
          const cur = state.current;
          state = a === 'merge' ? Core.merge(state, incoming, cur) : incoming;
          state.current = cur; lockVault(true); render();
        });
      }));
    });
  } catch { toast('Fichier invalide.'); }
};

/* ===================== Export PDF (impression) =====================
 * Pas de bibliothèque : on compose une version imprimable dans #print-root puis window.print().
 * Dans la fenêtre d'impression, choisir « Enregistrer au format PDF » (sur iPhone : Partager → Enregistrer dans Fichiers). */
const ul = items => `<ul class="pl">${items.join('')}</ul>`;
function groupedList(items, key, rowFn) {
  const g = new Map();
  items.forEach(it => { const k = it[key] || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(it); });
  return [...g].sort((a, b) => (a[0] === '') - (b[0] === '') || a[0].localeCompare(b[0], 'fr'))
    .map(([k, l]) => `${k || g.size > 1 ? `<h3>${esc(k || 'Sans catégorie')}</h3>` : ''}${ul(l.map(rowFn))}`).join('');
}
function printNote(n) {
  const d = n.data; let body = '';
  if (n.type === 'checklist') body = `<div style="column-count:${d.cols || 2};column-gap:24px">${ul(d.items.map(i => i.blk ? `<li style="list-style:none;column-span:all;white-space:pre-wrap">${esc(i.t)}</li>` : `<li>${i.done ? '☑' : '☐'} ${esc(i.t)}</li>`))}</div>`;
  else if (n.type === 'todo') body = ul(d.items.map(x => `<li>${x.done ? '☑' : '☐'} ${esc(x.t)}${x.prio ? ' ' + PRIO_LABEL[x.prio] : ''}${x.note && x.note.trim() ? Rich.view(x.noteHtml, x.note) : ''}</li>`));
  else if (n.type === 'divers' || n.type === 'ecritures') body = Rich.view(d.html, d.text);
  else if (n.type === 'birthdays') body = `<table>${[...d.items].sort((a, b) => nextBday(a).days - nextBday(b).days).map(i =>
    `<tr><td>${i.j} ${MOIS[i.m - 1]}${i.a ? ' ' + i.a : ''}</td><td><b>${esc(i.nom)}</b></td><td>${esc(i.note)}</td></tr>`).join('')}</table>`;
  else if (n.type === 'links') body = groupedList(d.items, 'cat', i => `<li><b>${esc(i.titre || hostOf(i.url))}</b><br><small>${esc(i.url)}</small>${i.note ? `<br>${esc(i.note)}` : ''}</li>`);
  else if (n.type === 'emails') body = groupedList(d.items, 'cat', i => `<li><b>${esc(i.nom)}</b> — ${esc(i.email)}${i.note ? `<br>${esc(i.note)}` : ''}</li>`);
  else if (n.type === 'places') body = groupedList(d.items, 'cat', i => `<li><b>${esc(i.nom)}</b> — ${esc(i.adresse)}${i.note ? `<br>${esc(i.note)}` : ''}</li>`);
  else if (n.type === 'voice') body = ul(d.items.map(i => `<li>🎙️ <b>${esc(i.titre || 'Vocal')}</b> — ${esc(dateFR(i.at || 0))} · ${fmtDur(i.dur || 0)}${i.note ? `<br>${esc(i.note)}` : ''}</li>`));
  else if (n.type === 'photos') body = [...new Set(d.items.map(i => i.album))].sort().map(a => `${a ? `<h3>${esc(a)}</h3>` : ''}<div class="pg">${d.items.filter(i => i.album === a).map(i => {
    const s = photoSrc(i.url); return `<figure>${s ? `<img src="${esc(s)}" alt="">` : ''}<figcaption>${esc(i.titre)}</figcaption></figure>`; }).join('')}</div>`).join('');
  return `<section class="pj"><h2>${noteIcon(n)} ${esc(noteTitle(n))}</h2>${body}</section>`;
}
function printDay(d) {
  return `<section class="pj"><h2>📅 Journée du ${esc(longDate(d.date))}</h2>${d.subtitle ? `<p><em>${esc(d.subtitle)}</em></p>` : ''}
    ${blocsOf(d).map(b => `<div class="pb" style="border-left-color:${esc(b.couleur)}"><b>${b.horaire ? esc(b.horaire) + ' · ' : ''}${esc(b.titre)}</b>${b.texte ? Rich.view(b.html, b.texte) : ''}</div>`).join('')}</section>`;
}
function printKeys(keys) {
  let skipped = 0;
  const days = keys.filter(k => k.startsWith('d:')).map(k => state.days[k.slice(2)]).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const notes = keys.filter(k => k.startsWith('n:')).map(k => noteById(k.slice(2))).filter(Boolean)
    .filter(n => (n.type === 'password' ? (skipped++, false) : true)).sort((a, b) => Core.TYPES.indexOf(a.type) - Core.TYPES.indexOf(b.type) || noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  const parts = [...days.map(printDay), ...notes.map(printNote)];
  if (!parts.length) return toast(skipped ? 'Les mots de passe ne s’exportent pas en PDF.' : 'Rien à exporter.');
  $('#print-root').innerHTML = parts.join('');
  if (skipped) toast('Coffre de mots de passe exclu du PDF.');
  setTimeout(() => window.print(), 150);
}
window.addEventListener('afterprint', () => { $('#print-root').innerHTML = ''; });
const allKeys = () => buildIndex().map(e => e.key);

/* ===================== Vue Préférences ===================== */
VIEWS.reglages = app => {
  const v = state.vault;
  app.innerHTML = `
    <div class="card"><h3>🎨 Apparence</h3>
      <select id="p-theme"><option value="auto">Automatique (selon l’appareil)</option><option value="light">Clair</option><option value="dark">Sombre</option></select></div>

    <div class="card"><h3>💾 Sauvegarde &amp; synchronisation (.json)</h3>
      <p class="meta">Un fichier .json contient tes données. Pour synchroniser deux appareils : exporte sur l’un, <b>importe en fusionnant</b> sur l’autre.</p>
      <div class="btn-list"><button id="p-exp">⬇︎ Exporter tout (JSON)</button><button id="p-exp-sel">⬇︎ Exporter une sélection (JSON)…</button><button id="p-imp">⬆︎ Importer un fichier…</button></div></div>

    <div class="card"><h3>📄 Export PDF</h3>
      <p class="meta">Choisis une ou plusieurs pages (journées, à faire, mémos). Le coffre à mots de passe n’est jamais exporté en PDF.</p>
      <div class="btn-list"><button id="p-pdf-sel">Choisir les pages à exporter…</button><button id="p-pdf-all">Tout exporter</button></div></div>

    <div class="card"><h3>🕘 Archivage automatique</h3>
      <p class="meta">Chaque journée, note, check-liste, tâche et version a sa propre durée d’archivage, à régler dans le bandeau du haut (« Archive : … »). Un élément est <b>effacé quand il n’a pas été modifié</b> depuis cette durée. Les éléments existants et les nouveaux sont en « Illimitée ». Avec <b>« À la demande »</b>, rien n’est effacé tout seul : tu choisis une date (demain, 1 semaine, 1 mois, 1 an) et l’app te <b>propose</b> alors de supprimer, de reporter ou de garder.</p>
      ${KEEP_ORDER.map(k => `<div class="item kc k-${k}" style="padding:6px 10px;margin-top:6px;background:rgba(120,120,120,.1);border-radius:8px"><strong>${esc(KEEP[k].label)}</strong><span class="meta">— ${esc(KEEP[k].desc)}</span></div>`).join('')}</div>

    <div class="card"><h3>❗ Conservation des notes À faire</h3>
      <p class="meta">Durée (en jours) avant effacement d’une note sans modification, selon son niveau. <b>0 = illimitée.</b> S’applique aux notes créées ou changées de niveau ensuite.</p>
      ${todoLevels().map(l => `<label class="row" style="margin-top:6px"><span class="grow">${l.icon} ${esc(l.label)}</span><input type="number" min="0" max="3650" inputmode="numeric" data-ld="${l.id}" value="${levelDays(l.id)}" style="width:90px"></label>`).join('')}</div>

    <div class="card"><h3>🔐 Mots de passe</h3>
      <p class="meta">${v ? (vaultKey ? 'Coffre déverrouillé.' : 'Coffre verrouillé.') : 'Aucun mot de passe de coffre défini.'}</p>
      <div class="btn-list">
        ${v ? `<button id="p-vchg">Changer le mot de passe du coffre</button>${vaultKey ? '<button id="p-vlock">🔒 Verrouiller maintenant</button>' : ''}` : '<button id="p-vset" class="btn-gold">Créer le mot de passe du coffre</button>'}
        <label>Verrouillage automatique<select id="p-lock">
          <option value="0">Quand l’app passe en arrière-plan</option><option value="1">Après 1 min d’inactivité</option><option value="2">Après 2 min</option>
          <option value="5">Après 5 min</option><option value="15">Après 15 min</option><option value="30">Après 30 min</option></select></label></div></div>

    <div class="card"><h3>🖼️ Photos (Bunny)</h3>
      <p class="meta">Adresse de ta zone de diffusion Bunny. Tu pourras ensuite saisir seulement le chemin des photos (ex. <code>vacances/plage.jpg</code>).</p>
      <input id="p-bunny" placeholder="https://ma-zone.b-cdn.net" value="${esc(prefs.bunny)}" autocapitalize="off"></div>

    <div class="card"><h3>👤 Compte</h3>
      <p class="meta">La connexion et la synchronisation automatique entre appareils arriveront plus tard, sur invitation.</p>
      <button disabled>Se connecter (bientôt)</button></div>

    <div class="card"><h3>⚠️ Zone sensible</h3><button class="btn-red" id="p-wipe">Tout effacer</button></div>
    <p class="meta" style="text-align:center">AppliMémo ${APP_VERSION} · données stockées sur cet appareil</p>`;
  $('#p-theme').value = prefs.theme; $('#p-theme').onchange = e => { prefs.theme = e.target.value; savePrefs(); };
  $('#p-lock').value = String(prefs.lockMin); $('#p-lock').onchange = e => { prefs.lockMin = +e.target.value; savePrefs(); armLock(); };
  $$('[data-ld]').forEach(i => (i.onchange = () => {
    const v = Math.max(0, Math.min(3650, Math.round(+i.value) || 0)); i.value = v;
    prefs.levelDays = { ...prefs.levelDays, [i.dataset.ld]: v }; savePrefs(); toast('Durée enregistrée ✓');
  }));
  $('#p-exp').onclick = () => exportJSON();
  $('#p-exp-sel').onclick = () => { libSelect = true; nav('#/biblio'); toast('Coche les pages puis touche « JSON ».'); };
  $('#p-imp').onclick = () => $('#file-import').click();
  $('#p-pdf-sel').onclick = () => { libSelect = true; nav('#/biblio'); toast('Coche les pages puis touche « PDF ».'); };
  $('#p-pdf-all').onclick = () => printKeys(allKeys());
  const vs = $('#p-vset'); if (vs) vs.onclick = () => vaultSetupSheet(() => render());
  const vc = $('#p-vchg'); if (vc) vc.onclick = vaultChangeSheet;
  const vl = $('#p-vlock'); if (vl) vl.onclick = () => lockVault();
  $('#p-bunny').onchange = e => {
    const raw = e.target.value.trim();
    if (!raw) { prefs.bunny = ''; savePrefs(); return toast('Adresse Bunny retirée.'); }
    const u = Core.safeUrl(raw);
    if (!u) return toast('Adresse invalide (https://…).');
    prefs.bunny = u.replace(/\/+$/, ''); e.target.value = prefs.bunny; savePrefs(); toast('Adresse Bunny enregistrée ✓');
  };
  $('#p-wipe').onclick = () => confirmSheet('Tout effacer (journées, tâches, mémos, coffre) ?', 'Tout effacer', () => withUndo('Données effacées', () => {
    live(state.todos).forEach(kill); liveNotes().forEach(kill);
    Object.values(state.days).forEach(d => { live(d.blocs).forEach(kill); d.subtitle = ''; touch(d); });
    state.vault = null; lockVault(true); nav('#/journee');
  }));
};

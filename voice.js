/* Mémos vocaux : enregistrement au micro (MediaRecorder), sons conservés dans IndexedDB sur l'appareil.
 * La note ne contient que les métadonnées {id, titre, dur, at, mime, note} (voir core.js) ; le son est stocké sous la même clé id.
 * Les sons ne sont PAS dans les exports JSON (trop volumineux) : un mémo importé d'un autre appareil affiche « son absent ». */
'use strict';

const AudioStore = (() => {
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('applimemo-audio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('audio', mode), rq = fn(t.objectStore('audio'));
      t.oncomplete = () => res(rq && rq.result); t.onerror = t.onabort = () => rej(t.error);
    });
  };
  return { put: (id, blob) => tx('readwrite', s => s.put(blob, id)), get: id => tx('readonly', s => s.get(id)),
    del: id => tx('readwrite', s => s.delete(id)), keys: () => tx('readonly', s => s.getAllKeys()) };
})();

/** Copie un son (duplication d'un mémo vocal). */
const copyAudio = (from, to) => AudioStore.get(from).then(b => b && AudioStore.put(to, b)).catch(() => {});

const fmtDur = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const MIMES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];   // mp4 : Safari / iPhone
const pickMime = () => (window.MediaRecorder && MediaRecorder.isTypeSupported ? MIMES.find(t => MediaRecorder.isTypeSupported(t)) : '') || '';

let rec = null;        // enregistrement en cours : { mr, chunks, start, note, tick }
let voiceView = null;  // vue affichée : { n, box, draw }

async function startRec(n) {
  if (rec) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast('Enregistrement audio non disponible sur cet appareil.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return toast('Micro refusé : autorise-le dans les réglages du navigateur.'); }
  const mime = pickMime();
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('Enregistrement audio non disponible sur cet appareil.'); }
  const r = rec = { mr, chunks: [], start: Date.now(), note: n, tick: 0 };
  mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
  mr.onstop = async () => {
    clearInterval(r.tick); stream.getTracks().forEach(t => t.stop());
    if (rec === r) rec = null;
    const dur = Math.round((Date.now() - r.start) / 1000), blob = new Blob(r.chunks, { type: mr.mimeType || mime || 'audio/webm' });
    if (!blob.size || dur < 1) { toast('Enregistrement trop court : ignoré.'); return redrawVoice(n); }
    const id = uid();
    try { await AudioStore.put(id, blob); } catch (e) { toast('Stockage audio impossible (espace insuffisant ?).'); return redrawVoice(n); }
    n.data.items.unshift({ id, titre: 'Vocal ' + fmtStamp(), dur, at: Date.now(), mime: blob.type, note: '' });
    touch(n); save(); toast('Enregistrement ajouté.'); redrawVoice(n);
  };
  mr.start(1000);
  r.tick = setInterval(() => { const t = $('#v-timer'); if (t) t.textContent = fmtDur(Math.round((Date.now() - r.start) / 1000)); }, 500);
  redrawVoice(n);
}
function stopRec() { if (rec && rec.mr.state !== 'inactive') rec.mr.stop(); }
const redrawVoice = n => { if (voiceView && voiceView.n === n && document.contains(voiceView.box)) voiceView.draw(); };
window.addEventListener('hashchange', stopRec);   // on quitte la page : l'enregistrement en cours est sauvegardé, pas perdu

/** Corps d'une note « Mémos vocaux ». */
function bodyVoice(box, n, refreshTags) {
  const urls = [];
  const rows = () => n.data.items.map(it => `<div class="card vitem" data-id="${it.id}">
      <div class="row"><button class="vtitle grow" data-edit aria-label="Modifier">${esc(it.titre || 'Vocal')}</button>
        <span class="meta">${esc(dateFR(it.at || 0))} · ${fmtDur(it.dur || 0)}</span></div>
      ${it.note ? `<div class="meta">${esc(it.note)}</div>` : ''}
      <audio controls preload="none" data-aid="${it.id}"></audio></div>`).join('');
  const draw = () => {
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    const on = rec && rec.note === n;
    box.innerHTML = `<div class="card vrec"><button id="v-rec" class="${on ? 'recording' : ''}">${on ? '⏹ Arrêter' : '🎙️ Enregistrer'}</button>
      <span id="v-timer" class="vtimer">${on ? fmtDur(Math.round((Date.now() - rec.start) / 1000)) : ''}</span></div>
      ${n.data.items.length ? rows() : '<p class="empty">Aucun enregistrement.<br>Appuie sur « Enregistrer ».</p>'}`;
    $('#v-rec', box).onclick = () => (rec ? stopRec() : startRec(n));
    $$('audio[data-aid]', box).forEach(a => AudioStore.get(a.dataset.aid).then(b => {
      if (!document.contains(a)) return;
      if (b) { const u = URL.createObjectURL(b); urls.push(u); a.src = u; }
      else a.outerHTML = '<div class="meta">Son absent de cet appareil (enregistré ailleurs ou effacé).</div>';
    }).catch(() => { a.outerHTML = '<div class="meta">Son illisible.</div>'; }));
    $$('[data-edit]', box).forEach(b => (b.onclick = () => editSheet(n.data.items.find(x => x.id === b.closest('[data-id]').dataset.id))));
  };
  const editSheet = it => {
    openSheet(`<h3>Enregistrement</h3><form class="form"><label>Titre<input name="t" value="${esc(it.titre)}" autocomplete="off"></label>
      <label>Note<textarea name="n" rows="3" style="min-height:70px">${esc(it.note || '')}</textarea></label>
      <div class="row" style="margin-top:8px"><button type="button" class="btn-red" data-del>🗑</button><a class="btn" data-dl hidden>⬇︎</a>
        <button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Enregistrer</button></div></form>`, c => {
      $('[data-no]', c).onclick = closeSheet;
      AudioStore.get(it.id).then(b => { if (!b) return; const u = URL.createObjectURL(b), a = $('[data-dl]', c);
        a.href = u; a.download = (it.titre || 'vocal').replace(/[^\w\- ]+/g, '_') + (/mp4/.test(it.mime) ? '.m4a' : /ogg/.test(it.mime) ? '.ogg' : '.webm'); a.hidden = false; }).catch(() => {});
      $('[data-del]', c).onclick = () => { closeSheet(); withUndo('Enregistrement supprimé', () => { n.data.items.splice(n.data.items.indexOf(it), 1); touch(n); }); draw(); refreshTags(); };
      $('form', c).onsubmit = e => {
        e.preventDefault();
        it.titre = e.target.t.value.trim(); it.note = e.target.n.value.trim(); touch(n); save(); closeSheet(); draw(); refreshTags();
      };
    });
  };
  voiceView = { n, box, draw };
  draw();
}

/** Nettoyage (au démarrage) : sons qui n'appartiennent plus à aucun mémo vocal (supprimé depuis plus de 30 jours, expiré, remplacé). */
async function cleanAudio() {
  try {
    const keep = new Set(), limit = Date.now() - 30 * 86400000;
    for (const n of state.notes) if (n.type === 'voice' && (!n.deletedAt || n.deletedAt > limit)) n.data.items.forEach(i => keep.add(i.id));
    for (const k of await AudioStore.keys()) if (!keep.has(k)) await AudioStore.del(k);
  } catch (e) { /* IndexedDB indisponible : rien à nettoyer */ }
}
setTimeout(cleanAudio, 3000);

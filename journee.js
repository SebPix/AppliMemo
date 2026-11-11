/* Vues « Ma journée » et « À faire ». */
'use strict';

const tagChips = (text, max = 6) => Core.extractTags(text).slice(0, max)
  .map(t => `<a class="chip" href="#/tag/${encodeURIComponent(t.key)}">#${esc(t.label)}</a>`).join('');

/* ===================== MA JOURNÉE ===================== */
const infoDays = new Set();   // journées dont l'info d'échéance (bouton « i ») est affichée
let lastInfoView = null;
let sessionDay = null;   // dernière journée ouverte pendant cette session (lien « Reprendre »)

/** Écran d'ouverture : 3 boutons (Aujourd'hui · Date à définir · Journée type), recherche, puis toutes les journées créées (tri par modification ou par date). */
let dayQ = '', daySort = 'mod';
try { daySort = localStorage.getItem('applimemo.daysort') === 'date' ? 'date' : 'mod'; } catch (e) {}
function journeeChooser(app) {
  const today = todayISO(), td = state.days[today];
  const tdClass = td && !dayIsEmpty(td) ? keepClass(td) : '';
  app.innerHTML = `<div class="choose3 choose4">
      <button class="bigcard ${tdClass}" data-c="today"><span class="bi">📅</span><strong>Aujourd’hui</strong></button>
      <button class="bigcard" data-c="date"><span class="bi">🗓️</span><strong>Date à définir</strong></button>
      <button class="bigcard" data-c="type"><span class="bi">🧩</span><strong>Journée type</strong></button>
      <button class="bigcard" data-c="plan"><span class="bi">📋</span><strong>Planning</strong></button>
    </div>
    <input type="search" id="day-q" placeholder="Rechercher une journée…" value="${esc(dayQ)}" autocomplete="off" style="margin:12px 0 8px">
    <div class="row day-sort"><span class="meta">Trier :</span>
      <button class="chip ${daySort === 'mod' ? 'on btn-gold' : ''}" data-sort="mod">Par date de modification</button>
      <button class="chip ${daySort === 'date' ? 'on btn-gold' : ''}" data-sort="date">Par date</button></div>
    <div id="day-list"></div>
    ${sessionDay ? `<a class="resume" href="#/journee/${sessionDay}">↩ Reprendre ${esc(longDate(sessionDay))}</a>` : ''}`;
  $('[data-c=today]', app).onclick = () => nav('#/journee/' + today);
  $('[data-c=date]', app).onclick = openDateSheet;
  $('[data-c=type]', app).onclick = () => nav('#/journee/type');
  $('[data-c=plan]', app).onclick = () => nav('#/journee/planning');
  const draw = () => {
    const words = norm(dayQ).split(/\s+/).filter(Boolean);
    const pd = planDates(), inPlan = new Set(pd), pname = planName(), psum = planSummary(pd);
    const showPlan = pd.length && words.every(w => norm([pname, psum, ...pd, ...pd.map(longDate)].join(' ')).includes(w));
    const list = liveDays().filter(d => !inPlan.has(d.date)).map(d => ({ d, hay: norm([longDate(d.date), d.date, d.subtitle, ...blocsOf(d).map(b => b.titre + ' ' + b.texte)].join(' ')) }))
      .filter(x => words.every(w => x.hay.includes(w)))
      .sort((x, y) => daySort === 'date' ? y.d.date.localeCompare(x.d.date) : y.d.updatedAt - x.d.updatedAt);
    const planRow = showPlan ? `<a class="card item lrow plan-row" href="#/journee/planning"><span>📋</span>
        <span class="grow"><strong>${esc(pname)}</strong><div class="meta plan-sum">${esc(psum)}</div></span></a>` : '';
    $('#day-list', app).innerHTML = planRow + (list.length ? list.map(({ d }) => `<a class="card item lrow ${keepClass(d)}" href="#/journee/${d.date}"><span>📅</span>
        <span class="grow">${esc(longDate(d.date))}${d.subtitle ? `<div class="meta">${esc(d.subtitle)}</div>` : ''}</span></a>`).join('')
      : planRow ? '' : `<p class="empty small">${dayQ ? 'Aucune journée ne correspond.' : 'Aucune journée créée pour l’instant.'}</p>`);
  };
  $('#day-q', app).oninput = debounce(e => { dayQ = e.target.value; draw(); }, 120);
  $$('[data-sort]', app).forEach(b => (b.onclick = () => {
    daySort = b.dataset.sort; try { localStorage.setItem('applimemo.daysort', daySort); } catch (e) {}
    $$('[data-sort]', app).forEach(x => { const on = x.dataset.sort === daySort; x.classList.toggle('on', on); x.classList.toggle('btn-gold', on); }); draw();
  }));
  draw();
}
/** Fenêtre « Journée type » : créer une journée à partir d'un modèle. */
VIEWS.jtype = app => {
  setTitle('JOURNÉE TYPE');
  const today = todayISO(), templates = listsFor({ scope: 'day' }, 'template');
  app.innerHTML = `<div class="choose">
    <div class="bigcard col"><div class="row"><span class="bi">🧩</span><span class="grow"><strong>Journée type</strong><br><span class="meta">Partir d’un modèle</span></span></div>
      <select id="jt-sel" ${templates.length ? '' : 'disabled'}>${templates.length ? '<option value="">— choisir une journée type —</option>' + templates.map(t => `<option value="${t.id}">${esc(t.name)} (${countLabel(t.items.length, 'bloc')})</option>`).join('')
        : '<option>Aucune journée type — enregistres-en une depuis une journée (⭐)</option>'}</select>
      <div class="row" id="jt-more" hidden><input type="date" id="jt-date" value="${today}" style="width:auto"><button class="btn-gold grow" id="jt-go">Créer la journée</button></div></div>
  </div>`;
  $('#jt-sel', app).onchange = e => { $('#jt-more', app).hidden = !e.target.value; };
  $('#jt-go', app).onclick = () => {
    const t = state.lists.find(x => x.id === $('#jt-sel', app).value), date = $('#jt-date', app).value;
    if (!t || !date) return;
    applyDayTemplate(t, date);
  };
};
/** « Date à définir » : choisit un jour et l'ouvre. */
function openDateSheet() {
  openSheet(`<h3>Date à définir</h3><form><input type="date" name="d" value="${todayISO()}">
    <div class="row" style="margin-top:12px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Ouvrir</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = e => { e.preventDefault(); const v = e.target.d.value; if (v) { closeSheet(); nav('#/journee/' + v); } };
  });
}
/** Applique une journée type à une date (si la journée a déjà du contenu : on ajoute à la suite) et l'ouvre. */
function applyDayTemplate(t, date) {
  const d = day(date), start = d.blocs.reduce((m, b) => Math.max(m, b.pos), -1) + 1;
  t.items.forEach((i, k) => d.blocs.push(touch({ id: uid(), titre: i.titre, texte: i.texte, ...(i.html ? { html: i.html } : {}), couleur: i.couleur, horaire: i.horaire, pos: start + k })));
  if (t.sub && !d.subtitle) d.subtitle = t.sub;
  touch(d); save(); toast(`Journée type « ${t.name} » appliquée.`); nav('#/journee/' + date);
}

/** En-tête d'une journée (titre, ✏️, i, boutons) + conteneur de ses blocs. Sert à la journée seule (ids pour les tests) et à chaque journée du planning. */
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
const dayName = d => d.subtitle || (d.date === todayISO() ? 'Aujourd’hui' : capFirst(longDate(d.date)));
/** Journée seule : le titre (icône + nom ✏️) et la date sont dans la barre du haut ; sous la barre il ne reste que les boutons (Vider, Trier, Agenda, ＋ Bloc, i).
 *  Dans le planning, chaque journée garde en plus son titre (nom, ✏️, ✕) puisqu'il y en a plusieurs sur la page. */
function dayHTML(d, planning, canRemove) {
  const isToday = d.date === todayISO(), idf = n => (planning ? '' : `id="${n}"`), info = infoDays.has(d.date);
  const bd = !planning && typeof upcomingBirthdays === 'function' ? upcomingBirthdays(7) : [];
  return `
    <section class="day-head ${keepClass(d)}" data-date="${d.date}">
      ${planning ? `<div class="day-title-row"><h2 class="day-title">${esc(dayName(d))}</h2>
        <button class="icon-btn b-rename" aria-label="Modifier le nom de la journée" title="Modifier le nom">✏️</button>
        ${canRemove ? `<button class="icon-btn b-remove" aria-label="Retirer cette journée du planning" title="Retirer du planning">✕</button>` : ''}</div>
      ${isToday || d.subtitle ? `<p class="date-label">${esc(longDate(d.date))}</p>` : ''}` : ''}
      <div class="row actions">
        <button class="btn-red b-reset" ${idf('b-reset')}>Vider</button>
        <button class="b-chrono" ${idf('b-chrono')} title="Trier par horaire">🕒 Trier</button>
        <button class="b-cal" ${idf('b-cal')} title="Google Agenda">${d.cal ? '📆✓' : '📆'} Agenda</button>
        <button class="btn-green b-add" ${idf('b-add')}>＋ Bloc</button>
        ${expiryLabel(d) ? `<button class="info-btn b-info ${info ? 'on' : ''}" ${idf('b-info')} aria-label="Afficher ou masquer les informations de suppression" aria-pressed="${info}" title="Informations">i</button>` : ''}
      </div>
      ${expiryLabel(d) ? `<p class="meta day-info" ${idf('day-info')} ${info ? '' : 'hidden'}>${esc(expiryLabel(d))}</p>` : ''}
    </section>
    ${bd.length ? `<a class="card bday-banner" href="#/memos/type/birthdays">🎂 ${bd.map(b => `<strong>${esc(b.nom)}</strong> ${b.days === 0 ? "aujourd'hui" : b.days === 1 ? 'demain' : 'dans ' + b.days + ' j'}`).join(' · ')}</a>` : ''}
    <div class="blocs" ${idf('blocs')} data-date="${d.date}"></div>`;
}
function bindDay(root, d, { onRemove } = {}) {
  const q = sel => root.querySelector(sel);
  const rn = q('.b-rename'); if (rn) rn.onclick = () => renameDaySheet(d);
  const info = q('.b-info');
  if (info) info.onclick = () => {   // « i » : affiche / masque l'échéance sous la date (désactivé par défaut)
    const on = !infoDays.has(d.date); on ? infoDays.add(d.date) : infoDays.delete(d.date);
    info.classList.toggle('on', on); info.setAttribute('aria-pressed', String(on)); q('.day-info').hidden = !on;
  };
  q('.b-add').onclick = () => addBloc(d);
  q('.b-chrono').onclick = () => sortChrono(d);
  q('.b-cal').onclick = () => Gcal.daySheet(d, () => render());
  q('.b-reset').onclick = () => {
    if (!live(d.blocs).length) return toast('Aucun bloc à effacer.');
    confirmSheet('Effacer TOUS les blocs de la journée ?', 'Effacer', () => withUndo('Blocs effacés', () => { live(d.blocs).forEach(kill); render(); }));
  };
  const rm = q('.b-remove'); if (rm && onRemove) rm.onclick = () => onRemove(d);
}
/** Barre d'actions du haut + sous-titre : ceux de la journée « active » (seule, ou celle en haut de page dans le planning). */
function activateDay(d, { title = true } = {}) {
  state.current = d.date; sessionDay = d.date;
  setActions([...listActions(dayCtx(d.date)), keepAction(d, () => render())]);
  if (title) setDayTitle({ icon: '📅', name: dayName(d), sub: d.subtitle || d.date === todayISO() ? capFirst(longDate(d.date)) : '', item: d, onEdit: () => renameDaySheet(d) });
}

VIEWS.journee = (app, r) => {
  if (!r.date) return journeeChooser(app);
  state.current = r.date;
  const d = day();
  if (lastInfoView !== d.date) infoDays.clear();   // l'info d'échéance repart désactivée à chaque ouverture d'une autre journée
  lastInfoView = d.date;
  activateDay(d);
  app.innerHTML = dayHTML(d, false);
  bindDay(app, d);
  renderBlocs();
};

/* ===================== PLANNING =====================
 * Plusieurs journées dans une même page, chacune avec ses blocs (même fonctionnement que « Journée »).
 * Au-dessus : un bouton par journée (saut rapide, la journée en haut de page est surlignée) et « ＋ » pour en ajouter.
 * La liste des dates est mémorisée sur cet appareil (localStorage) ; les journées elles-mêmes sont des journées ordinaires. */
const PLAN_KEY = 'applimemo.planning';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function planDates() {
  try { const a = JSON.parse(localStorage.getItem(PLAN_KEY)); if (Array.isArray(a)) return [...new Set(a.filter(x => ISO_RE.test(x)))].sort(); } catch (e) {}
  return [];
}
function setPlanDates(a) { try { localStorage.setItem(PLAN_KEY, JSON.stringify([...new Set(a)].sort())); } catch (e) {} }
const PLAN_NAME_KEY = 'applimemo.planning.name';
const planName = () => { try { return localStorage.getItem(PLAN_NAME_KEY) || 'Planning'; } catch (e) { return 'Planning'; } };
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Résumé d'une ligne des dates d'un planning : jours consécutifs regroupés (« 11–13 nov., 20 nov. · 4 j »). */
function planSummary(dates) {
  if (!dates.length) return 'Aucune journée';
  const dt = x => new Date(x + 'T12:00:00'), groups = [];
  dates.forEach(x => { const g = groups[groups.length - 1]; if (g && Math.round((dt(x) - dt(g.end)) / 864e5) === 1) g.end = x; else groups.push({ start: x, end: x }); });
  const fmt = g => {
    const a = dt(g.start), b = dt(g.end), ma = MOIS_COURTS[a.getMonth()], mb = MOIS_COURTS[b.getMonth()];
    return g.start === g.end ? `${a.getDate()} ${ma}` : a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${ma}` : `${a.getDate()} ${ma}–${b.getDate()} ${mb}`;
  };
  return `${groups.map(fmt).join(', ')} · ${dates.length} j`;
}
function renamePlanSheet() {
  openSheet(`<h3>Nom du planning</h3><input type="text" id="pn" value="${esc(planName() === 'Planning' ? '' : planName())}" placeholder="Planning" maxlength="80" autocomplete="off">
    <div class="row" style="margin-top:12px"><button class="grow" data-close>Annuler</button><button class="grow btn-gold" data-ok>OK</button></div>`, c => {
    const input = $('#pn', c);
    const ok = () => { try { const v = input.value.trim(); if (v) localStorage.setItem(PLAN_NAME_KEY, v); else localStorage.removeItem(PLAN_NAME_KEY); } catch (e) {} closeSheet(); render(); };
    $('[data-close]', c).onclick = closeSheet; $('[data-ok]', c).onclick = ok;
    input.onkeydown = e => { if (e.key === 'Enter') ok(); };
    input.focus(); input.select();
  });
}
const planLabel = date => {
  const dt = new Date(date + 'T12:00:00'), wd = dt.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  return `${wd} ${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}`;
};
let planActive = null, planRaf = 0;
function planScrollTo(date, smooth = true) {
  const sec = $(`.day-sec[data-date="${date}"]`); if (sec) sec.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}
function setPlanActive(date, force) {
  if (!force && date === planActive) return;
  planActive = date;
  $$('.plan-chip').forEach(b => { const on = b.dataset.date === date; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  const chip = $(`.plan-chip[data-date="${date}"]`), box = $('.plan-chips');
  if (chip && box) { const c = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2; box.scrollLeft = Math.max(0, c); }
  activateDay(day(date), { title: false });
}
function planSync() {
  planRaf = 0;
  const bar = $('.plan-bar'), secs = $$('.day-sec'); if (!bar || !secs.length) return;
  const line = bar.getBoundingClientRect().bottom + 12;
  let cur = secs[0]; secs.forEach(sec => { if (sec.getBoundingClientRect().top <= line) cur = sec; });
  setPlanActive(cur.dataset.date);
}
document.addEventListener('scroll', () => { if (!planRaf && $('.plan-bar')) planRaf = requestAnimationFrame(planSync); }, { passive: true, capture: true });   // capture : <body> est l'élément qui défile

function planAddSheet(dates) {
  const last = dates[dates.length - 1] || todayISO(), nx = new Date(last + 'T12:00:00'); nx.setDate(nx.getDate() + 1);
  const next = `${nx.getFullYear()}-${pad(nx.getMonth() + 1)}-${pad(nx.getDate())}`;
  openSheet(`<h3>Ajouter une journée au planning</h3><form><input type="date" name="d" value="${next}" required>
    <div class="row" style="margin-top:12px"><button type="button" class="grow" data-no>Annuler</button><button class="grow btn-gold" type="submit">Ajouter</button></div></form>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('form', c).onsubmit = e => {
      e.preventDefault(); const v = e.target.d.value; if (!ISO_RE.test(v)) return;
      closeSheet();
      if (!dates.includes(v)) { setPlanDates([...dates, v]); planActive = v; render(); }
      setTimeout(() => planScrollTo(v), 60);
    };
  });
}

VIEWS.planning = app => {
  let dates = planDates(); if (!dates.length) { dates = [todayISO()]; setPlanDates(dates); }
  setDayTitle({ icon: '📋', name: planName(), sub: planSummary(dates), onEdit: renamePlanSheet });
  document.documentElement.classList.add('plan-snap');
  const today = todayISO();
  if (!dates.includes(planActive)) planActive = dates.includes(today) ? today : dates[0];
  app.innerHTML = `<div class="plan-bar"><div class="plan-chips" role="tablist">${dates.map(x =>
      `<button class="plan-chip ${x === today ? 'today' : ''}" data-date="${x}" title="${esc(longDate(x))}">${esc(planLabel(x))}</button>`).join('')}</div>
    <button class="plan-add" aria-label="Ajouter une journée au planning" title="Ajouter une journée">＋</button></div><div class="plan-spacer"></div>
    <div class="plan-days">${dates.map(x => `<div class="day-sec" data-date="${x}">${dayHTML(day(x), true, dates.length > 1)}</div>`).join('')}</div>`;
  dates.forEach(x => bindDay($(`.day-sec[data-date="${x}"]`, app), day(x), {
    onRemove: d => { const rest = planDates().filter(y => y !== d.date); setPlanDates(rest); if (planActive === d.date) planActive = rest[0]; render(); },
  }));
  $$('.plan-chip', app).forEach(b => (b.onclick = () => { setPlanActive(b.dataset.date); planScrollTo(b.dataset.date); }));
  $('.plan-add', app).onclick = () => planAddSheet(dates);
  renderBlocs();
  setPlanActive(planActive, true);
  requestAnimationFrame(() => { if (planActive !== dates[0]) planScrollTo(planActive, false); });
};

/** Titre personnalisé de la journée (stocké dans d.subtitle) ; vide = titre par défaut (date / Aujourd'hui). */
function renameDaySheet(d) {
  openSheet(`<h3>Titre de la journée</h3><input type="text" id="dt" value="${esc(d.subtitle || '')}" placeholder="${esc(longDate(d.date))}" maxlength="120" autocomplete="off">
    <p class="meta" style="margin:6px 0 0">Laisse vide pour retrouver le titre par défaut.</p>
    <div class="row" style="margin-top:12px"><button class="grow" data-close>Annuler</button><button class="grow btn-gold" data-ok>OK</button></div>`, c => {
    const input = $('#dt', c);
    const ok = () => { d.subtitle = input.value.trim(); touch(d); save(); closeSheet(); render(); };
    $('[data-close]', c).onclick = closeSheet;
    $('[data-ok]', c).onclick = ok;
    input.onkeydown = e => { if (e.key === 'Enter') ok(); };
    input.focus(); input.select();
  });
}

/** Même teinte que le bloc, en plus saturé et plus foncé (bouton couleur) ; gris moyen pour le blanc. */
function satColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#8a8a8a';
  const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d < 0.04) return '#8a8a8a';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const S = 0.8, L = 0.42, c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs((h / 60) % 2 - 1)), mm = L - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [R, G, B].map(v => Math.round((v + mm) * 255).toString(16).padStart(2, '0')).join('');
}

function renderBlocs() { $$('.blocs[data-date]').forEach(renderDayBlocs); }   // toutes les journées affichées (une seule, ou celles du planning)
function renderDayBlocs(box) {
  const d = day(box.dataset.date), blocs = blocsOf(d);
  if (!blocs.length) { box.innerHTML = '<p class="empty">Aucun bloc pour cette journée.<br>Appuie sur « ＋ Bloc ».</p>'; return; }
  box.innerHTML = blocs.map(b => {
    const open = openBlocs.has(b.id);
    return `<article class="bloc" data-id="${b.id}" style="background:${esc(b.couleur)}">
      <div class="bloc-head">
        <button class="time" data-act="time" title="Toucher : horaire · maintenir puis glisser : déplacer le bloc">${b.horaire || '🕒'}</button>
        <input class="titre" type="text" value="${esc(b.titre)}" placeholder="Titre…">
        <button data-act="toggle" aria-label="Dérouler">${open ? '▲' : '▼'}</button>
        <button data-act="color" aria-label="Couleur" style="color:${satColor(b.couleur)}">●</button>
        <button data-act="del" aria-label="Supprimer">🗑</button>
      </div>
      ${open ? `<div class="bloc-body">
        <div class="tools"><button data-act="check">☑ Insérer une check-liste</button><button data-act="dup">Dupliquer</button></div>
        ${Rich.editor(b.html, b.texte, 'Écris ici… (#thème pour classer)')}
      </div>` : (b.texte || tagChips(b.titre + ' ' + b.texte) ? `<div class="bloc-body" style="padding-bottom:8px;font-size:13px;color:#555">${esc(b.texte.split('\n')[0].slice(0, 90))} ${tagChips(b.titre + ' ' + b.texte)}</div>` : '')}
    </article>`;
  }).join('');
}

let blocDragEnd = 0;   // heure de la fin du dernier déplacement de bloc (évite le clic fantôme)
const openBlocs = new Set();   // blocs dépliés (affichage uniquement)
const dayOfEl = el => day(el.closest('.blocs[data-date]').dataset.date);
const dayOfBloc = b => Object.values(state.days).find(x => x.blocs.includes(b));
const blocFrom = el => live(dayOfEl(el).blocs).find(b => b.id === el.closest('.bloc')?.dataset.id);

{
  const app = $('#app');
  app.addEventListener('input', e => {
    const el = e.target.closest('.bloc'); if (!el) return;
    const b = blocFrom(el); if (!b) return;
    if (e.target.matches('input.titre')) b.titre = e.target.value;
    else if (e.target.matches('.rte')) Rich.bind(b, 'texte', 'html', e.target);
    touch(b); save();
  });
  app.addEventListener('click', e => {
    const btn = e.target.closest('.bloc [data-act]'); if (!btn) return;
    if (Date.now() - blocDragEnd < 400) return;   // le relâchement d'un déplacement n'ouvre pas l'horaire
    const b = blocFrom(btn); if (!b) return;
    const act = btn.dataset.act;
    if (act === 'toggle') { openBlocs.has(b.id) ? openBlocs.delete(b.id) : openBlocs.add(b.id); renderBlocs(); }
    else if (act === 'time') timeSheet(b);
    else if (act === 'color') colorSheet(b);
    else if (act === 'check') checklistPicker(b);
    else if (act === 'del') withUndo('Bloc supprimé', () => { kill(b); renderBlocs(); });
    else if (act === 'dup') {
      const d = dayOfEl(btn), c = touch({ ...b, id: uid(), titre: b.titre + ' (copie)' });
      d.blocs.push(c);
      const list = blocsOf(d).filter(x => x !== c); list.splice(list.indexOf(b) + 1, 0, c); setOrder(d, list);
      save(); renderBlocs();
    }
  });

  /* Réorganiser : appui maintenu sur le bouton horaire puis glisser (un simple toucher ouvre l'horaire).
   * Le bloc suit le doigt (transform) ; les autres s'écartent ; l'ordre n'est appliqué qu'au relâchement,
   * sans jamais retirer le bloc du DOM pendant le geste (sinon le navigateur perd le doigt). */
  const HOLD_MS = 300, HOLD_SLOP = 8;
  let drag = null;   // geste en cours : { el, list, items, tops, hs, i, step0, startDocY, lastY, timer, active, raf, pid }
  // Dans cette appli c'est <body> qui défile (html/body en overflow-x:hidden), pas la fenêtre : on cherche l'élément qui défile vraiment.
  const scrollEl = () => (document.body.scrollHeight > document.body.clientHeight + 1 ? document.body : document.scrollingElement);
  const blocScrollY = () => scrollEl().scrollTop || 0;
  const endDrag = () => {
    if (!drag) return;
    clearTimeout(drag.timer); cancelAnimationFrame(drag.raf);
    document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onUp);
    drag = null;
  };
  const layoutDrag = () => {
    const g = drag; if (!g || !g.active) return;
    const vh = window.innerHeight;
    if (g.lastY < 90) scrollEl().scrollTop -= 10; else if (g.lastY > vh - 110) scrollEl().scrollTop += 10;
    const dy = g.lastY + blocScrollY() - g.startDocY;
    g.el.style.transform = `translateY(${dy}px)`;
    const centre = g.tops[g.i] + g.hs[g.i] / 2 + dy;
    let t = 0; g.items.forEach((_, j) => { if (j !== g.i && g.tops[j] + g.hs[j] / 2 < centre) t++; });
    g.target = t;
    const shift = g.hs[g.i] + g.gap;
    g.items.forEach((it, j) => {
      if (j === g.i) return;
      const r = j < g.i ? j : j - 1, r2 = r < t ? r : r + 1;   // rang du bloc parmi les autres → nouvelle case
      const move = j < g.i ? (r2 !== j ? shift : 0) : (r2 !== j ? -shift : 0);
      it.style.transform = move ? `translateY(${move}px)` : '';
    });
    g.raf = requestAnimationFrame(layoutDrag);
  };
  /** Déclenche le déplacement : après l'appui maintenu OU dès que le doigt glisse (le bouton ne sert pas au défilement). Mesure les blocs à cet instant. */
  const armDrag = () => {
    const g = drag; if (!g || g.active) return;
    clearTimeout(g.timer);
    g.items = [...g.list.children].filter(c => c.classList.contains('bloc'));
    g.i = g.items.indexOf(g.el); g.target = g.i;
    if (g.items.length < 2 || g.i < 0) return endDrag();
    const sy0 = blocScrollY(), rects = g.items.map(x => x.getBoundingClientRect());
    g.tops = rects.map(r => r.top + sy0); g.hs = rects.map(r => r.height); g.gap = parseFloat(getComputedStyle(g.el).marginBottom) || 0;
    g.active = true;
    g.list.classList.add('reordering'); g.el.classList.add('dragging'); g.items.forEach(x => x !== g.el && x.classList.add('shifting'));
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
    layoutDrag();
  };
  const onMove = ev => {
    const g = drag; if (!g || ev.pointerId !== g.pid) return;
    g.lastY = ev.clientY;
    if (!g.active && (Math.abs(ev.clientX - g.sx) > HOLD_SLOP || Math.abs(ev.clientY - g.sy) > HOLD_SLOP)) armDrag();
  };
  const onUp = ev => {
    const g = drag; if (!g || ev.pointerId !== g.pid) return;
    const was = g.active, { el, list, items, i, target } = g, cancelled = ev.type === 'pointercancel';
    endDrag();
    if (!was) return;
    blocDragEnd = Date.now();
    items.forEach(x => { x.style.transform = ''; x.classList.remove('shifting'); });
    el.classList.remove('dragging'); list.classList.remove('reordering');
    if (cancelled || target === i) return;
    const others = items.filter(x => x !== el); others.splice(target, 0, el);
    others.forEach(x => list.appendChild(x));
    const d = day(list.dataset.date), order = others.map(c => c.dataset.id);
    setOrder(d, blocsOf(d).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)));
    save();
  };
  app.addEventListener('pointerdown', e => {
    const tb = e.target.closest('.bloc .time'); if (!tb || (e.pointerType === 'mouse' && e.button !== 0)) return;
    endDrag();
    const el = tb.closest('.bloc'), list = el.parentElement, items = [...list.children].filter(c => c.classList.contains('bloc'));
    if (items.length < 2) return;
    const a = document.activeElement; if (a && a !== document.body && a.blur && a.closest('.bloc')) a.blur();   // clavier fermé avant de mesurer les blocs
    drag = { el, list, i: items.indexOf(el), pid: e.pointerId, sx: e.clientX, sy: e.clientY, lastY: e.clientY, startDocY: e.clientY + blocScrollY(), active: false };
    drag.timer = setTimeout(armDrag, HOLD_MS);
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  });
  // une fois le déplacement armé, le doigt ne doit plus faire défiler la page
  document.addEventListener('touchmove', e => { if (drag && drag.active && e.cancelable) e.preventDefault(); }, { passive: false });
  app.addEventListener('contextmenu', e => { if (e.target.closest('.bloc .time')) e.preventDefault(); });
}

function addBloc(d) {
  const n = blocsOf(d).length;
  const b = touch({ id: uid(), titre: '', texte: '', couleur: BLOCK_COLORS[n % 6], horaire: null,
    pos: d.blocs.reduce((m, x) => Math.max(m, x.pos), -1) + 1 });
  d.blocs.push(b); save(); renderBlocs();   // un nouveau bloc est rétracté ; on place le curseur sur son titre
  const el = $(`.bloc[data-id="${b.id}"] input.titre`); el.focus(); el.scrollIntoView({ block: 'center' });
}
function sortChrono(d) {
  setOrder(d, blocsOf(d).map((b, i) => [b, i]).sort((a, c) => {
    const ha = a[0].horaire, hc = c[0].horaire;
    if (ha && hc) return ha.localeCompare(hc) || a[1] - c[1];
    if (ha) return -1; if (hc) return 1; return a[1] - c[1];
  }).map(x => x[0]));
  save(); renderBlocs(); toast('Blocs triés par horaire.');
}
/** Place le bloc à sa place chronologique parmi les blocs déjà horodatés (appelé uniquement quand un horaire vient d'être renseigné) :
 *  juste avant le premier bloc horodaté plus tard, sinon après le dernier bloc horodaté ; seul à avoir un horaire : il ne bouge pas. */
function placeChrono(d, b) {
  const list = blocsOf(d).filter(x => x !== b), timed = list.filter(x => x.horaire);
  if (!timed.length) return;
  const later = timed.find(x => x.horaire > b.horaire);
  const at = later ? list.indexOf(later) : list.indexOf(timed[timed.length - 1]) + 1;
  list.splice(at, 0, b); setOrder(d, list);
}
/** Fenêtre « Horaire » : saisie manuelle de l'heure et des minutes (0–59) ; le bouton 🕒 ouvre des roulettes (heures · minutes par pas de 5) qui remplissent les mêmes champs. */
function timeSheet(b) {
  const pad = n => String(n).padStart(2, '0'), WH = 40;   // WH : hauteur d'une ligne de roulette
  const [h0, m0] = b.horaire ? b.horaire.split(':') : ['', ''];
  const wheel = (id, vals) => `<div class="wheel" id="${id}" role="listbox"><div class="wheel-pad"></div>${vals.map(v => `<div class="wheel-it" data-v="${v}">${v}</div>`).join('')}<div class="wheel-pad"></div></div>`;
  openSheet(`<h3>Horaire</h3>
    <div class="time-pick"><button type="button" class="tp-ico" id="t-clock" aria-label="Choisir avec les roulettes" aria-expanded="false">🕒</button>
      <input id="t-h" type="text" inputmode="numeric" maxlength="2" placeholder="hh" value="${h0}" aria-label="Heures" autocomplete="off">
      <span class="tp-sep">h</span>
      <input id="t-m" type="text" inputmode="numeric" maxlength="2" placeholder="mm" value="${m0}" aria-label="Minutes" autocomplete="off"></div>
    <div class="wheels" id="t-wheels" hidden><div class="wheel-band"></div>${wheel('w-h', Array.from({ length: 24 }, (_, i) => pad(i)))}<span class="tp-sep">:</span>${wheel('w-m', Array.from({ length: 12 }, (_, i) => pad(i * 5)))}</div>
    <div class="row" style="margin-top:12px"><button class="grow" data-clear>Effacer</button><button class="grow btn-gold" data-ok>OK</button></div>`, c => {
    const d = dayOfBloc(b), H = $('#t-h', c), M = $('#t-m', c), wh = $('#w-h', c), wm = $('#w-m', c), box = $('#t-wheels', c);
    const done = () => { touch(b); save(); closeSheet(); renderBlocs(); };
    const clean = el => { el.value = el.value.replace(/\D/g, '').slice(0, 2); };
    [H, M].forEach(el => { el.oninput = () => { clean(el); syncWheels(); }; el.onfocus = () => el.select(); });
    H.onblur = () => { if (H.value.length === 1) H.value = pad(+H.value); };
    M.onblur = () => { if (M.value.length === 1) M.value = pad(+M.value); };
    // roulettes → champs
    let quiet = true;   // vrai pendant un positionnement programmé (ne pas réécrire les champs)
    const idxOf = (w, n) => Math.max(0, Math.min(w.querySelectorAll('.wheel-it').length - 1, n));
    const scrollTo = (w, i) => { quiet = true; w.scrollTop = i * WH; setTimeout(() => { quiet = false; }, 120); };
    function syncWheels() {
      if (box.hidden) return;
      if (H.value !== '') scrollTo(wh, idxOf(wh, +H.value));
      if (M.value !== '') scrollTo(wm, idxOf(wm, Math.round(+M.value / 5)));
    }
    const onWheel = (w, field, val) => {
      let t; w.addEventListener('scroll', () => {
        if (quiet) return;
        clearTimeout(t); t = setTimeout(() => {
          const i = Math.round(w.scrollTop / WH), it = w.querySelectorAll('.wheel-it')[idxOf(w, i)];
          field.value = val(it.dataset.v);
          if (field === H && M.value === '') M.value = '00';
          if (field === M && H.value === '') H.value = pad(new Date().getHours());
        }, 90);
      });
    };
    onWheel(wh, H, v => v); onWheel(wm, M, v => v);
    // toucher une valeur la sélectionne aussi
    [[wh, H], [wm, M]].forEach(([w, field]) => w.addEventListener('click', e => {
      const it = e.target.closest('.wheel-it'); if (!it) return;
      field.value = it.dataset.v;
      if (field === H && M.value === '') M.value = '00';
      if (field === M && H.value === '') H.value = pad(new Date().getHours());
      syncWheels();
    }));
    $('#t-clock', c).onclick = () => {
      box.hidden = !box.hidden; $('#t-clock', c).setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) { if (H.value === '' && M.value === '') { H.value = pad(new Date().getHours()); M.value = '00'; } syncWheels(); }
    };
    $('[data-clear]', c).onclick = () => { b.horaire = null; done(); };
    const validate = () => {
      let h = H.value.trim(), m = M.value.trim(), v = null;
      if (h !== '' || m !== '') {
        if (h === '') return toast('Indique l’heure (0 à 23).');
        if (m === '') m = '0';
        if (+h > 23 || +m > 59) return toast('Horaire invalide : heure 0–23, minutes 0–59.');
        v = pad(+h) + ':' + pad(+m);
      }
      const changed = v !== b.horaire;
      b.horaire = v;
      if (v && changed) placeChrono(d, b);   // l'ordre chronologique ne s'applique qu'à la saisie d'un nouvel horaire ; ensuite le bloc reste déplaçable librement
      done();
    };
    $('[data-ok]', c).onclick = validate;
    const sheet = $('#sheet');
    sheet.onclick = e => { if (e.target === sheet) validate(); };   // toucher en dehors de la fenêtre valide l'horaire (comme OK)
  });
}
function colorSheet(b) {
  openSheet(`<h3>Couleur du bloc</h3><div class="swatches">${BLOCK_COLORS.map(c =>
    `<button class="swatch ${c === b.couleur ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
    <label>Couleur libre <input type="color" id="cc" value="${b.couleur}" style="height:44px;padding:2px"></label>`, c => {
    const set = col => { b.couleur = col; touch(b); save(); closeSheet(); renderBlocs(); };
    $$('.swatch', c).forEach(s => (s.onclick = () => set(s.dataset.c)));
    $('#cc', c).onchange = e => set(e.target.value);
  });
}
/** Insère les lignes d'une check-liste de la bibliothèque dans le texte du bloc. */
function checklistPicker(b) {
  const lists = liveNotes().filter(n => n.type === 'checklist');
  if (!lists.length) return toast('Aucune check-liste. Crée-en une dans Mémos.');
  openSheet(`<h3>Insérer une check-liste</h3><div class="btn-list">${lists.map(n =>
    `<button data-id="${n.id}">${esc(n.title || 'Check-liste')} <span class="meta">(${n.data.items.length})</span></button>`).join('')}</div>`, c => {
    $$('button[data-id]', c).forEach(btn => (btn.onclick = () => {
      const n = noteById(btn.dataset.id);
      const lines = n.data.items.map(i => '☐ ' + i.t).join('\n');
      Rich.append(b, 'texte', 'html', lines); touch(b); save(); closeSheet(); renderBlocs();
    }));
  });
}

/* ===================== À FAIRE =====================
 * Données : une note (type 'todo') par durée de conservation (NOW, urgent, moyen terme, long terme, infini) ; chaque tâche porte sa thématique (theme) et son échéance (due).
 * Accueil : 5 grandes cases (durées) → fenêtre de la durée, ligne 1a = thématiques ; en dessous, une petite case par thématique → fenêtre de la thématique,
 * ligne 1a = durées (Toutes = urgent + moyen terme + long terme + infini, sans NOW). Chaque tâche a son icône de durée (modifiable) et son « i » (date d'effacement).
 * À l'ouverture d'une fenêtre, les tâches échues sont proposées à la suppression ou au report. */
const PRIO_LABEL = ['·', '!', '!!'];   // (PDF)
const DAY = 864e5;
const openTodos = new Set();
const openCl = new Set();     // check-listes importées dépliées (à la création seulement ; ensuite repliées par défaut)   // lignes dont le détail est déroulé (affichage uniquement)
const todoLevels = () => TODO_QUICK.filter(t => t.id !== 'perso');   // urgentissime, urgent, moyen, long, infini
const levelOf = id => TODO_QUICK.find(t => t.id === id);
const levelIcon = id => (levelOf(id) || {}).icon || '👁️';
const levelName = id => (id === 'urgentissime' ? 'NOW' : (levelOf(id) || {}).label || '');
const todoNotes = () => newestFirst(liveNotes().filter(n => n.type === 'todo'));
const levelNotes = () => todoNotes().filter(n => n.data.level);
const openCount = n => n.data.items.filter(i => !i.done).length;
const themeLevels = () => todoLevels().filter(l => l.id !== 'urgentissime');   // durées proposées dans une thématique (sans NOW)

/* Durées de conservation par niveau (jours ; 0 = illimitée), réglables dans les préférences. */
const LEVEL_DAYS = { urgentissime: 3, urgent: 7, moyen: 30, long: 365, infini: 0 };
const levelDays = id => { const v = prefs.levelDays && prefs.levelDays[id]; return Number.isFinite(v) && v >= 0 ? v : LEVEL_DAYS[id]; };
const fmtDays = d => !d ? 'Illimité' : d % 365 === 0 ? `${d / 365} an${d > 365 ? 's' : ''}` : d % 30 === 0 ? `${d / 30} mois` : d % 7 === 0 ? `${d / 7} semaine${d > 7 ? 's' : ''}` : `${d} jour${d > 1 ? 's' : ''}`;
const dueFromNow = level => (levelDays(level) > 0 ? Date.now() + levelDays(level) * DAY : 0);

/** Titre du bandeau : « À FAIRE » suivi d'une pastille blanche (icône + durée, ou nom de thématique). */
const setTitlePill = text => { $('#view-title').innerHTML = `À FAIRE <span class="title-pill">${esc(text)}</span>`; };

/** La note d'un niveau : unique, ouverte directement par sa case (créée à la première ouverture). */
function levelNote(level) {
  let n = levelNotes().find(x => x.data.level === level);
  if (!n) { n = newNote('todo', levelName(level)); n.data.level = level; touch(n); save(); }
  return n;
}
const openLevelNote = level => nav('#/note/' + levelNote(level).id);

/** Remet de l'ordre : anciennes tâches isolées → note sans niveau ; plusieurs notes d'un même niveau → une seule. */
function adoptLegacyTodos() {
  const old = newestFirst(live(state.todos));
  if (old.length) {
    let n = noteById('legacy-todos');
    if (!n) { n = touch({ id: 'legacy-todos', type: 'todo', title: 'Tâches (ancienne liste)', fav: false, data: defaultData('todo') }); state.notes.push(n); }
    old.forEach(t => {
      n.data.items.push({ id: t.id, t: t.text, done: t.done, prio: t.prio || 0, note: t.note || '', ...(t.noteHtml ? { noteHtml: t.noteHtml } : {}) });
      wipeTodo(t);
    });
    touch(n); save();
  }
  const seen = new Map();
  let merged = false;
  levelNotes().forEach(n => {
    const keep = seen.get(n.data.level);
    if (!keep) return seen.set(n.data.level, n);
    n.data.items.forEach(i => { if (!keep.data.items.some(x => x.id === i.id)) keep.data.items.push(i); });
    touch(keep); wipeNote(n); merged = true;
  });
  if (merged) save();
}

/** Appui d'1 s sur un élément (puis le clic qui suit est ignoré). À brancher avant d'affecter onclick. */
function bindHold(el, fn, ms = 1000) {
  let t = 0, held = false;
  el.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; fn(); }, ms); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('click', e => { if (held) { held = false; e.stopImmediatePropagation(); } }, true);
}

let afQ = '';
VIEWS.afaire = app => {
  const notes = levelNotes(), themes = themeList();
  const tile = l => {
    const n = notes.find(x => x.data.level === l.id), c = n ? openCount(n) : 0;
    return `<button type="button" class="tile lvl-tile" data-lvl="${l.id}"><span class="ti">${l.icon}</span>
      <strong>${l.id === 'urgentissime' ? 'Urgentissime (NOW)' : esc(l.label)}</strong>
      <span class="meta">${c} tâche${c > 1 ? 's' : ''}</span><span class="keep-hint">${esc(fmtDays(levelDays(l.id)))}</span></button>`;
  };
  const others = todoNotes().filter(n => !n.data.level);
  app.innerHTML = `<div class="tiles lvl-tiles lvl-tall">${todoLevels().map(tile).join('')}<button type="button" class="tile lvl-tile" id="all-todo" aria-label="Toutes les tâches"><span class="ti">🧐</span><strong>Toutes les tâches</strong><span class="meta">Toutes durées</span></button></div>
    ${searchHTML('af-q', 'Rechercher une tâche…', afQ)}<div id="af-res" hidden></div>
    <div id="af-body"><div class="theme-block"><div class="h2">Thématiques</div>
    <div class="theme-tiles">${themes.map(t => `<button type="button" class="tile theme-tile" data-theme="${esc(t)}"><strong>${esc(t)}</strong><span class="meta">${themeEntries(t, '').filter(e => !e.t.done).length}</span></button>`).join('')}
      <button type="button" class="tile theme-tile no-theme" data-theme="" data-none="1" aria-label="Sans thématique"><strong>${NO_THEME}</strong><span class="meta">${themeEntries('', '').filter(e => !e.t.done).length}</span></button>
      <button type="button" class="tile theme-tile theme-new" id="theme-add" aria-label="Nouvelle thématique"><strong>＋ Nouvelle</strong><span class="meta">thématique</span></button></div></div>
    ${others.length ? `<div class="h2">Autres notes</div>${others.map(n => `<a class="card item lrow ${keepClass(n)}" href="#/note/${n.id}"><span>${n.fav ? '★' : '👁️'}</span>
      <span class="grow">${esc(noteTitle(n))}</span><span class="meta">${esc(noteMeta(n))}</span></a>`).join('')}` : ''}</div>`;
  const afSearch = () => {
    const words = norm(afQ).split(/\s+/).filter(Boolean), res = $('#af-res', app), body = $('#af-body', app);
    res.hidden = !words.length; body.hidden = !!words.length;
    if (!words.length) return;
    const hits = todoNotes().flatMap(n => n.data.items.filter(i => !i.done && words.every(w => norm(i.t + ' ' + (i.note || '')).includes(w))).map(i => ({ n, i })));
    res.innerHTML = hits.length ? hits.map(({ n, i }) => `<a class="card item lrow" href="#/note/${n.id}"><span>${n.data.level ? levelIcon(n.data.level) : '👁️'}</span>
      <span class="grow">${esc(i.t || '(sans texte)')}</span><span class="meta">${esc([n.data.level ? levelName(n.data.level) : '', i.theme || ''].filter(Boolean).join(' · '))}</span></a>`).join('')
      : '<p class="empty small">Aucune tâche ne correspond.</p>';
  };
  $('#af-q', app).oninput = debounce(e => { afQ = e.target.value; afSearch(); }, 120);
  afSearch();
  $$('[data-lvl]', app).forEach(b => (b.onclick = () => openLevelNote(b.dataset.lvl)));
  $$('[data-theme]', app).forEach(b => { if (!b.dataset.none) bindHold(b, () => themeMenu(b.dataset.theme)); b.onclick = () => nav('#/afaire/theme/' + encodeURIComponent(b.dataset.theme)); });
  $('#theme-add').onclick = addThemeSheet;
  $('#all-todo').onclick = () => nav('#/afaire/tout');
};

/* ---------- Thématiques (préférence de l'appareil ; une tâche garde le nom de sa thématique) ---------- */
const THEMES_DEFAULT = ['Travail', 'Maison', 'Perso'];
const NO_THEME = '∅';   // « signe vide » (gris bleu) : pas de thématique, c'est la valeur par défaut d'une tâche (≠ « Toutes »)
const themeGlyph = t => (t ? esc(t.slice(0, 1).toUpperCase()) : NO_THEME);
let todoTheme = '';    // thématique affichée dans une fenêtre de durée ('' = Toutes)
let themeLevel = '';   // durée affichée dans une fenêtre de thématique ('' = Toutes)
const themeList = () => {
  const base = Array.isArray(prefs.themes) ? prefs.themes : THEMES_DEFAULT, extra = new Set();
  todoNotes().forEach(n => n.data.items.forEach(i => { if (i.theme && !base.includes(i.theme)) extra.add(i.theme); }));
  return [...base, ...extra];
};
const setThemes = list => { prefs.themes = list; savePrefs(); };
const cleanThemeName = v => v.replace(/\//g, '-').trim().slice(0, 40);
/** Tâches d'une thématique, toutes durées confondues sauf NOW (ou d'une seule durée), la plus récente en premier. */
const themeEntries = (theme, level) => levelNotes().filter(n => n.data.level !== 'urgentissime' && (!level || n.data.level === level))
  .flatMap(n => n.data.items.filter(i => (i.theme || '') === theme).map(i => ({ t: i, n }))).sort((a, b) => (a.t.id < b.t.id ? 1 : -1));
function mapThemeItems(fn) {   // applique fn(tâche) à toutes les tâches de toutes les notes À faire
  todoNotes().forEach(n => { let ch = false; n.data.items.forEach(i => { if (fn(i)) ch = true; }); if (ch) touch(n); });
  save();
}
const onThemeRoute = () => parseRoute().name === 'atheme';
function addThemeSheet() {
  promptSheet('Nouvelle thématique', { label: 'Nom', value: '', okLabel: 'Ajouter' }, v => {
    v = cleanThemeName(v);
    if (!v || /^toutes$/i.test(v) || themeList().some(t => t.toLowerCase() === v.toLowerCase())) return toast('Nom vide ou déjà utilisé.');
    setThemes([...themeList(), v]); if (!onThemeRoute() && parseRoute().name === 'note') todoTheme = v; render();
  });
}
function themeMenu(name) {
  openSheet(`<h3>${esc(name)}</h3><div class="btn-list"><button data-r>✎ Modifier le nom</button><button data-d class="btn-red">🗑 Supprimer la thématique</button></div>
    <button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $('[data-r]', c).onclick = () => { closeSheet(); promptSheet('Modifier la thématique', { label: 'Nom', value: name, okLabel: 'Enregistrer' }, v => {
      v = cleanThemeName(v);
      if (!v || v === name) return;
      if (/^toutes$/i.test(v) || themeList().some(t => t.toLowerCase() === v.toLowerCase())) return toast('Nom vide ou déjà utilisé.');
      setThemes(themeList().map(t => (t === name ? v : t)));
      mapThemeItems(i => (i.theme === name ? ((i.theme = v), true) : false));
      if (todoTheme === name) todoTheme = v;
      if (onThemeRoute() && parseRoute().theme === name) nav('#/afaire/theme/' + encodeURIComponent(v)); else render();
    }); };
    $('[data-d]', c).onclick = () => { closeSheet(); confirmSheet(`Supprimer la thématique « ${name} » ? Ses tâches restent, sans thématique.`, 'Supprimer', () => {
      setThemes(themeList().filter(t => t !== name));
      mapThemeItems(i => (i.theme === name ? ((i.theme = ''), true) : false));
      if (todoTheme === name) todoTheme = '';
      if (onThemeRoute() && parseRoute().theme === name) nav('#/afaire'); else render();
    }); };
  });
}

/** Flèches ◀ ▶ de la barre jaune : parcourent NOW → Urgent → Moyen → Long → Infini → Toutes les tâches (en boucle), à emplacement fixe de part et d'autre du titre. */
function titleArrows(cur) {
  const ids = [...todoLevels().map(l => l.id), 'tout'], k = ids.indexOf(cur), row = $('.top-row');
  row.classList.add('has-nav');
  [['-1', '◀', 'précédente', 'l'], ['1', '▶', 'suivante', 'r']].forEach(([d, g, lab, side]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tnav tnav-' + side; b.dataset.lgo = d; b.textContent = g; b.setAttribute('aria-label', 'Durée ' + lab);
    b.onclick = e => {
      e.stopPropagation();
      const id = ids[(k + (+d) + ids.length) % ids.length];
      location.replace(id === 'tout' ? '#/afaire/tout' : '#/note/' + levelNote(id).id);   // replace : pas d'empilement dans l'historique
    };
    row.appendChild(b);
  });
  // Les flèches sont figées de part et d'autre du titre le plus large (« À FAIRE 🧐 Toutes les tâches ») : même emplacement dans toutes les fenêtres À faire,
  // au plus près de ce titre sans toucher le bouton retour (gauche) ni le ✓ / la roue (droite).
  const h = $('#view-title'), ref = h.cloneNode(false);
  ref.removeAttribute('id'); ref.className = h.className; ref.style.cssText = 'visibility:hidden;pointer-events:none;max-width:none;left:0;top:0;transform:none;';
  ref.innerHTML = `À FAIRE <span class="title-pill">🧐 Toutes les tâches</span>`;
  row.appendChild(ref); const w = ref.getBoundingClientRect().width; ref.remove();
  const cx = row.getBoundingClientRect().width / 2, aw = $('.tnav', row).getBoundingClientRect().width;
  const lo = Math.max(0, ...['#top-ico'].map(q => { const e = $(q); return e && !e.hidden ? e.getBoundingClientRect().right : 0; }));
  const hi = $('#btn-gear').getBoundingClientRect().left - 6;   // s'arrête avant la roue (le ✓ de sauvegarde passe brièvement sous la flèche)
  const cap = Math.min(cx - lo, hi - cx) - 2;
  row.style.setProperty('--navhalf', Math.max(40, Math.floor(Math.min(Math.ceil(w / 2) + 1, cap - aw - 4))) + 'px');
}

/** Boutons communs à toutes les fenêtres À faire : insérer une check-liste ; partager la note (échéance) dans Google Agenda. */
const levelActions = n => [
  { icon: '☑️', label: 'Insérer une Check-liste', fn: () => importChecklistSheet(n) },
  { icon: n.cal ? '📆✓' : '📆', label: 'Agenda', fn: () => Gcal.noteSheet(n, () => render()) },
];

/* ---------- Fenêtre d'une durée (ligne 1a = thématiques) ---------- */
function levelWindow(app, n) {
  const lv = levelOf(n.data.level);
  setTitlePill(`${lv.icon} ${levelName(lv.id)}`);
  titleArrows(lv.id);
  const isNow = n.data.level === 'urgentissime';   // NOW : pas de thématiques
  if (isNow || (todoTheme && todoTheme !== NO_THEME && !themeList().includes(todoTheme))) todoTheme = '';
  if (!isNow) setActions([
    { icon: '', label: 'Toutes', cls: todoTheme === '' ? 'on' : '', fn: () => { todoTheme = ''; render(); } },
    ...themeList().map(t => ({ icon: '', label: t, cls: todoTheme === t ? 'on' : '', fn: () => { todoTheme = t; render(); }, hold: () => themeMenu(t) })),
    { icon: '', label: NO_THEME, cls: 'notheme ' + (todoTheme === NO_THEME ? 'on' : ''), fn: () => { todoTheme = NO_THEME; render(); } },
    { icon: '', label: '＋', fn: addThemeSheet },
    ...levelActions(n),
  ]);
  if (isNow) setActions(levelActions(n));   // NOW : pas de thématiques ; seulement l'insertion d'une check-liste et l'Agenda (ligne 1a)
  app.innerHTML = `${isNow ? '' : `<div class="theme-title">${esc(todoTheme === NO_THEME ? NO_THEME + ' Sans thématique' : todoTheme || 'Toutes notes')}</div>`}<div id="n-body"></div>`;
  const entries = () => n.data.items.filter(i => !todoTheme || (todoTheme === NO_THEME ? !i.theme : i.theme === todoTheme)).map(i => ({ t: i, n }));
  bodyTasks($('#n-body', app), { entries, icons: true, add: text => {
    n.data.items.unshift({ id: uid(), t: text, done: false, prio: 0, note: '', ...(todoTheme && todoTheme !== NO_THEME ? { theme: todoTheme } : {}), ...(dueFromNow(n.data.level) ? { due: dueFromNow(n.data.level) } : {}) }); touch(n);
  } });
  dueCheck(n.id, entries);
}

/* ---------- Fenêtre d'une thématique (ligne 1a = durées) ---------- */
VIEWS.atheme = (app, r) => {
  const theme = r.theme;
  setTitlePill(theme || NO_THEME + ' Sans thématique');
  setActions([{ icon: '', label: 'Toutes', cls: themeLevel === '' ? 'on' : '', fn: () => { themeLevel = ''; render(); } },
    ...themeLevels().map(l => ({ icon: l.icon, label: l.label, cls: themeLevel === l.id ? 'on' : '', fn: () => { themeLevel = l.id; render(); } }))]);
  app.innerHTML = `<div class="theme-title">${esc(themeLevel ? levelName(themeLevel) : 'Toutes durées')}</div><div id="n-body"></div>`;
  const entries = () => themeEntries(theme, themeLevel);
  bodyTasks($('#n-body', app), { entries, icons: true, add: text => {
    const lvl = themeLevel || 'urgent', n = levelNote(lvl);
    n.data.items.unshift({ id: uid(), t: text, done: false, prio: 0, note: '', ...(theme ? { theme } : {}), ...(dueFromNow(lvl) ? { due: dueFromNow(lvl) } : {}) }); touch(n);
  } });
  dueCheck('theme:' + theme, entries);
};

/* ---------- Échéances : à l'ouverture, les tâches échues sont proposées à la suppression ou au report ---------- */
let dueShown = '';   // fenêtre dont la proposition a déjà été faite pendant cette visite (remis à zéro en quittant les fenêtres À faire)
function dueCheck(key, getEntries) {
  if (dueShown === key) return;
  dueShown = key;
  const t = Date.now(), due = getEntries().filter(e => e.t.due && e.t.due <= t);
  if (!due.length) return;
  const canPost = due.some(e => levelDays(e.n.data.level) > 0);
  openSheet(`<h3>Tâches arrivées à échéance</h3>
    <p class="meta">Coche celles à supprimer${canPost ? ' ou à reporter (durée de leur niveau)' : ''}.</p>
    <label class="row item"><input type="checkbox" id="due-all" style="width:22px;flex:none"><strong class="grow">Tout sélectionner</strong></label>
    ${due.map(e => `<label class="row item"><input type="checkbox" data-id="${e.t.id}" style="width:22px;flex:none"><span>${levelIcon(e.n.data.level)}</span><span class="grow">${esc(e.t.t || '(sans texte)')}</span><span class="meta">${esc(dateFR(e.t.due))}</span></label>`).join('')}
    <div class="row" style="margin-top:12px"><button class="grow" data-later>Plus tard</button>${canPost ? '<button class="grow btn-gold" data-post>Reporter</button>' : ''}<button class="grow btn-red" data-del>Supprimer</button></div>`, c => {
    const boxes = $$('input[data-id]', c), picked = () => boxes.filter(b => b.checked).map(b => b.dataset.id);
    $('#due-all', c).onchange = e => boxes.forEach(b => (b.checked = e.target.checked));
    boxes.forEach(b => (b.onchange = () => { $('#due-all', c).checked = boxes.every(x => x.checked); }));
    $('[data-later]', c).onclick = closeSheet;
    const need = fn => () => { const ids = new Set(picked()); if (!ids.size) return toast('Coche au moins une tâche.'); closeSheet(); fn(due.filter(e => ids.has(e.t.id))); };
    $('[data-del]', c).onclick = need(list => withUndo('Tâches supprimées', () => {
      list.forEach(e => { const k = e.n.data.items.indexOf(e.t); if (k > -1) e.n.data.items.splice(k, 1); touch(e.n); });
      render();
    }));
    const post = $('[data-post]', c);
    if (post) post.onclick = need(list => { list.forEach(e => { e.t.due = dueFromNow(e.n.data.level); touch(e.n); }); save(); toast('Reporté ✓'); });
  });
}

/* ---------- « i » : date d'effacement de la tâche ; icône : changer de durée ---------- */
/** Fait basculer une tâche dans la catégorie (durée) lvl : elle change de note, son échéance repart de la durée de cette catégorie. */
function moveToLevel(e, lvl) {
  if (lvl === e.n.data.level) return false;
  const dst = levelNote(lvl), src = e.n.data.items, k = src.indexOf(e.t);
  if (k > -1) src.splice(k, 1);
  if (lvl === 'urgentissime') e.t.theme = '';   // NOW : pas de thématique
  e.t.due = dueFromNow(lvl); dst.data.items.unshift(e.t); touch(e.n); touch(dst); save();
  e.n = dst;
  return true;
}
const dueSentence = t => (t.due ? `Sera effacée le ${dateFR(t.due)}` : 'Ne sera pas effacée automatiquement');
const keepSentence = e => `Conservation de la tâche = ${e.n.data.level ? fmtDays(levelDays(e.n.data.level)) : 'aucune durée'}`;

/** « i » : conservation de la tâche (durée de sa catégorie, date d'effacement) ; choisir une autre catégorie la fait basculer. */
function infoSheet(e, after) {
  const opts = c => todoLevels().map(l => `<button data-l="${l.id}" class="${l.id === e.n.data.level ? 'btn-gold' : ''}">${l.icon} ${esc(levelName(l.id))}
    <span class="meta">${esc(fmtDays(levelDays(l.id)))}</span></button>`).join('');
  openSheet(`<h3>ⓘ <span id="inf-k">${esc(keepSentence(e))}</span></h3><p id="inf-s"><b>${esc(dueSentence(e.t))}</b></p>
    <p class="meta">Modifier la durée de conservation :</p>
    <div class="btn-list" id="inf-l">${opts()}</div>
    <button class="grow" data-no style="width:100%;margin-top:10px">Fermer</button>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    const bind = () => $$('[data-l]', c).forEach(b => (b.onclick = () => {
      if (!moveToLevel(e, b.dataset.l)) return;
      $('#inf-k', c).textContent = keepSentence(e); $('#inf-s', c).innerHTML = `<b>${esc(dueSentence(e.t))}</b>`;
      $('#inf-l', c).innerHTML = opts(); bind();
      toast(`${levelIcon(e.n.data.level)} ${dueSentence(e.t)} ✓`);
      after();
    }));
    bind();
  });
}
/** Icône de durée d'une tâche : choisir une autre catégorie. */
function levelPickSheet(e, after) {
  openSheet(`<h3>Durée de conservation</h3><div class="btn-list">${todoLevels().map(l => `<button data-l="${l.id}" class="${l.id === e.n.data.level ? 'btn-gold' : ''}">${l.icon} ${esc(levelName(l.id))}
    <span class="meta">${esc(fmtDays(levelDays(l.id)))}</span></button>`).join('')}</div>
    <button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $$('[data-l]', c).forEach(b => (b.onclick = () => {
      closeSheet();
      if (moveToLevel(e, b.dataset.l)) { toast(`${levelIcon(e.n.data.level)} ${dueSentence(e.t)}`); after(); }
    }));
  });
}
/** Bouton de thématique d'une tâche : ∅ (aucune) ou une thématique existante. */
function themePickSheet(e, after) {
  openSheet(`<h3>Thématique</h3><div class="btn-list"><button data-t="" class="notheme ${e.t.theme ? '' : 'btn-gold'}">${NO_THEME} Sans thématique</button>
    ${themeList().map(t => `<button data-t="${esc(t)}" class="${e.t.theme === t ? 'btn-gold' : ''}">${themeGlyph(t)} ${esc(t)}</button>`).join('')}</div>
    <button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    $$('[data-t]', c).forEach(b => (b.onclick = () => { closeSheet(); e.t.theme = b.dataset.t; touch(e.n); save(); after(); }));
  });
}

/** Liste de tâches. src : { entries() → [{t: tâche, n: note}], add(texte), icons (icône de durée à gauche) }. */
function bodyTasks(box, src) {
  const draw = () => {
    const all = src.entries(), open = all.filter(e => !e.t.done), done = all.filter(e => e.t.done);
    const row = e => {
      const t = e.t, isOpen = openTodos.has(t.id), has = !!(t.note && t.note.trim());
      if (t.cl) {   // check-liste importée : une ligne repliable contenant une vraie check-liste
        const real = t.cl.items.filter(i => !i.blk), nd = real.filter(i => i.done).length, op = openCl.has(t.id);
        return `<div class="card todo clblock" data-id="${t.id}"><div class="trow">
          <button class="arrow" data-clarrow aria-label="Déplier / replier la check-liste" aria-expanded="${op}">${op ? '▾' : '▸'}</button>
          ${src.icons && e.n.data.level ? `<button class="lvl-ic" data-lvlpick aria-label="Changer la durée">${levelIcon(e.n.data.level)}</button>` : ''}
          ${src.icons && e.n.data.level && e.n.data.level !== 'urgentissime' ? `<button class="theme-ic ${t.theme ? '' : 'notheme'}" data-themepick aria-label="Thématique" title="${esc(t.theme || 'Sans thématique')}">${themeGlyph(t.theme)}</button>` : ''}
          <span class="cl-mark" title="Check-liste">☑️</span><input type="text" value="${esc(t.t)}" placeholder="Check-liste…">
          <span class="meta cl-count">${nd}/${real.length}</span>
          <button class="info" data-info aria-label="Date d’effacement">ⓘ</button><button data-del aria-label="Supprimer">✕</button></div>
          ${op ? '<div class="clbody"></div>' : ''}</div>`;
      }
      return `<div class="card todo ${t.done ? 'done' : ''}" data-id="${t.id}">
        <div class="trow">
          <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Fait">
          ${src.icons && e.n.data.level ? `<button class="lvl-ic" data-lvlpick aria-label="Changer la durée">${levelIcon(e.n.data.level)}</button>` : ''}
          ${src.icons && e.n.data.level && e.n.data.level !== 'urgentissime' ? `<button class="theme-ic ${t.theme ? '' : 'notheme'}" data-themepick aria-label="Thématique" title="${esc(t.theme || 'Sans thématique')}">${themeGlyph(t.theme)}</button>` : ''}
          <input type="text" value="${esc(t.t)}" placeholder="Tâche…">
          <button class="cal-ic ${t.cal ? 'on' : ''}" data-cal aria-label="Google Agenda" title="${t.cal ? esc('Dans l’agenda le ' + t.cal + (t.calTime ? ' à ' + t.calTime : '')) : 'Ajouter à Google Agenda'}">📆</button>
          <button class="info" data-info aria-label="Date d’effacement">ⓘ</button>
          <button class="arrow ${has ? 'has' : ''}" data-arrow aria-label="Détails" aria-expanded="${isOpen}">${isOpen ? '▲' : '▼'}</button>
          <button data-del aria-label="Supprimer">✕</button>
        </div>
        ${isOpen ? Rich.editor(t.noteHtml, t.note || '', 'Détails, lignes de texte… (#thème pour classer)', 'todo-note')
          : has ? `<div class="todo-peek" data-arrow>${esc(t.note.trim().split('\n')[0].slice(0, 80))}</div>` : ''}
      </div>`;
    };
    box.innerHTML = `<form class="row" id="todo-form" style="margin-bottom:8px">
        <input type="text" id="todo-new" class="grow" placeholder="Nouvelle tâche…" autocomplete="off">
        <button class="btn-blue" type="submit">＋</button>
      </form>
      ${open.length ? open.map(row).join('') : '<p class="empty">Rien à faire. 🎉</p>'}
      ${done.length ? `<div class="h2 row"><span class="grow">Terminées (${done.length})</span><button id="clear-done">Vider</button></div>${done.map(row).join('')}` : ''}`;
    $('#todo-form', box).onsubmit = ev => {
      ev.preventDefault();
      const v = $('#todo-new', box).value.trim(); if (!v) return;
      src.add(v); save(); draw();
      $('#todo-new', box).focus();
    };
    const cd = $('#clear-done', box);
    if (cd) cd.onclick = () => withUndo('Tâches terminées supprimées', () => {
      done.forEach(e => { const k = e.n.data.items.indexOf(e.t); if (k > -1) e.n.data.items.splice(k, 1); touch(e.n); });
      render();
    });
    $$('.todo', box).forEach(el => {
      const e = all.find(x => x.t.id === el.dataset.id), t = e.t;
      if (t.cl) {   // ligne check-liste : nom modifiable, flèche, ⓘ, durée, suppression ; l'intérieur = l'éditeur de check-liste (1/2/3 colonnes, blocs de texte, déplacer…)
        $('input[type=text]', el).oninput = ev => { t.t = ev.target.value; touch(e.n); save(); };
        $('[data-info]', el).onclick = () => infoSheet(e, draw);
        const lp2 = $('[data-lvlpick]', el); if (lp2) lp2.onclick = () => levelPickSheet(e, draw);
        const tp2 = $('[data-themepick]', el); if (tp2) tp2.onclick = () => themePickSheet(e, draw);
        $('[data-clarrow]', el).onclick = () => { openCl.has(t.id) ? openCl.delete(t.id) : openCl.add(t.id); draw(); };
        $('[data-del]', el).onclick = () => withUndo('Check-liste supprimée', () => { e.n.data.items.splice(e.n.data.items.indexOf(t), 1); touch(e.n); draw(); });
        const host = $('.clbody', el);
        if (host) {
          const cnt = $('.cl-count', el);
          const pn = { id: t.id, type: 'checklist', fav: false, keep: 'never', get title() { return t.t; }, get data() { return t.cl; },
            get updatedAt() { return e.n.updatedAt; },
            set updatedAt(v) { e.n.updatedAt = v; const rl = t.cl.items.filter(i => !i.blk); cnt.textContent = `${rl.filter(i => i.done).length}/${rl.length}`; } };
          bodyChecklist(host, pn);
        }
        return;
      }
      $('input[type=checkbox]', el).onchange = ev => { t.done = ev.target.checked; touch(e.n); save(); draw(); };
      $('input[type=text]', el).oninput = ev => { t.t = ev.target.value; touch(e.n); save(); };
      $('[data-info]', el).onclick = () => infoSheet(e, draw);
      $('[data-cal]', el).onclick = () => Gcal.taskSheet(e, draw);
      const tp = $('[data-themepick]', el); if (tp) tp.onclick = () => themePickSheet(e, draw);
      const lp = $('[data-lvlpick]', el); if (lp) lp.onclick = () => levelPickSheet(e, draw);
      $$('[data-arrow]', el).forEach(b => (b.onclick = () => {
        openTodos.has(t.id) ? openTodos.delete(t.id) : openTodos.add(t.id); draw();
        if (openTodos.has(t.id)) $('.todo[data-id="' + t.id + '"] .rte').focus();
      }));
      const ta = $('.todo-note', el); if (ta) ta.oninput = ev => { Rich.bind(t, 'note', 'noteHtml', ev.target); touch(e.n); save(); };
      $('[data-del]', el).onclick = () => withUndo('Tâche supprimée', () => { e.n.data.items.splice(e.n.data.items.indexOf(t), 1); touch(e.n); draw(); });
    });
    syncTop();   // la ligne « mise en forme » dépend de la présence d'un détail déplié
  };
  draw();
}
/** Note « À faire » sans durée (anciennes tâches). */
function bodyTodo(box, n) {
  bodyTasks(box, { entries: () => n.data.items.map(i => ({ t: i, n })), icons: false, add: text => { n.data.items.unshift({ id: uid(), t: text, done: false, prio: 0, note: '' }); touch(n); } });
}

/* ---------- « Toutes les tâches » : toutes les tâches de toutes les durées confondues ---------- */
let allLevel = '', allTheme = null, allQ = '';   // allTheme : null = toutes, '' = ∅ (sans thématique), sinon le nom
VIEWS.atout = app => {
  setTitlePill('🧐 Toutes les tâches'); titleArrows('tout');
  const chip = (attr, val, on, label) => `<button type="button" class="chip ${on ? 'on btn-gold' : ''} ${label.includes('c2') ? 'two' : ''}" ${attr}="${esc(val)}">${label}</button>`;
  app.innerHTML = `<div class="chiprow" id="all-lv">${chip('data-l', '', allLevel === '', 'Toutes<span class="c2">durées</span>')}${todoLevels().map(l => chip('data-l', l.id, allLevel === l.id, `${l.icon} ${esc(levelName(l.id))}`)).join('')}</div>
    <div class="chiprow" id="all-th">${chip('data-t', '*', allTheme === null, 'Toutes<span class="c2">thématiques</span>')}${themeList().map(t => chip('data-t', t, allTheme === t, esc(t))).join('')}${chip('data-t', '', allTheme === '', `<span class="notheme">${NO_THEME}</span>`)}</div>
    ${searchHTML('all-q', 'Rechercher une tâche…', allQ)}
    <div id="n-body"></div>`;
  $$('#all-lv [data-l]', app).forEach(b => (b.onclick = () => { allLevel = b.dataset.l; render(); }));
  $$('#all-th [data-t]', app).forEach(b => (b.onclick = () => { allTheme = b.dataset.t === '*' ? null : b.dataset.t; render(); }));
  $('#all-q', app).oninput = debounce(e => {
    allQ = e.target.value; render();
    const q = $('#all-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
  }, 200);
  const entries = () => {
    const words = norm(allQ).split(/\s+/).filter(Boolean);
    return levelNotes().filter(n => !allLevel || n.data.level === allLevel)
      .flatMap(n => n.data.items.map(i => ({ t: i, n })))
      .filter(e => (allTheme === null || (e.t.theme || '') === allTheme) && words.every(w => norm(e.t.t + ' ' + (e.t.note || '')).includes(w)))
      .sort((x, y) => (x.t.id < y.t.id ? 1 : -1));
  };
  bodyTasks($('#n-body', app), { entries, icons: true, add: text => {
    const lvl = allLevel || 'urgent', n = levelNote(lvl), th = allTheme && lvl !== 'urgentissime' ? allTheme : '';
    n.data.items.unshift({ id: uid(), t: text, done: false, prio: 0, note: '', ...(th ? { theme: th } : {}), ...(dueFromNow(lvl) ? { due: dueFromNow(lvl) } : {}) }); touch(n);
  } });
  dueCheck('tout', () => levelNotes().flatMap(n => n.data.items.map(i => ({ t: i, n }))));
};


/* ---------- NOW : importer le contenu d'une check-liste ---------- */
function importChecklistSheet(n) {
  const cls = liveNotes().filter(x => x.type === 'checklist').sort((a, b) => noteTitle(a).localeCompare(noteTitle(b), 'fr'));
  const tps = listsFor({ scope: 'checklist' }, 'template');
  const btn = (k, id, name, nb) => `<button data-${k}="${id}" style="text-align:left"><strong>${esc(name)}</strong> <span class="meta">${countLabel(nb, 'élément')}</span></button>`;
  openSheet(`<h3>Insérer une check-liste</h3>
    ${cls.length ? `<div class="h2">Check-listes</div><div class="btn-list">${cls.map(x => btn('src', x.id, noteTitle(x), x.data.items.filter(i => !i.blk).length)).join('')}</div>` : ''}
    ${tps.length ? `<div class="h2">Listes types</div><div class="btn-list">${tps.map(x => btn('tpl', x.id, x.name, x.items.filter(i => !i.blk).length)).join('')}</div>` : ''}
    ${cls.length || tps.length ? '' : '<p class="empty small">Aucune check-liste à importer.</p>'}
    <button class="grow" data-no style="width:100%;margin-top:10px">Annuler</button>`, c => {
    $('[data-no]', c).onclick = closeSheet;
    const add = (name, items, cols, reset) => {
      const id = uid();
      n.data.items.unshift({ id, t: name, done: false, prio: 0, note: '', ...(n.data.level !== 'urgentissime' && todoTheme && todoTheme !== NO_THEME ? { theme: todoTheme } : {}), ...(dueFromNow(n.data.level) ? { due: dueFromNow(n.data.level) } : {}),
        cl: { items: items.map(i => (i.blk ? { id: uid(), t: i.t, done: false, blk: true } : { id: uid(), t: i.t, done: reset ? false : !!i.done })), cols: [1, 2, 3].includes(+cols) ? +cols : 2 } });
      openCl.add(id);   // déployée à la création ; repliée par défaut ensuite
      touch(n); save(); closeSheet(); render(); toast('Check-liste importée ✓');
    };
    $$('[data-src]', c).forEach(b => (b.onclick = () => { const s = noteById(b.dataset.src); add(noteTitle(s), s.data.items, s.data.cols, false); }));
    $$('[data-tpl]', c).forEach(b => (b.onclick = () => { const s = state.lists.find(x => x.id === b.dataset.tpl); add(s.name, s.items, s.cols, true); }));
  });
}

/* Google Agenda : identifiants d'événements et événements voulus (sans réseau). node tests/gcal.test.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const Core = require('../core.js');
const pad = n => String(n).padStart(2, '0');
const ctx = { Core, pad, prefs: { gClient: 'x', gCal: 'primary', gmail: '', gTitleOnly: false }, saveHooks: [], debounce: f => f, toast() {}, copyText() {},
  location: { origin: 'https://exemple.github.io', pathname: '/AppliMemo/' }, navigator: { onLine: true }, window: {}, document: {}, localStorage: { getItem: () => null, setItem() {} },
  $: () => null, esc: s => String(s ?? ''), longDate: d => d, todayISO: () => '2026-11-11', openSheet() {}, closeSheet() {}, savePrefs() {}, Intl };
ctx.state = Core.migrate({
  days: { '2026-10-13': { subtitle: 'Réunion', cal: true, blocs: [
    { id: 'b1', titre: 'Dentiste', texte: 'rue X', horaire: '09:00', pos: 0 }, { id: 'b2', titre: 'Appel', horaire: '09:30', pos: 1 },
    { id: 'b3', titre: 'Courses', texte: 'pain', pos: 2 }, { id: 'b4', titre: 'Nuit', horaire: '23:45', pos: 3 } ] },
    '2026-10-14': { subtitle: 'Autre', blocs: [{ id: 'b9', titre: 'x', horaire: '10:00', pos: 0 }] } },
  notes: [{ id: 'n1', type: 'divers', title: 'Mémo xxx', cal: '2026-10-13', calTime: '14:00', data: { text: 'contenu' } },
    { id: 'td', type: 'todo', title: 'Urgent', data: { level: 'urgent', items: [{ id: 'i1', t: 'Payer', done: true, cal: '2026-12-31' }, { id: 'i2', t: 'Sans date' }] } },
    { id: 'pw', type: 'password', cal: '2026-10-20', data: { enc: null, kid: '' } },
    { id: 'cl1', type: 'checklist', title: 'Courses', cal: '2026-10-15', data: { items: [{ id: 'a', t: 'Pain', done: true }, { id: 'b', t: 'Lait', done: false }, { id: 'c', t: 'Rayon frais', blk: true }] } },
    { id: 'td2', type: 'todo', title: 'Projets', cal: '2026-10-16', data: { items: [{ id: 'x', t: 'Appeler', done: false, note: 'avant midi' }, { id: 'y', t: 'Envoyer', done: true }] } }] }, '2026-11-11');
Object.assign(ctx, { liveNotes: () => ctx.state.notes.filter(n => !n.deletedAt), noteTitle: n => n.title || 'x', noteText: n => (n.data.text || ''),
  dayIsEmpty: d => !d.subtitle && !d.blocs.length, blocsOf: d => d.blocs.filter(b => !b.deletedAt).sort((a, b) => a.pos - b.pos) });
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../gcal.js'), 'utf8') + '\nthis.Gcal = Gcal;', ctx);
const G = ctx.Gcal, want = G.desired();

// identifiants : alphabet base32hex, déterministes, distincts, longueur autorisée (5–1024)
for (const k of ['t:abc', 'n:k1z-x_Y', 'd:2026-10-13', 'b:lq2x9m1ab']) { const id = G.evId(k); assert.ok(/^[a-v0-9]{5,1024}$/.test(id), id); assert.equal(id, G.evId(k)); }
assert.notEqual(G.evId('t:a'), G.evId('n:a'));

assert.deepEqual([...want.keys()].sort(), ['b:b1', 'b:b2', 'b:b4', 'd:2026-10-13', 'n:cl1', 'n:n1', 'n:pw', 'n:td2', 't:i1']);   // pas de b9 (journée non envoyée), pas de i2 (sans date)
const e = k => want.get(k);
assert.equal(e('b:b1').start.dateTime, '2026-10-13T09:00:00'); assert.equal(e('b:b1').end.dateTime, '2026-10-13T09:30:00');   // se termine quand le suivant commence
assert.equal(e('b:b2').end.dateTime, '2026-10-13T10:30:00');                                                                    // dernier bloc du matin : 1 h
assert.equal(e('b:b4').end.dateTime, '2026-10-13T23:59:00');                                                                    // jamais après minuit
assert.equal(e('d:2026-10-13').start.date, '2026-10-13'); assert.equal(e('d:2026-10-13').end.date, '2026-10-14');
assert.ok(e('d:2026-10-13').summary.includes('Réunion')); assert.ok(e('d:2026-10-13').description.includes('Courses'));
assert.ok(!e('d:2026-10-13').description.includes('Dentiste'));                                                                    // les blocs horaires ont leur propre événement
assert.equal(e('n:n1').start.dateTime, '2026-10-13T14:00:00'); assert.equal(e('n:n1').summary, 'Mémo xxx');
assert.equal(e('n:n1').source.url, 'https://exemple.github.io/AppliMemo/#/note/n1');                                              // le lien qui rouvre le mémo dans l'app
assert.ok(e('n:n1').description.endsWith('https://exemple.github.io/AppliMemo/#/note/n1'));
assert.equal(e('b:b1').source.url, 'https://exemple.github.io/AppliMemo/#/journee/2026-10-13');
assert.equal(e('t:i1').summary, '✓ Payer'); assert.equal(e('t:i1').start.date, '2026-12-31'); assert.equal(e('t:i1').end.date, '2027-01-01');   // fin d'année
assert.equal(e('t:i1').source.url, 'https://exemple.github.io/AppliMemo/#/note/td');
assert.ok(!e('n:pw').description.includes('undefined'));
assert.ok(e('n:cl1').description.startsWith('☑ Pain\n☐ Lait\nRayon frais'));           // check-liste : coches + blocs de texte, sans « true »
assert.ok(!e('n:cl1').description.includes('true'));
assert.ok(e('n:td2').description.startsWith('☐ Appeler\n   avant midi\n☑ Envoyer'));     // liste À faire
assert.equal(e('n:pw').description, '↗ Ouvrir dans AppliMémo : https://exemple.github.io/AppliMemo/#/note/pw');   // coffre : jamais de contenu
// « titre seulement » (activé par défaut ; ici testé après coup) : plus aucun texte, seulement titres + lien
ctx.prefs.gTitleOnly = true;
const lite = G.desired(), L = k => lite.get(k);
assert.ok(!JSON.stringify([...lite.values()]).includes('Lait') && !JSON.stringify([...lite.values()]).includes('avant midi') && !JSON.stringify([...lite.values()]).includes('rue X') && !JSON.stringify([...lite.values()]).includes('contenu') && !JSON.stringify([...lite.values()]).includes('pain'));   // aucun texte
assert.equal(L('b:b1').summary, 'Dentiste'); assert.equal(L('n:n1').summary, 'Mémo xxx'); assert.equal(L('t:i1').summary, '✓ Payer');
assert.equal(L('n:n1').description, '↗ Ouvrir dans AppliMémo : https://exemple.github.io/AppliMemo/#/note/n1');   // le lien reste
assert.ok(L('d:2026-10-13').description.includes('• Courses') && !L('d:2026-10-13').description.includes('pain'));
ctx.prefs.gTitleOnly = undefined;   // préférence absente = activé
assert.equal(G.desired().get('n:n1').description.includes('contenu'), false);
// texte long : jamais coupé en silence ; coupé avec mention seulement au-delà de la limite de Google
ctx.prefs.gTitleOnly = false;
const longTxt = 'mot '.repeat(400).trim();                                  // ~1 600 caractères
ctx.state.days['2026-10-13'].blocs.find(b => b.id === 'b3').texte = longTxt;  // bloc sans horaire
ctx.state.notes.find(n => n.id === 'n1').data.text = 'x'.repeat(9000);        // mémo géant
const big = G.desired();
assert.ok(big.get('d:2026-10-13').description.includes(longTxt));            // bloc sans horaire : texte entier (avant : coupé à 300)
assert.ok(big.get('n:n1').description.includes('(texte coupé') && big.get('n:n1').description.length < 8192);
assert.ok(!big.get('n:cl1').description.includes('(texte coupé'));
console.log('GOOGLE AGENDA OK');

const assert = require('assert');
const Core = require('../core.js');
const J = x => JSON.parse(JSON.stringify(x));
const T = '2026-11-08';
// 1. migration d'un état v1 + nettoyage d'un import hostile
const v1 = { days: { '2026-10-23': { date: '2026-10-23', subtitle: 'Rép', blocs: [{ id: 'a', titre: 'x', texte: 't', couleur: '#e8d3b5', horaire: '09:00', theme: null }] } }, todos: [{ id: 't1', text: 'z', done: false, prio: 1 }] };
const m = Core.migrate(v1, T);
assert.equal(m.v, 3); assert.equal(m.days['2026-10-23'].blocs[0].pos, 0); assert.equal(m.todos[0].updatedAt, 0);
const evil = Core.migrate({ days: { '2026-01-01': { blocs: [{ id: 'b"><img>', titre: 1 }, { id: 'ok', couleur: 'red;x" onload="', horaire: '99:99' }] }, 'pas-une-date': {} } }, T);
assert.equal(evil.days['2026-01-01'].blocs.length, 1); assert.equal(evil.days['2026-01-01'].blocs[0].couleur, '#ffffff'); assert.equal(evil.days['2026-01-01'].blocs[0].horaire, null);
assert.equal(Object.keys(evil.days).length, 1);
assert.deepEqual(Core.migrate(null, T), Core.emptyState(T)); assert.deepEqual(Core.migrate('x', T).days, {});
// 2. fusion : deux appareils modifient des choses différentes
const base = Core.migrate({ days: { [T]: { subtitle: 's', updatedAt: 1, blocs: [
  { id: 'b1', titre: 'un', updatedAt: 1, pos: 0 }, { id: 'b2', titre: 'deux', updatedAt: 1, pos: 1 } ] } }, todos: [{ id: 't1', text: 'a', updatedAt: 1 }] }, T);
const A = J(base), B = J(base);
A.days[T].blocs[0].titre = 'un (A)'; A.days[T].blocs[0].updatedAt = 10;           // A édite b1
B.days[T].blocs[1].deletedAt = B.days[T].blocs[1].updatedAt = 20;                  // B supprime b2
B.days[T].blocs.push({ id: 'b3', titre: 'trois', updatedAt: 15, pos: 2, texte: '', couleur: '#fff000', horaire: null, theme: null });
B.todos[0].text = 'a (B)'; B.todos[0].updatedAt = 12;
const M1 = Core.merge(A, B, T), M2 = Core.merge(B, A, T);
assert.deepEqual(M1.days[T].blocs.map(b => [b.id, b.titre, !!b.deletedAt]), [['b1', 'un (A)', false], ['b2', 'deux', true], ['b3', 'trois', false]]);
assert.deepEqual(M1.days[T].blocs, M2.days[T].blocs); assert.equal(M1.todos[0].text, 'a (B)');   // commutatif
assert.deepEqual(Core.merge(M1, M1, T).days, M1.days);                                            // idempotent
assert.equal(A.days[T].blocs[0].titre, 'un (A)');                                                 // entrées non modifiées
// 3. sous-titre : le plus récent gagne
A.days[T].subtitle = 'sA'; A.days[T].updatedAt = 30; B.days[T].subtitle = 'sB'; B.days[T].updatedAt = 25;
assert.equal(Core.merge(B, A, T).days[T].subtitle, 'sA');
// 4. annuler une suppression ne doit pas être ré-écrasé par la fusion avec un appareil qui l'a déjà reçue
const before = J(base); const after = J(base);
after.days[T].blocs[1].deletedAt = after.days[T].blocs[1].updatedAt = 100;
const restored = Core.restoreFrom(J(before), after, 200);
assert.ok(!restored.days[T].blocs[1].deletedAt); assert.equal(restored.days[T].blocs[1].updatedAt, 200);
assert.ok(!Core.merge(restored, after, T).days[T].blocs[1].deletedAt);
// 5. annuler une création => pierre tombale
const created = J(base); created.todos.push({ id: 'n', text: 'new', updatedAt: 50, done: false, prio: 0 });
const r2 = Core.restoreFrom(J(base), created, 300);
assert.ok(r2.todos.find(x => x.id === 'n').deletedAt);

// 6. hashtags
const tg = Core.extractTags('Réunion #Été et #ete, #idée-2 (#x) http://a.fr/#ancre #1 mot#collé');
assert.deepEqual(tg.map(t => t.key), ['ete', 'idee-2', 'x']); assert.equal(tg[0].label, 'Été');
// 7. migration v2 : thématiques explicites → hashtags ; anciens mémos → notes « divers »
const v2 = { days: { [T]: { blocs: [{ id: 'b', texte: 'idée', theme: 'th1', updatedAt: 5 }, { id: 'c', texte: 'déjà #Travail', theme: 'th1' }] } },
  themes: [{ id: 'th1', name: 'Travail' }], memos: [{ id: 'm1', titre: 'Vélo', texte: 'pneus' }] };
const m3 = Core.migrate(v2, T);
assert.equal(m3.days[T].blocs[0].texte, 'idée\n#Travail'); assert.equal(m3.days[T].blocs[1].texte, 'déjà #Travail');
assert.equal(m3.notes[0].type, 'divers'); assert.equal(m3.notes[0].data.text, 'pneus'); assert.equal(m3.themes, undefined);
// 8. notes typées : validation et nettoyage d'un import hostile
const notes = Core.migrate({ notes: [
  { id: 'l1', type: 'links', title: 'W', data: { items: [{ id: 'a', titre: 'ok', url: 'example.com/x' }, { id: 'b', url: 'javascript:alert(1)' }, { id: 'c', url: 'data:text/html,x' }] } },
  { id: 'p1', type: 'photos', data: { items: [{ id: 'a', url: 'dossier/photo 1.jpg' }, { id: 'b', url: '../../etc/passwd' }, { id: 'c', url: 'https://x.b-cdn.net/a.jpg' }] } },
  { id: 'bd', type: 'birthdays', data: { items: [{ id: 'a', nom: 'Léa', j: 31, m: 13, a: 1990 }, { nom: 'Tom', j: 5, m: 2 }] } },
  { id: 'pw', type: 'password', data: { enc: { iv: 'AAAA', ct: '<script>' }, kid: 'k' } },
  { id: 'x"y', type: 'divers' }, { id: 'z', type: 'inconnu' }, { id: 'ck', type: 'checklist', data: { items: [{ t: 'a', done: 1 }, 'bad', null] } },
], vault: { salt: 'AAAA', iter: 5, check: { iv: 'AAAA', ct: 'AAAA' } } }, T);
const byId = id => notes.notes.find(n => n.id === id);
assert.equal(notes.notes.length, 5);
assert.deepEqual(byId('l1').data.items.map(i => i.url), ['https://example.com/x', '', '']);
assert.deepEqual(byId('p1').data.items.map(i => i.url), ['dossier/photo 1.jpg', 'https://x.b-cdn.net/a.jpg']);
assert.deepEqual(byId('bd').data.items.map(i => [i.j, i.m]), [[31, 1], [5, 2]]); assert.equal(byId('bd').data.items[0].a, 1990);
assert.equal(byId('pw').data.enc, null); assert.equal(byId('ck').data.items.length, 3); assert.equal(notes.vault.iter, 100000);
assert.equal(Core.safeUrl('ftp://x.fr'), ''); assert.equal(Core.safeUrl('pas un lien'), ''); assert.ok(Core.validEmail('a@b.fr')); assert.ok(!Core.validEmail('a@b'));
// 9. fusion des notes + coffre le plus récent
const N1 = Core.migrate({ notes: [{ id: 'n', type: 'divers', title: 'a', updatedAt: 1, data: { text: 'v1' } }] }, T), N2 = J(N1);
N2.notes[0].data.text = 'v2'; N2.notes[0].updatedAt = 9;
assert.equal(Core.merge(N1, N2, T).notes[0].data.text, 'v2');
const V = { salt: 'AAAA', iter: 310000, check: { iv: 'AAAA', ct: 'AAAA' }, updatedAt: 5 };
assert.equal(Core.merge({ ...N1, vault: V }, { ...N2, vault: { ...V, salt: 'BBBB', updatedAt: 8 } }, T).vault.salt, 'BBBB');
assert.equal(Core.merge({ ...N1, vault: V }, N2, T).vault.salt, 'AAAA');
// 10. annuler une suppression de note
const nb = J(N1), na = J(N1); na.notes[0].deletedAt = na.notes[0].updatedAt = 50;
assert.ok(!Core.restoreFrom(J(nb), na, 99).notes[0].deletedAt);
// 11. journées types / versions de journée : blocs validés, sous-titre, durée
const dl = Core.migrate({ lists: [
  { id: 'jt', scope: 'day', kind: 'template', name: 'Semaine type', sub: 'Routine', keep: 'never', items: [{ titre: 'Sport', texte: 'x', couleur: 'red;"><b>', horaire: '07:30' }, { titre: 'Bad', horaire: '99:99' }, null] },
  { id: 'jv', scope: 'day', kind: 'version', ref: '2026-11-08', keep: 'bogus', items: [] },
  { id: 'tv', scope: 'todo', kind: 'version', items: [{ t: 'a', done: 1 }] }] }, T);
const jt = dl.lists.find(l => l.id === 'jt');
assert.equal(jt.scope, 'day'); assert.equal(jt.sub, 'Routine'); assert.equal(jt.items.length, 3);
assert.deepEqual([jt.items[0].couleur, jt.items[0].horaire, jt.items[1].horaire, jt.items[2].titre], ['#ffffff', '07:30', null, '']);
assert.equal(dl.lists.find(l => l.id === 'jv').keep, 'never'); assert.equal(dl.lists.find(l => l.id === 'jv').ref, '2026-11-08');
assert.deepEqual(dl.lists.find(l => l.id === 'tv').items[0], { t: 'a', done: true, prio: 0, note: '' });
console.log('TOUS LES TESTS OK');
// Texte enrichi : nettoyage HTML (liste blanche), texte brut dérivé, html périmé ignoré
{
  const C = Core.cleanHtml;
  assert.equal(C('<b>a</b><script>alert(1)</script><img src=x onerror=alert(1)>'), '<b>a</b>alert(1)');
  assert.equal(C('<span style="color: rgb(192, 57, 43); position:fixed; background-image:url(x)" onclick="x()">t</span>'), '<span style="color:rgb(192, 57, 43)">t</span>');
  assert.equal(C('<b style="color:#d32f2f;x:y">c</b>'), '<b style="color:#d32f2f">c</b>');
assert.equal(C('<div align="center">x</div>'), '<div style="text-align:center">x</div>');
  assert.equal(C('<font size="5" color="#ff0000" face="x">t</font><strong>g</strong><em>i</em>'), '<font size="5" color="#ff0000">t</font><b>g</b><i>i</i>');
  assert.equal(C('<font color="red;x">t</font>'), '<font>t</font>');
  assert.equal(C('<b>a<i>b</b>c'), '<b>a<i>b</i></b>c');                         // balises rééquilibrées
  assert.equal(C('a</div>b<'), 'ab&lt;');                                          // fermante orpheline ignorée, « < » échappé
  assert.ok(!/<(?!\/?(b|i|u|s|br|div|ul|ol|li|span|font)\b)/.test(C('<a href="javascript:x">l</a><iframe></iframe><style>x</style>')));
  const T = Core.htmlText;
  assert.equal(T('a<div>b</div><div><br></div><div>c</div>'), 'a\nb\n\nc');
  assert.equal(T('<ul><li>un</li><li>deux &amp; &lt;trois&gt;</li></ul>'), 'un\ndeux & <trois>');
  assert.equal(T('x<br>y<br>'), 'x\ny');
  const day = { days: { '2026-01-01': { blocs: [
    { id: 'ok', texte: 'a\nb', html: '<b>a</b><br>b' }, { id: 'perime', texte: 'autre', html: '<b>a</b><br>b' }, { id: 'evil', texte: 'x', html: '<b onclick="1">x</b>' } ] } },
    todos: [{ id: 't', note: 'n', noteHtml: '<i>n</i>' }], notes: [{ id: 'd', type: 'divers', data: { text: 'q', html: '<u>q</u>' } }] };
  const m = Core.migrate(day, '2026-01-01'), bl = m.days['2026-01-01'].blocs;
  assert.deepEqual(bl.map(b => b.html), ['<b>a</b><br>b', undefined, '<b>x</b>']);
  assert.equal(m.todos[0].noteHtml, '<i>n</i>'); assert.equal(m.notes[0].data.html, '<u>q</u>');
  assert.deepEqual(Core.migrate(J(m), '2026-01-01').days, m.days);               // idempotent
}
console.log('texte enrichi OK');
// Mémos vocaux : métadonnées nettoyées (le son lui-même reste dans IndexedDB)
{
  const m = Core.migrate({ notes: [{ id: 'v1', type: 'voice', title: 'Vocaux', data: { items: [
    { id: 'a1', titre: 'Idée', dur: 12.4, at: 1700000000000, mime: 'audio/webm;codecs=opus', note: 'n', evil: '<x>' },
    { id: 'a2', titre: 1, dur: -5, mime: 'text/html' }, { id: 'a3', dur: 'abc', mime: 'audio/mp4' } ] } }] }, '2026-01-01');
  const it = m.notes[0].data.items;
  assert.deepEqual(it[0], { id: 'a1', titre: 'Idée', dur: 12, at: 1700000000000, mime: 'audio/webm;codecs=opus', note: 'n' });
  assert.equal(it[1].dur, 0); assert.equal(it[1].mime, ''); assert.equal(it[2].dur, 0); assert.equal(it[2].mime, 'audio/mp4');
  assert.ok(Core.TYPES.includes('voice'));
  console.log('mémos vocaux OK');
}
// « À la demande » : la date de proposition de suppression survit à la migration et à la fusion
{
  const s = { days: { '2026-02-02': { subtitle: 's', keep: 'ondemand', proposeAt: 1800000000000, updatedAt: 5, blocs: [] } },
    todos: [{ id: 't', text: 'x', keep: 'ondemand', proposeAt: 1800000000000, updatedAt: 1 }],
    notes: [{ id: 'n', type: 'divers', title: 'a', keep: 'ondemand', proposeAt: 1800000000000, updatedAt: 1, data: { text: '' } }],
    lists: [{ id: 'l', scope: 'todo', kind: 'version', name: 'v', keep: 'ondemand', proposeAt: 1800000000000, updatedAt: 1, items: [] }] };
  const m = Core.migrate(s, '2026-01-01');
  assert.equal(m.days['2026-02-02'].keep, 'ondemand'); assert.equal(m.days['2026-02-02'].proposeAt, 1800000000000);
  assert.equal(m.todos[0].proposeAt, 1800000000000); assert.equal(m.notes[0].proposeAt, 1800000000000); assert.equal(m.lists[0].proposeAt, 1800000000000);
  assert.equal(Core.merge(m, Core.emptyState('2026-01-01'), '2026-01-01').days['2026-02-02'].proposeAt, 1800000000000);
  assert.equal(Core.migrate({ todos: [{ id: 'x', proposeAt: 'abc', keep: 'zzz' }] }, 'd').todos[0].proposeAt, undefined);
  console.log('à la demande OK');
}
// coffre : l'indication (en clair) traverse la normalisation, vide ou trop longue → nettoyée
{
  const V0 = { salt: 'AAAA', iter: 310000, check: { iv: 'AAAA', ct: 'AAAA' }, updatedAt: 1 };
  assert.equal(Core.migrate({ vault: { ...V0, hint: '  chat + année  ' } }, T).vault.hint, 'chat + année');
  assert.equal(Core.migrate({ vault: { ...V0, hint: '   ' } }, T).vault.hint, undefined);
  assert.equal(Core.migrate({ vault: V0 }, T).vault.hint, undefined);
  assert.equal(Core.migrate({ vault: { ...V0, hint: 'x'.repeat(500) } }, T).vault.hint.length, 200);
  console.log('indication du coffre OK');
}
// Google Agenda : dates des tâches / mémos et marque des journées traversent la migration et la fusion
{
  const s = Core.migrate({ days: { [T]: { subtitle: 's', cal: true, blocs: [] }, '2026-11-09': { subtitle: 'x', blocs: [] } },
    notes: [{ id: 'n1', type: 'divers', cal: '2026-10-13', calTime: '09:30', data: { text: 'a' } }, { id: 'n2', type: 'divers', cal: 'pas-une-date', calTime: '99:99', data: { text: 'b' } },
      { id: 'td', type: 'todo', data: { level: 'urgent', items: [{ id: 'i1', t: 'x', cal: '2026-12-01', calTime: '25:00' }, { id: 'i2', t: 'y', cal: '1/2/3' }] } }] }, T);
  assert.equal(s.days[T].cal, true); assert.equal(s.days['2026-11-09'].cal, undefined);
  assert.equal(s.notes[0].cal, '2026-10-13'); assert.equal(s.notes[0].calTime, '09:30');
  assert.equal(s.notes[1].cal, undefined); assert.equal(s.notes[1].calTime, undefined);
  assert.equal(s.notes[2].data.items[0].cal, '2026-12-01'); assert.equal(s.notes[2].data.items[0].calTime, undefined); assert.equal(s.notes[2].data.items[1].cal, undefined);
  assert.equal(Core.merge(s, Core.emptyState(T), T).days[T].cal, true);
  const off = J(s); delete off.days[T].cal; off.days[T].updatedAt = 99;
  assert.equal(Core.merge(s, off, T).days[T].cal, undefined);   // le plus récent gagne
  const cur = J(s), snap = J(s); delete cur.days[T].cal;
  assert.equal(Core.restoreFrom(snap, cur, 500).days[T].updatedAt, 500);   // annuler un retrait de l'agenda est re-daté
  console.log('google agenda (données) OK');
}

const assert = require('assert');
const Vault = require('../vault.js');
(async () => {
  assert.ok(Vault.available());
  const { vault, key } = await Vault.create('mon secret 123');
  assert.ok(vault.salt && vault.check.ct && vault.iter >= 100000);
  const data = { items: [{ id: '1', site: 'exemple.fr', login: 'moi', pwd: 'été-€-🔑' }] };
  const enc = await Vault.encrypt(key, data);
  assert.ok(!JSON.stringify(enc).includes('exemple'));                        // rien en clair
  assert.deepEqual(await Vault.decrypt(key, enc), data);                       // aller-retour (accents, emoji)
  const k2 = await Vault.unlock('mon secret 123', vault); assert.ok(k2);       // bon mot de passe
  assert.deepEqual(await Vault.decrypt(k2, enc), data);                        // même clé redérivée
  assert.equal(await Vault.unlock('mauvais', vault), null);                    // mauvais mot de passe
  const e2 = await Vault.encrypt(key, data); assert.notEqual(e2.iv, enc.iv);   // IV unique
  enc.ct = enc.ct.slice(0, -4) + 'AAAA'; await assert.rejects(Vault.decrypt(key, enc)); // altération détectée
  const pw = Vault.generate(20); assert.equal(pw.length, 20); assert.notEqual(pw, Vault.generate(20));
  console.log('COFFRE OK');
})();

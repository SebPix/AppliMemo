/* AppliMémo — coffre à mots de passe : chiffrement AES-GCM 256 bits, clé dérivée du mot de passe
 * par PBKDF2-SHA256 (WebCrypto). Le mot de passe n'est jamais stocké ; seule la clé en mémoire
 * permet de lire le contenu. Mot de passe perdu = contenu définitivement illisible. */
(function (root) {
  'use strict';
  const ITER = 310000;
  const te = new TextEncoder(), td = new TextDecoder();
  const subtle = () => (root.crypto && root.crypto.subtle) || null;
  const b64 = u8 => { let s = ''; u8.forEach(c => (s += String.fromCharCode(c))); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => root.crypto.getRandomValues(new Uint8Array(n));

  async function deriveKey(pw, saltB64, iter) {
    const km = await subtle().importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(key, obj) {
    const iv = rand(12);
    const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }
  async function decrypt(key, e) {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.ct));
    return JSON.parse(td.decode(pt));
  }
  /** Crée les paramètres du coffre pour ce mot de passe → { vault, key } */
  async function create(pw) {
    const salt = b64(rand(16));
    const key = await deriveKey(pw, salt, ITER);
    return { vault: { salt, iter: ITER, check: await encrypt(key, 'applimemo'), updatedAt: Date.now() }, key };
  }
  /** Renvoie la clé si le mot de passe est bon, sinon null. */
  async function unlock(pw, vault) {
    try {
      const key = await deriveKey(pw, vault.salt, vault.iter);
      return (await decrypt(key, vault.check)) === 'applimemo' ? key : null;
    } catch (e) { return null; }
  }
  /** Mot de passe aléatoire (sans biais, sans caractères ambigus). */
  function generate(len = 16, symbols = true) {
    const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789' + (symbols ? '!@#$%&*?-_+=' : '');
    const lim = Math.floor(256 / set.length) * set.length;
    let out = '';
    while (out.length < len) for (const b of rand(len * 2)) { if (b < lim && out.length < len) out += set[b % set.length]; }
    return out;
  }

  const Vault = { available: () => !!subtle(), create, unlock, encrypt, decrypt, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = Vault;
  else root.Vault = Vault;
})(typeof globalThis !== 'undefined' ? globalThis : self);

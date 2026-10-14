import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
// OWASP-recommended scrypt parameter set: N=2^15, r=8, p=3
const N = 32768, r = 8, p = 3, KEYLEN = 64;
const maxmem = 256 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem });
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, stored) {
  try {
    const [alg, n, rr, pp, saltB64, keyB64] = stored.split("$");
    if (alg !== "scrypt") return false;
    const expected = Buffer.from(keyB64, "base64url");
    const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
      N: +n, r: +rr, p: +pp, maxmem,
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Used to spend the same time when the account does not exist (prevents user enumeration by timing).
export const DUMMY_HASH = await hashPassword("dummy-password-for-timing");

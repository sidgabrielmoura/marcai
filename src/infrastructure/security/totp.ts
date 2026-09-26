import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function generateTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  return bits.match(/.{5}/g)!.map(part => alphabet[parseInt(part, 2)]).join("");
}
function decodeSecret(secret: string) {
  if (!/^[A-Z2-7]{16,128}$/.test(secret)) throw new Error("Segredo TOTP inválido.");
  const bits = [...secret].map(char => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  return Buffer.from(bits.match(/.{8}/g)!.map(part => parseInt(part, 2)));
}
// RFC 6238: HMAC-SHA1, intervalo de 30 segundos, seis dígitos.
export function totpAt(secret: string, time = Date.now(), digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", decodeSecret(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
export function verifyTotp(secret: string, code: string, lastCounter = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  for (const drift of [-1, 0, 1]) {
    const time = now + drift * 30000, counter = Math.floor(time / 30000);
    if (counter > lastCounter && timingSafeEqual(Buffer.from(totpAt(secret, time)), Buffer.from(code))) return counter;
  }
  return null;
}
export function securityKey() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET não configurado.");
  return createHash("sha256").update("marcai:second-factor:" + process.env.AUTH_SECRET).digest();
}
export type TotpRecord = { secret: string; lastCounter: number; failures: number; lockedUntil: number };
export function sealTotp(record: TotpRecord) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", securityKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(record)), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function openTotp(value: string): TotpRecord {
  if (!value.startsWith("v1:")) return { secret: value, lastCounter: -1, failures: 0, lockedUntil: 0 };
  const bytes = Buffer.from(value.slice(3), "base64url"), decipher = createDecipheriv("aes-256-gcm", securityKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
}
export function secondFactorProof(value: string | null) {
  if (!value) return "";
  return createHmac("sha256", securityKey()).update(openTotp(value).secret).digest("base64url");
}

export function hasSecondFactorProof(user: { twoFactorEnabled: boolean; twoFactorSecret: string | null; platformRole?: string | null }, proof?: string) {
  if (!user.twoFactorEnabled && user.platformRole !== "SUPERADMIN") return true;
  if (!user.twoFactorEnabled || !user.twoFactorSecret || !proof) return false;
  try {
    const expected = secondFactorProof(user.twoFactorSecret);
    return expected.length === proof.length && timingSafeEqual(Buffer.from(expected), Buffer.from(proof));
  } catch { return false; }
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 8; j++) {
      if (j === 4) code += "-";
      code += chars[randomBytes(1)[0] % chars.length];
    }
    codes.push(code);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}


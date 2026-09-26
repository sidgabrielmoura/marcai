import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.EVIDENCE_STORAGE_DIR || ".data/evidence");
export function inspectEvidenceFile(bytes: Buffer, type: string, name: string, mime: string) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return "O arquivo deve ter até 10 MB e não pode estar vazio.";
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const pdf = bytes.toString("ascii", 0, 5) === "%PDF-";
  const mp4 = bytes.toString("ascii", 4, 8) === "ftyp";
  const format = jpg ? { mime: "image/jpeg", ext: [".jpg", ".jpeg"] } : png ? { mime: "image/png", ext: [".png"] } : webp ? { mime: "image/webp", ext: [".webp"] } : pdf ? { mime: "application/pdf", ext: [".pdf"] } : mp4 ? { mime: "video/mp4", ext: [".mp4"] } : null;
  if (!format || mime !== format.mime || !format.ext.includes(path.extname(name).toLowerCase())) return "Conteúdo, extensão e tipo do arquivo não correspondem. Use JPG, PNG, WebP, PDF ou MP4.";
  if ((type === "PHOTO" || type === "SIGNATURE") && !format.mime.startsWith("image/")) return "Envie uma imagem JPG, PNG ou WebP.";
  if (type === "VIDEO" && !mp4) return "Envie um vídeo MP4.";
  return null;
}
export async function storeEvidence(bytes: Buffer) { const key = randomUUID(); await mkdir(root(), { recursive: true }); await writeFile(path.join(/*turbopackIgnore: true*/ root(), key), bytes, { flag: "wx" }); return key; }
function storagePath(key: string) { if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key"); return path.join(/*turbopackIgnore: true*/ root(), key); }
export async function readEvidence(key: string) { return readFile(/*turbopackIgnore: true*/ storagePath(key)); }
export async function removeEvidence(key: string) { await unlink(storagePath(key)).catch(() => undefined); }

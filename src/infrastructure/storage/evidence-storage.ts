import { prisma } from "@/infrastructure/database/prisma";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.EVIDENCE_STORAGE_DIR || ".data/evidence");
export function inspectEvidenceFile(bytes: Buffer, type: string, name: string, mime: string, maxBytes = 10 * 1024 * 1024) {
  if (!bytes.length || bytes.length > maxBytes) return "O arquivo excede o limite permitido ou está vazio.";
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const pdf = bytes.toString("ascii", 0, 5) === "%PDF-";
  const mp4 = bytes.length>=24 && bytes.readUInt32BE(0)>=16 && bytes.readUInt32BE(0)<=bytes.length && bytes.toString("ascii", 4, 8) === "ftyp" && ["isom","iso2","iso4","iso5","iso6","mp41","mp42","avc1","M4V ","MSNV","dash"].includes(bytes.toString("ascii",8,12));
  const format = jpg ? { mime: "image/jpeg", ext: [".jpg", ".jpeg"] } : png ? { mime: "image/png", ext: [".png"] } : webp ? { mime: "image/webp", ext: [".webp"] } : pdf ? { mime: "application/pdf", ext: [".pdf"] } : mp4 ? { mime: "video/mp4", ext: [".mp4"] } : null;
  if (!format || mime !== format.mime || !format.ext.includes(path.extname(name).toLowerCase())) return "Conteúdo, extensão e tipo do arquivo não correspondem. Use JPG, PNG, WebP, PDF ou MP4.";
  if ((type === "PHOTO" || type === "SIGNATURE") && !format.mime.startsWith("image/")) return "Envie uma imagem JPG, PNG ou WebP.";
  if (type === "VIDEO" && !mp4) return "Envie um vídeo MP4.";
  return null;
}
export async function storeEvidence(bytes: Buffer,db:Pick<typeof prisma,"$executeRaw">=prisma) { if (process.env.EVIDENCE_STORAGE_PROVIDER === "postgres") { const key = randomUUID(); await db.$executeRaw`INSERT INTO mobile_blobs(key,bytes) VALUES(${key}::uuid,${bytes})`; return key; } if (process.env.VERCEL) throw new Error("Configure armazenamento persistente de evidências antes de habilitar uploads na Vercel."); const key = randomUUID(); await mkdir(root(), { recursive: true }); await writeFile(path.join(/*turbopackIgnore: true*/ root(), key), bytes, { flag: "wx" }); return key; }
function storagePath(key: string) { if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Invalid storage key"); return path.join(/*turbopackIgnore: true*/ root(), key); }
export async function readEvidence(key: string) { storagePath(key); if (process.env.EVIDENCE_STORAGE_PROVIDER === "postgres") { const [row] = await prisma.$queryRaw<Array<{ bytes: Uint8Array }>>`SELECT bytes FROM mobile_blobs WHERE key=${key}::uuid`; if (row) return Buffer.from(row.bytes); } return readFile(/*turbopackIgnore: true*/ storagePath(key)); }
export async function removeEvidence(key: string,db:Pick<typeof prisma,"$executeRaw">=prisma) { storagePath(key); if (process.env.EVIDENCE_STORAGE_PROVIDER === "postgres") await db.$executeRaw`DELETE FROM mobile_blobs WHERE key=${key}::uuid`; await unlink(storagePath(key)).catch(() => undefined); }

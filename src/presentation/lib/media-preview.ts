// Only transform Cloudinary delivery URLs; local and authorized application URLs stay intact.
export function cloudinaryPreview(url: string | null | undefined, kind: "image" | "video", thumbnail = false) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") return null;
    const marker = `/${kind}/upload/`;
    if (!parsed.pathname.includes(marker)) return null;
    const transformation = thumbnail ? "c_fill,w_288,h_288" : "c_limit,w_1600";
    parsed.pathname = parsed.pathname.replace(marker, `${marker}${kind === "video" ? "so_0," : ""}${transformation},q_auto${kind === "image" ? ",f_auto" : ""}/`);
    if (kind === "video") parsed.pathname = parsed.pathname.replace(/\.[a-z0-9]+$/i, ".jpg");
    return parsed.href;
  } catch { return null; }
}

export type LocationPoint = { latitude: number; longitude: number; accuracy: number };
export function parseLocation(value: string | null | undefined): LocationPoint | null {
  try {
    const point = JSON.parse(value ?? "");
    if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
    return { latitude: point.latitude, longitude: point.longitude, accuracy: Math.max(0, Number(point.accuracy) || 0) };
  } catch { return null; }
}

/**
 * User-agent satridan qisqa ma'lumot: kirish tarixi va bildirishnomalarda
 * "Chrome · Windows" ko'rinishida chiqadi.
 */

export type DeviceKind = "mobile" | "desktop" | "other";

export function deviceKind(userAgent: string): DeviceKind {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone") || ua.includes("ipad")) return "mobile";
  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) return "desktop";
  return "other";
}

export function deviceOs(userAgent: string): string {
  const s = userAgent || "";
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad/i.test(s)) return "iOS";
  if (/Windows/i.test(s)) return "Windows";
  if (/Mac OS|Macintosh/i.test(s)) return "macOS";
  if (/Linux/i.test(s)) return "Linux";
  return "";
}

export function deviceBrowser(userAgent: string): string {
  const s = userAgent || "";
  if (/Edg\//i.test(s)) return "Edge";
  if (/OPR\//i.test(s)) return "Opera";
  if (/Firefox\//i.test(s)) return "Firefox";
  if (/Chrome\//i.test(s)) return "Chrome";
  if (/Safari\//i.test(s)) return "Safari";
  if (/node|curl|postman/i.test(s)) return "API";
  return "";
}

/** "Chrome · Windows"; aniqlanmasa `fallback` */
export function describeDevice(userAgent: string, fallback: string): string {
  const parts = [deviceBrowser(userAgent), deviceOs(userAgent)].filter(Boolean);
  return parts.length ? parts.join(" · ") : (userAgent || "").slice(0, 40) || fallback;
}

/**
 * Admin xodim nomidan kirgan seansda qurilma oldida "[Ism nomidan]" turadi
 * (backend: AuthService.impersonate). Shu belgini ajratib beradi.
 */
export function splitImpersonation(device: string): { impersonatedBy: string | null; device: string } {
  const raw = String(device || "");
  const match = raw.match(/^\[(.+?) nomidan\]\s*/);
  return match
    ? { impersonatedBy: match[1], device: raw.slice(match[0].length) }
    : { impersonatedBy: null, device: raw };
}

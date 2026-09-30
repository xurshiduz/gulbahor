/**
 * Admin xodim nomidan kirganda uning o'z seansi shu yerda saqlanadi -
 * "Adminga qaytish" bosilganda tiklanadi. sessionStorage: tab yopilsa
 * unutiladi, admin qaytadan o'zi kiradi.
 */
const KEY = "impersonator";

export interface Saved {
  token: string;
  user: Record<string, unknown> & { id?: string; name?: string; username?: string };
}

export function saveImpersonator(token: string, user: Saved["user"]) {
  try {
    // Ichma-ich kirilsa (xodim nomidan yana boshqa xodim) asl admin saqlanib qoladi
    if (!sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, JSON.stringify({ token, user }));
  } catch {
    // Saqlash taqiqlangan bo'lsa banner chiqmaydi, xolos
  }
}

export function readImpersonator(): Saved | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearImpersonator() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // e'tiborsiz
  }
}


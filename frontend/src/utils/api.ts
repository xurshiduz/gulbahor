/**
 * Server xatosidan o'qiladigan matn. Validatsiya xatolarida NestJS
 * `message` ni massiv qilib qaytaradi - vergul bilan birlashtiramiz.
 */
export function errorMessage(body: unknown, fallback: string): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(", ");
  if (typeof message === "string" && message) return message;
  return fallback;
}

/** Javobni JSON sifatida o'qiydi; bo'sh yoki JSON bo'lmasa null */
export async function readJson<T = any>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

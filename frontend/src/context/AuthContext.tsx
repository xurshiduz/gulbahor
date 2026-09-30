import { createContext, useContext, useState, useEffect, ReactNode } from "react";

/**
 * Harakatsizlik bo'yicha ikki bosqichli himoya.
 *
 * 1. Avtobloklash (profildagi PIN kod): belgilangan daqiqadan keyin ekran
 *    bloklanadi va PIN so'raladi. Sessiya ochiq qoladi - PIN kiritilsa ish
 *    davom etadi. PIN esdan chiqsa, blok ekranidan chiqib, login-parol bilan
 *    qayta kiriladi.
 * 2. To'liq chiqish: 8 soat davomida hech qanday harakat bo'lmasa sessiya
 *    yopiladi.
 *
 * Oxirgi harakat vaqti localStorage'da saqlanadi - shu sababli bir nechta tab
 * bir-birini "tirik" ushlab turadi va brauzer yopib ketilsa ham vaqt
 * hisoblanaveradi. Blok holati ham localStorage'da: sahifani yangilash yoki
 * yangi tab ochish blokni chetlab o'tmaydi.
 */
const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 soat
const IDLE_CHECK_INTERVAL_MS = 30 * 1000; // har 30 soniyada tekshiramiz
const LOCK_CHECK_INTERVAL_MS = 5 * 1000; // bloklash aniqroq bo'lishi uchun tez-tez
const ACTIVITY_WRITE_THROTTLE_MS = 10 * 1000; // har harakatda emas, 10 soniyada bir yozamiz
const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // serverga "tirikman" signali
const LAST_ACTIVITY_KEY = "lastActivity";
const SCREEN_LOCKED_KEY = "screenLocked";
export const IDLE_LOGOUT_KEY = "idleLogout";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "click",
] as const;

function readLastActivity(): number | null {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  const ts = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(ts) ? ts : null;
}

function writeLastActivity(ts: number = Date.now()) {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(ts));
}

function readLocked(): boolean {
  return localStorage.getItem(SCREEN_LOCKED_KEY) === "1";
}

function writeLocked(locked: boolean) {
  if (locked) localStorage.setItem(SCREEN_LOCKED_KEY, "1");
  else localStorage.removeItem(SCREEN_LOCKED_KEY);
}

interface AuthContextType {
  token: string | null;
  user: any | null;
  login: (token: string, user: any) => void;
  logout: (reason?: "idle") => void;
  // Serverdagi eng so'nggi ma'lumotni olib keladi (FaceID/QR yoqilgandan keyin kerak)
  refreshUser: () => Promise<any | null>;
  isLoading: boolean;
  // Ekran avtobloklash holati
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [user, setUser] = useState<any | null>(() => {
    try {
      const savedUser = localStorage.getItem("user");
      return savedUser && savedUser !== "undefined" ? JSON.parse(savedUser) : null;
    } catch (error) {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(() => readLocked());

  /**
   * Serverdan foydalanuvchi ma'lumotini olib, holatni yangilaydi.
   * Ilgari /me faqat token haqiqiyligini tekshirish uchun chaqirilardi va
   * javobi tashlab yuborilardi - shuning uchun FaceID yoki QR yoqilgandan
   * keyin ham profil eski holatni ko'rsatib turardi.
   */
  const refreshUser = async () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return null;

    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error('unauthorized');

    const fresh = await res.json();
    localStorage.setItem('user', JSON.stringify(fresh));
    setUser(fresh);
    return fresh;
  };

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Sahifa ochilganda: oxirgi harakatdan 8 soatdan ko'p vaqt o'tgan bo'lsa
      // (masalan, brauzer kechqurun yopilib, ertalab ochilgan bo'lsa) serverga
      // umuman murojaat qilmasdan chiqaramiz.
      const last = readLastActivity();
      if (last === null) {
        // Bu yangilanishdan oldin kirgan foydalanuvchilar uchun boshlang'ich nuqta
        writeLastActivity();
      } else if (Date.now() - last > IDLE_TIMEOUT_MS) {
        await logout("idle");
        setIsLoading(false);
        return;
      }

      try {
        await refreshUser();
      } catch (error) {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, []);

  // Harakatni kuzatish va vaqti kelganda avtomatik chiqarish
  useEffect(() => {
    if (!token) return;

    if (readLastActivity() === null) writeLastActivity();

    const checkIdle = () => {
      const last = readLastActivity();
      if (last !== null && Date.now() - last > IDLE_TIMEOUT_MS) {
        logout("idle");
      }
    };

    let lastWrite = 0;
    let lastHeartbeat = Date.now();
    const handleActivity = () => {
      // Ekran bloklangan bo'lsa harakat "tiriklik" hisoblanmaydi
      if (readLocked()) return;
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite = now;
      writeLastActivity(now);

      // Foydalanuvchi ishlayotgan bo'lsa-yu, sahifa serverga so'rov yubormasa,
      // server sessiyani harakatsiz deb yopib qo'ymasligi uchun signal beramiz.
      if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeat = now;
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkIdle();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", checkIdle);

    const timerId = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);
    checkIdle();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", checkIdle);
      window.clearInterval(timerId);
    };
  }, [token]);

  /**
   * Avtobloklash. Foydalanuvchi PIN o'rnatgan bo'lsa, belgilangan daqiqadan
   * keyin ekran bloklanadi. Bloklangandan keyin harakat kuzatuvi to'xtaydi -
   * aks holda sichqoncha tebranishi blokni ochib yuborardi.
   */
  useEffect(() => {
    if (!token) return;

    const minutes = Number(user?.autoLockMinutes) || 0;
    if (!user?.lockPinEnabled || minutes <= 0) {
      // Sozlama o'chirilgan bo'lsa qolib ketgan blokni ham tozalaymiz
      if (readLocked()) {
        writeLocked(false);
        setIsLocked(false);
      }
      return;
    }

    const lockAfterMs = minutes * 60 * 1000;

    const checkLock = () => {
      if (readLocked()) {
        setIsLocked(true);
        return;
      }
      const last = readLastActivity();
      if (last !== null && Date.now() - last > lockAfterMs) {
        writeLocked(true);
        setIsLocked(true);
      }
    };

    // Boshqa tabda bloklansa yoki ochilsa shu tab ham ergashsin
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SCREEN_LOCKED_KEY) setIsLocked(readLocked());
    };

    const timerId = window.setInterval(checkLock, LOCK_CHECK_INTERVAL_MS);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", checkLock);
    checkLock();

    return () => {
      window.clearInterval(timerId);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", checkLock);
    };
  }, [token, user?.lockPinEnabled, user?.autoLockMinutes]);

  /** Qo'lda qulflash: menyudagi "Qulflash" tugmasi uchun */
  const lock = () => {
    writeLocked(true);
    setIsLocked(true);
  };

  /** PIN to'g'ri kiritilgandan keyin chaqiriladi */
  const unlock = () => {
    writeLocked(false);
    writeLastActivity();
    setIsLocked(false);
  };

  const login = (newToken: string, newUser: any) => {
    localStorage.setItem("token", newToken);
    localStorage.setItem("user", JSON.stringify(newUser));
    writeLastActivity();
    writeLocked(false);
    sessionStorage.removeItem(IDLE_LOGOUT_KEY);
    setIsLocked(false);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async (reason?: "idle") => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (err) {
        // ignore errors on logout
      }
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    // Xodim nomidan kirilgan bo'lsa - chiqishda admin seansi ham unutiladi
    sessionStorage.removeItem("impersonator");
    writeLocked(false);
    setIsLocked(false);
    // Kirish sahifasida sababini ko'rsatish uchun
    if (reason === "idle") sessionStorage.setItem(IDLE_LOGOUT_KEY, "1");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, refreshUser, isLoading, isLocked, lock, unlock }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import PageMeta from "../../components/common/PageMeta";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/ui/button/Button";
import * as faceapi from "face-api.js";
import { Camera, QrCode, Shield, Download, Edit2, Check, Key, Printer, Lock, Languages, X } from "lucide-react";
import PinInput from "../../components/common/PinInput";
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { LANGUAGES, changeLanguage } from "../../i18n";
import { errorMessage, readJson } from "../../utils/api";

// Google akkauntni biriktirish faqat .env da VITE_GOOGLE_CLIENT_ID berilganda ishlaydi
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const inputClass =
  "w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-white focus:ring-brand-500 focus:border-brand-500 outline-none";

/** Sozlama yoqilgan yoki yo'qligini ko'rsatuvchi belgi */
function StatusBadge({ active, activeText, idleText }: { active: boolean; activeText: string; idleText: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        active
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {active && <Check className="w-3 h-3" />}
      {active ? activeText : idleText}
    </span>
  );
}

/** Amal natijasi: yashil - muvaffaqiyat, qizil - xato */
type Status = { ok: boolean; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return <p className={`text-xs font-medium ${status.ok ? "text-green-600" : "text-red-500"}`}>{status.text}</p>;
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, token, refreshUser } = useAuth();

  const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Kamera oqimi - video elementi hali render bo'lmaganda ham shu yerda turadi
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [faceStatus, setFaceStatus] = useState<Status>(null);
  const [googleStatus, setGoogleStatus] = useState<Status>(null);

  // Shaxsiy ma'lumotlar
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editName, setEditName] = useState(user?.name || "");
  const [editPhone, setEditPhone] = useState(user?.phone || "");
  const [infoStatus, setInfoStatus] = useState<Status>(null);

  // Parolni o'zgartirish
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);

  // Avtobloklash PIN kod
  const [lockPin, setLockPin] = useState("");
  const [lockPinConfirm, setLockPinConfirm] = useState("");
  const [lockMinutes, setLockMinutes] = useState<string>(String(user?.autoLockMinutes || 15));
  const [lockStatus, setLockStatus] = useState<Status>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        setIsModelsLoaded(true);
      } catch {
        setFaceStatus({ ok: false, text: t("profile.face_models_error") });
      }
    };

    loadModels();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------- QR beydjik ------------------------------- */

  const generateQr = async () => {
    // Qayta yaratilsa eski beydjik ishlamay qoladi - ogohlantiramiz
    if (user?.qrEnabled && !window.confirm(t("profile.qr_regenerate_confirm"))) return;
    try {
      const res = await fetch('/api/auth/qr/generate', { method: 'POST', headers: authHeaders });
      const data = await readJson(res);
      if (res.ok && data?.qrCodeUrl) {
        setQrCodeUrl(data.qrCodeUrl);
        // Serverda qrEnabled yoqildi - holat belgisi yangilansin
        await refreshUser().catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  };

  const downloadQr = () => {
    if (!qrCodeUrl) return;
    const a = document.createElement('a');
    a.href = qrCodeUrl;
    a.download = `badge_${user?.username}.png`;
    a.click();
  };

  /**
   * Beydjikni chop etish. Standart beydj o'lchamida (54x86 mm) alohida
   * oynada ochiladi va darhol chop etish oynasi chiqadi.
   */
  const printBadge = () => {
    if (!qrCodeUrl) return;

    const win = window.open('', '_blank', 'width=420,height=640');
    if (!win) {
      alert(t("profile.popup_blocked"));
      return;
    }

    const safe = (value: string) => (value || '').replace(/[<>&"]/g, '');

    win.document.write(`
<!doctype html>
<html lang="${i18n.language}">
<head>
<meta charset="utf-8">
<title>${safe(user?.name || user?.username || '')}</title>
<style>
  @page { size: 54mm 86mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
  .badge {
    width: 54mm; height: 86mm; padding: 4mm;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    text-align: center; border: 1px solid #ddd;
  }
  .company { font-size: 9pt; font-weight: 700; letter-spacing: .5px; color: #dc7b33; text-transform: uppercase; }
  .qr { width: 36mm; height: 36mm; }
  .name { font-size: 12pt; font-weight: 700; line-height: 1.2; word-break: break-word; }
  .username { font-size: 8pt; color: #666; font-family: monospace; margin-top: 1mm; }
  .hint { font-size: 6.5pt; color: #999; }
  @media print { .badge { border: none; } }
</style>
</head>
<body>
  <div class="badge">
    <div class="company">GULBAHOR</div>
    <img class="qr" src="${qrCodeUrl}" alt="QR">
    <div>
      <div class="name">${safe(user?.name || user?.username || '')}</div>
      <div class="username">@${safe(user?.username || '')}</div>
    </div>
    <div class="hint">${safe(t("profile.badge_hint"))}</div>
  </div>
  <script>
    // Rasm to'liq yuklangach chop etamiz - aks holda bo'sh varaq chiqadi
    const img = document.querySelector('img');
    const go = () => { window.focus(); window.print(); };
    if (img.complete) go(); else img.onload = go;
    window.onafterprint = () => window.close();
  <\/script>
</body>
</html>`);
    win.document.close();
  };

  /* ---------------------------------- FaceID --------------------------------- */

  const startCamera = async () => {
    if (!isModelsLoaded) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // <video> elementi isCameraActive=true bo'lgandan keyingina render bo'ladi,
      // shuning uchun oqimni refga saqlab, elementga quyida (useEffect da) ulaymiz
      streamRef.current = stream;
      setIsCameraActive(true);
      setFaceStatus({ ok: true, text: t("profile.face_camera_on") });
    } catch {
      setFaceStatus({ ok: false, text: t("profile.face_camera_denied") });
    }
  };

  // Video elementi paydo bo'lgach oqimni unga ulaymiz
  useEffect(() => {
    if (!isCameraActive) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [isCameraActive]);

  const stopCamera = () => {
    // Oqimni refdan to'xtatamiz - video elementi allaqachon yo'qolgan bo'lsa ham ishlaydi
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
  };

  const scanFaceAndRegister = async () => {
    if (!videoRef.current) return;

    setFaceStatus({ ok: true, text: t("profile.face_searching") });
    const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      setFaceStatus({ ok: false, text: t("profile.face_not_found") });
      return;
    }

    setFaceStatus({ ok: true, text: t("profile.face_saving") });
    const descriptorArray = Array.from(detection.descriptor);

    try {
      const res = await fetch('/api/auth/faceid/register', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ faceData: JSON.stringify(descriptorArray) })
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));

      setFaceStatus({ ok: true, text: t("profile.face_saved") });
      stopCamera();
      // Serverda faceIdEnabled yoqildi - holat belgisi yangilansin
      await refreshUser().catch(() => {});
    } catch (e: any) {
      setFaceStatus({ ok: false, text: e.message });
    }
  };

  /* ------------------------------ Shaxsiy ma'lumot ----------------------------- */

  const startEditInfo = () => {
    setEditName(user?.name || "");
    setEditPhone(user?.phone || "");
    setInfoStatus(null);
    setIsEditingInfo(true);
  };

  const handleSaveInfo = async () => {
    if (!editName.trim()) {
      setInfoStatus({ ok: false, text: t("profile.name_required") });
      return;
    }
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() })
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));
      await refreshUser();
      setIsEditingInfo(false);
      setInfoStatus({ ok: true, text: t("common.saved") });
      setTimeout(() => setInfoStatus(null), 2500);
    } catch (e: any) {
      setInfoStatus({ ok: false, text: e.message });
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ ok: false, text: t("profile.passwords_mismatch") });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ ok: false, text: t("profile.password_too_short") });
      return;
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ currentPassword, password: newPassword })
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.error")));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordStatus({ ok: true, text: t("profile.password_changed") });
      setTimeout(() => setPasswordStatus(null), 2500);
    } catch (e: any) {
      setPasswordStatus({ ok: false, text: e.message });
    }
  };

  if (!user) return null;

  /* ------------------------------ Avtobloklash PIN ----------------------------- */

  /** Avtobloklash sozlamasini saqlaydi */
  const handleSaveLockPin = async () => {
    setLockStatus(null);

    const minutes = Number(lockMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      setLockStatus({ ok: false, text: t("profile.pin_minutes_invalid") });
      return;
    }
    if (!/^\d{4}$/.test(lockPin)) {
      setLockStatus({ ok: false, text: t("profile.pin_invalid") });
      return;
    }
    if (lockPin !== lockPinConfirm) {
      setLockStatus({ ok: false, text: t("profile.pin_mismatch") });
      return;
    }

    try {
      const res = await fetch('/api/auth/lock-pin', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ pin: lockPin, autoLockMinutes: minutes }),
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.save_error")));

      setLockPin("");
      setLockPinConfirm("");
      setLockStatus({ ok: true, text: t("profile.pin_saved", { minutes }) });
      await refreshUser();
    } catch (err: any) {
      setLockStatus({ ok: false, text: err.message });
    }
  };

  /** Avtobloklashni o'chiradi */
  const handleClearLockPin = async () => {
    if (!window.confirm(t("profile.pin_disable_confirm"))) return;
    setLockStatus(null);

    try {
      const res = await fetch('/api/auth/lock-pin', { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.error")));

      setLockPin("");
      setLockPinConfirm("");
      setLockStatus({ ok: true, text: t("profile.pin_disabled") });
      await refreshUser();
    } catch (err: any) {
      setLockStatus({ ok: false, text: err.message });
    }
  };

  /* ---------------------------------- Google --------------------------------- */

  const linkGoogle = async (credential?: string) => {
    try {
      const res = await fetch('/api/auth/google/link', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ token: credential })
      });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("profile.google_link_error")));
      setGoogleStatus({ ok: true, text: t("profile.google_linked_now") });
      await refreshUser();
    } catch (err: any) {
      setGoogleStatus({ ok: false, text: err.message });
    }
  };

  const unlinkGoogle = async () => {
    try {
      const res = await fetch('/api/auth/google/unlink', { method: 'POST', headers: authHeaders });
      if (!res.ok) throw new Error(errorMessage(await readJson(res), t("common.error")));
      setGoogleStatus(null);
      await refreshUser();
    } catch (err: any) {
      setGoogleStatus({ ok: false, text: err.message });
    }
  };

  return (
    <>
      <PageMeta title={`${t("profile.title")} | Gulbahor`} description={t("profile.title")} />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 md:p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("profile.title")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Shaxsiy ma'lumotlar, parol, PIN */}
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t("profile.personal_info")}</h3>
                  {!isEditingInfo ? (
                    <Button variant="outline" size="sm" onClick={startEditInfo} className="flex items-center gap-2 h-8 text-xs">
                      <Edit2 className="w-3.5 h-3.5" /> {t("common.edit")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setIsEditingInfo(false); setInfoStatus(null); }} className="flex items-center gap-1 h-8 text-xs">
                        <X className="w-3.5 h-3.5" /> {t("common.cancel")}
                      </Button>
                      <Button size="sm" onClick={handleSaveInfo} className="flex items-center gap-2 h-8 text-xs">
                        <Check className="w-3.5 h-3.5" /> {t("common.save")}
                      </Button>
                    </div>
                  )}
                </div>

                <StatusLine status={infoStatus} />

                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t("profile.full_name")}</label>
                  {isEditingInfo ? (
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className={`mt-1 ${inputClass}`} />
                  ) : (
                    <div className="text-gray-900 dark:text-white font-medium text-lg mt-1">{user.name}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t("profile.phone")}</label>
                  {isEditingInfo ? (
                    <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="+998 90 123 45 67" autoComplete="off" />
                  ) : (
                    <div className="text-gray-900 dark:text-white mt-1">{user.phone || t("profile.not_set")}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t("profile.username_email")}</label>
                  <div className="text-gray-900 dark:text-white mt-1">{user.username} {user.email && `(${user.email})`}</div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{t("profile.roles")}</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {user.roles?.map((r: any) => (
                      <span key={r.id || r.name} className="px-3 py-1 bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400 text-xs font-semibold rounded-full flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-200 dark:border-gray-700 my-6" />

                {/* Interfeys tili */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                    <Languages className="w-5 h-5 text-gray-400" />
                    {t("profile.language")}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">{t("profile.language_hint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => {
                      const selected = i18n.language === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => changeLanguage(lang.code)}
                          aria-pressed={selected}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                            selected
                              ? "border-brand-500 bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"
                              : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-white/5"
                          }`}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                          {lang.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-gray-200 dark:border-gray-700 my-6" />

                {/* Parolni o'zgartirish */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <Key className="w-5 h-5 text-gray-400" />
                    {t("profile.change_password")}
                  </h3>

                  <div className="space-y-3">
                    <input type="password" placeholder={t("profile.current_password")} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} autoComplete="current-password" />
                    <input type="password" placeholder={t("profile.new_password")} value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} autoComplete="new-password" />
                    <input type="password" placeholder={t("profile.confirm_password")} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} autoComplete="new-password" />

                    <StatusLine status={passwordStatus} />

                    <Button variant="outline" size="sm" onClick={handleChangePassword} className="w-full" disabled={!currentPassword || !newPassword || !confirmPassword}>
                      {t("profile.update_password")}
                    </Button>
                  </div>
                </div>

                <hr className="border-gray-200 dark:border-gray-700 my-6" />

                {/* Avtobloklash PIN kod */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-1 flex flex-wrap items-center gap-2">
                    <Lock className="w-5 h-5 text-gray-400" />
                    {t("profile.pin_title")}
                    <StatusBadge active={!!user?.lockPinEnabled} activeText={t("profile.enabled")} idleText={t("profile.disabled")} />
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {t("profile.pin_desc")}
                    {user?.lockPinEnabled && user?.autoLockMinutes
                      ? ` ${t("profile.pin_current", { minutes: user.autoLockMinutes })}`
                      : ""}
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                        {t("profile.pin_minutes_label")}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={lockMinutes}
                          onChange={(e) => { setLockMinutes(e.target.value); setLockStatus(null); }}
                          className="w-24 p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-gray-800 dark:text-white focus:ring-brand-500 focus:border-brand-500 outline-none"
                        />
                        <span className="text-sm text-gray-500">{t("profile.minutes")}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{t("profile.pin_minutes_max")}</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                        {t("profile.pin_label")}
                      </label>
                      <PinInput
                        masked
                        value={lockPin}
                        onChange={(next) => { setLockPin(next); setLockStatus(null); }}
                        invalid={lockStatus?.ok === false}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                        {t("profile.pin_confirm_label")}
                      </label>
                      <PinInput
                        masked
                        value={lockPinConfirm}
                        onChange={(next) => { setLockPinConfirm(next); setLockStatus(null); }}
                        invalid={lockStatus?.ok === false}
                      />
                    </div>

                    <StatusLine status={lockStatus} />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSaveLockPin}
                        disabled={lockPin.length !== 4 || lockPinConfirm.length !== 4}
                      >
                        {user?.lockPinEnabled ? t("profile.pin_update") : t("profile.pin_enable")}
                      </Button>
                      {user?.lockPinEnabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleClearLockPin}
                          className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        >
                          {t("profile.pin_disable")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Kirish usullari */}
              <div className="space-y-6 border-t border-gray-200 pt-6 dark:border-gray-700 md:border-l md:border-t-0 md:pl-8 md:pt-0">

                {/* QR beydjik */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-2 flex flex-wrap items-center gap-2">
                    <QrCode className="w-5 h-5 text-brand-500" />
                    {t("profile.qr_title")}
                    <StatusBadge active={!!user?.qrEnabled} activeText={t("profile.qr_created")} idleText={t("profile.qr_not_created")} />
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">{t("profile.qr_desc")}</p>

                  {!qrCodeUrl ? (
                    <Button onClick={generateQr} variant="outline" className="text-sm">
                      {user?.qrEnabled ? t("profile.qr_regenerate") : t("profile.qr_generate")}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-4">
                      <img src={qrCodeUrl} alt="QR" className="w-32 h-32 border border-gray-200 rounded-lg p-2 bg-white" />
                      <div className="flex flex-col gap-2">
                        <Button onClick={printBadge} className="flex items-center gap-2 text-sm">
                          <Printer className="w-4 h-4" />
                          {t("profile.print")}
                        </Button>
                        <Button onClick={downloadQr} variant="outline" className="flex items-center gap-2 text-sm">
                          <Download className="w-4 h-4" />
                          {t("profile.download")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* FaceID */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-2 flex flex-wrap items-center gap-2">
                    <Camera className="w-5 h-5 text-brand-500" />
                    {t("profile.face_title")}
                    <StatusBadge active={!!user?.faceIdEnabled} activeText={t("profile.face_added")} idleText={t("profile.face_not_added")} />
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    {user?.faceIdEnabled ? t("profile.face_desc_on") : t("profile.face_desc_off")}
                  </p>

                  {isCameraActive ? (
                    <div className="space-y-3">
                      <div className="relative w-64 h-64 max-w-full rounded-full overflow-hidden border-4 border-brand-500 mx-auto">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                      </div>
                      <div className="text-center"><StatusLine status={faceStatus} /></div>
                      <div className="flex justify-center gap-3">
                        <Button variant="outline" onClick={stopCamera}>{t("common.close")}</Button>
                        <Button onClick={scanFaceAndRegister}>{t("profile.face_scan_save")}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <StatusLine status={faceStatus} />
                      <Button onClick={startCamera} variant="outline" className="text-sm" disabled={!isModelsLoaded}>
                        {!isModelsLoaded ? t("profile.face_models_loading") : t("profile.face_camera_start")}
                      </Button>
                    </div>
                  )}
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Google akkaunt */}
                <div>
                  <h3 className="text-md font-bold text-gray-900 dark:text-white mb-2 flex flex-wrap items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
                    </svg>
                    {t("profile.google_title")}
                    <StatusBadge active={!!user?.googleLinked} activeText={t("profile.google_linked")} idleText={t("profile.google_not_linked")} />
                  </h3>

                  {user?.googleLinked ? (
                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-4">
                      <p className="text-xs text-green-700 dark:text-green-400 mb-3">{t("profile.google_linked_desc")}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
                        onClick={unlinkGoogle}
                      >
                        {t("profile.google_unlink")}
                      </Button>
                    </div>
                  ) : GOOGLE_CLIENT_ID ? (
                    <>
                      <p className="text-sm text-gray-500 mb-4">{t("profile.google_desc")}</p>
                      <div className="w-full sm:w-auto overflow-hidden">
                        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                          <GoogleLogin
                            onSuccess={(credentialResponse) => linkGoogle(credentialResponse.credential)}
                            onError={() => setGoogleStatus({ ok: false, text: t("profile.google_link_error") })}
                            useOneTap={false}
                            shape="rectangular"
                            size="large"
                            theme="outline"
                            text="continue_with"
                          />
                        </GoogleOAuthProvider>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">{t("profile.google_not_configured")}</p>
                  )}
                  <div className="mt-3"><StatusLine status={googleStatus} /></div>
                </div>

              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}

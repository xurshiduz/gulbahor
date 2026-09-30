import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Button from "../ui/button/Button";
import { ScanFace } from "lucide-react";
import { useAuth, IDLE_LOGOUT_KEY } from "../../context/AuthContext";
import * as faceapi from "face-api.js";
import { Html5Qrcode } from "html5-qrcode";
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { errorMessage, readJson } from "../../utils/api";

type Tab = "login" | "google" | "face" | "qr";

// Google orqali kirish faqat .env da VITE_GOOGLE_CLIENT_ID berilganda ko'rinadi
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

export default function SignInForm() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("login");
  const [error, setError] = useState<string | null>(null);
  // 8 soatlik harakatsizlik sababli avtomatik chiqarilgan bo'lsa - sababini ko'rsatamiz
  const [idleNotice, setIdleNotice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Login standard
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Face ID state
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);
  const [isFaceModelsLoaded, setIsFaceModelsLoaded] = useState(false);
  const [isFaceCameraOn, setIsFaceCameraOn] = useState(false);
  const [faceStatus, setFaceStatus] = useState("");
  const [faceIdentifier, setFaceIdentifier] = useState("");

  // QR Code State
  const qrRegionId = "qr-reader-signin";
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  // Til almashsa eski tildagi xabar osilib qolmasin
  useEffect(() => {
    setError(null);
  }, [i18n.language]);

  // Stop camera on unmount or tab change
  useEffect(() => {
    stopFaceCamera();
    stopQrScanner();
    setError(null);
    if (activeTab === "face") loadFaceModels();
    if (activeTab === "qr") startQrScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (sessionStorage.getItem(IDLE_LOGOUT_KEY)) {
      setIdleNotice(true);
      sessionStorage.removeItem(IDLE_LOGOUT_KEY);
    }
    return () => {
      stopFaceCamera();
      stopQrScanner();
    };
  }, []);

  /** Kirish so'rovi: muvaffaqiyatli bo'lsa seans ochiladi, aks holda tarjima qilingan xato */
  const signIn = async (path: string, body: unknown, fallbackKey: string) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await readJson(res);
    if (!res.ok || !data?.accessToken) {
      if (data?.code === 'OUTSIDE_NETWORK') throw new Error(t("auth.outside_network"));
      if (res.status === 401) throw new Error(t(fallbackKey));
      throw new Error(errorMessage(data, t("common.error")));
    }
    login(data.accessToken, data.user);
    navigate("/");
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      setError(t("auth.fill_all"));
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      await signIn('/api/auth/login', { username: identifier, password }, "auth.invalid_credentials");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      setIsLoading(true);
      setError(null);
      await signIn('/api/auth/google', { token: credentialResponse.credential }, "auth.google_not_linked");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Face ID Logic ---
  const loadFaceModels = async () => {
    if (isFaceModelsLoaded) {
      setFaceStatus(t("auth.face_enter_username"));
      return;
    }
    try {
      setFaceStatus(t("auth.face_models_loading"));
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models')
      ]);
      setIsFaceModelsLoaded(true);
      setFaceStatus(t("auth.face_enter_username"));
    } catch {
      setFaceStatus(t("auth.face_models_error"));
    }
  };

  const startFaceCamera = async () => {
    if (!faceIdentifier) {
      setError(t("auth.face_username_first"));
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      faceStreamRef.current = stream;
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        faceVideoRef.current.play().catch(() => {});
      }
      setIsFaceCameraOn(true);
      setFaceStatus(t("auth.face_look"));
    } catch {
      setFaceStatus(t("auth.camera_denied"));
    }
  };

  const stopFaceCamera = () => {
    // Oqimni refdan to'xtatamiz: tab almashganda video elementi yo'qolib
    // ketadi va uning orqali kamerani o'chirib bo'lmay qolardi
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    if (faceVideoRef.current) faceVideoRef.current.srcObject = null;
    setIsFaceCameraOn(false);
  };

  const scanFaceForLogin = async () => {
    if (!faceVideoRef.current) return;
    setError(null);
    setFaceStatus(t("auth.face_searching"));
    const detection = await faceapi.detectSingleFace(faceVideoRef.current).withFaceLandmarks().withFaceDescriptor();
    if (!detection) {
      setFaceStatus(t("auth.face_not_found"));
      return;
    }
    setFaceStatus(t("auth.face_verifying"));
    const descriptorArray = Array.from(detection.descriptor);

    try {
      setIsLoading(true);
      await signIn(
        '/api/auth/faceid',
        { username: faceIdentifier, faceData: JSON.stringify(descriptorArray) },
        "auth.face_no_match",
      );
      stopFaceCamera();
    } catch (err: any) {
      setError(err.message);
      setFaceStatus(t("auth.try_again"));
    } finally {
      setIsLoading(false);
    }
  };

  // --- QR Logic ---
  const startQrScanner = () => {
    // Element render bo'lishini kutamiz
    setTimeout(async () => {
      if (!document.getElementById(qrRegionId)) return;
      try {
        const html5QrCode = new Html5Qrcode(qrRegionId);
        html5QrCodeRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onQrScanSuccess,
          () => { /* kadrda QR yo'q - e'tiborsiz */ }
        );
      } catch {
        setError(t("auth.camera_denied"));
      }
    }, 100);
  };

  const stopQrScanner = async () => {
    const scanner = html5QrCodeRef.current;
    html5QrCodeRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // skaner hali ishga tushmagan bo'lishi mumkin
    }
  };

  /** Beydjikdagi QR ichida {"userId": "...", "token": "..."} yozilgan (Profil -> QR Beydjik) */
  const onQrScanSuccess = async (decodedText: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await stopQrScanner();

      let qrData: { userId?: unknown; token?: unknown };
      try {
        qrData = JSON.parse(decodedText);
      } catch {
        throw new Error(t("auth.qr_invalid"));
      }
      if (typeof qrData?.userId !== "string" || typeof qrData?.token !== "string") {
        throw new Error(t("auth.qr_invalid"));
      }

      await signIn('/api/auth/qr/verify', { userId: qrData.userId, token: qrData.token }, "auth.qr_invalid");
    } catch (err: any) {
      setError(err.message || t("auth.qr_invalid"));
      setIsLoading(false);
      // Xato bo'lsa skaner qayta ishga tushadi
      startQrScanner();
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "login", label: t("auth.tab_password") },
    ...(GOOGLE_CLIENT_ID ? [{ id: "google" as Tab, label: "Google" }] : []),
    { id: "face", label: "FaceID" },
    { id: "qr", label: t("auth.tab_qr") },
  ];

  return (
    <div className="flex flex-col flex-1">
      {/*
        Telefonda forma yuqoridan boshlanadi: markazga tortilsa login va parol
        maydonlari ekran ostiga tushib, sahifani siljitishga to'g'ri kelardi.
        Katta ekranda joy yetarli - o'sha yerda markazda qoladi.
      */}
      <div className="flex flex-col justify-start flex-1 w-full max-w-md mx-auto pt-6 lg:justify-center lg:pt-0">
        <div>
          <div className="mb-5 sm:mb-8 text-center">
            {/* Katta ekranda logotip o'ng panelda turadi, telefonda esa shu yerda */}
            <img src="/images/logo/logo.svg" alt="Gulbahor" className="mx-auto mb-5 h-10 w-auto lg:hidden dark:hidden" />
            <img src="/images/logo/logo-dark.svg" alt="Gulbahor" className="mx-auto mb-5 hidden h-10 w-auto dark:block lg:!hidden" />
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.welcome")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("auth.sign_in_to_account")}
            </p>
          </div>

          {/* Custom Modern Tabs */}
          <div className="mb-6">
            <div className="flex flex-wrap bg-gray-100/80 p-1.5 rounded-xl dark:bg-gray-800/80 gap-1 backdrop-blur-sm shadow-inner">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 px-1 text-xs sm:text-sm font-medium rounded-lg transition-all duration-300 ${
                    activeTab === tab.id
                      ? "bg-white shadow-md text-brand-600 dark:bg-gray-700 dark:text-brand-400 scale-[1.02]"
                      : "text-gray-500 hover:text-gray-700 hover:bg-white/50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 sm:p-8 shadow-theme-xl border border-gray-100 dark:border-gray-800">
            {idleNotice && !error && (
              <div className="mb-6 p-3 text-sm text-amber-600 bg-amber-50 rounded-xl dark:bg-amber-500/10 dark:text-amber-400 border border-amber-100 dark:border-amber-500/20 text-center">
                {t("auth.idle_notice")}
              </div>
            )}

            {error && (
              <div className="mb-6 p-3 text-sm text-red-600 bg-red-50 rounded-xl dark:bg-red-500/10 dark:text-red-400 border border-red-100 dark:border-red-500/20 text-center">
                {error}
              </div>
            )}

            {activeTab === "login" && (
              <form onSubmit={handleStandardLogin}>
                <div className="space-y-5">
                  <div>
                    <Label>{t("auth.username_or_email")} <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="admin"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      // Telefon klaviaturasi birinchi harfni katta qilmasin
                      autoCapitalize="none"
                      autoComplete="username"
                    />
                  </div>
                  <div>
                    <Label>{t("auth.password")} <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="********"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <span
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                      >
                        {showPassword ? (
                          <EyeIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                        ) : (
                          <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400 size-5" />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Button className="w-full h-11 text-base font-semibold shadow-brand-sm" disabled={isLoading}>
                      {isLoading ? t("common.loading") : t("auth.login")}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {activeTab === "google" && GOOGLE_CLIENT_ID && (
              <div className="flex flex-col items-center justify-center py-6 space-y-4">
                <p className="text-sm text-gray-500 text-center mb-2">{t("auth.google_hint")}</p>
                <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError(t("auth.google_error"))}
                    useOneTap
                  />
                </GoogleOAuthProvider>
              </div>
            )}

            {activeTab === "face" && (
              <div className="flex flex-col items-center space-y-5 py-2">
                <div className="w-full">
                  <Input
                    placeholder={t("auth.face_username_placeholder")}
                    value={faceIdentifier}
                    onChange={(e) => setFaceIdentifier(e.target.value)}
                    autoCapitalize="none"
                    autoComplete="username"
                  />
                </div>

                <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-brand-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center shadow-inner">
                  <video ref={faceVideoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover"></video>
                  {!isFaceCameraOn && <ScanFace className="w-16 h-16 text-gray-300 dark:text-gray-600" />}
                </div>

                <p className="text-sm font-medium text-brand-600 dark:text-brand-400 text-center min-h-[20px]">{faceStatus}</p>

                <div className="flex w-full gap-3 pt-2">
                  <Button variant="outline" onClick={startFaceCamera} disabled={!isFaceModelsLoaded || !faceIdentifier} className="flex-1">
                    {t("auth.face_turn_on")}
                  </Button>
                  <Button onClick={scanFaceForLogin} disabled={!isFaceCameraOn || isLoading} className="flex-1 shadow-brand-sm">
                    {isLoading ? "..." : t("auth.face_scan")}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "qr" && (
              <div className="flex flex-col items-center space-y-4 py-2">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-2">
                  {t("auth.qr_hint")}
                </p>
                <div id={qrRegionId} className="w-full max-w-sm rounded-xl overflow-hidden border-2 border-brand-100 dark:border-gray-800 bg-black shadow-inner"></div>
                {isLoading && <p className="text-sm text-brand-500 font-medium">{t("lock.checking")}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

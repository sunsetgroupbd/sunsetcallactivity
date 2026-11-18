"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Download, Share, PlusSquare, X, CheckCircle, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface PwaContextType {
  isInstalled: boolean;
  canInstall: boolean;
  isIos: boolean;
  installApp: () => Promise<void>;
  showIosGuide: boolean;
  setShowIosGuide: (val: boolean) => void;
}

const PwaContext = createContext<PwaContextType>({
  isInstalled: false,
  canInstall: false,
  isIos: false,
  installApp: async () => {},
  showIosGuide: false,
  setShowIosGuide: () => {},
});

export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isLoginPage, setIsLoginPage] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [canInstall, setCanInstall] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Detect login page without blocking prerender hooks
    const checkLogin = () => {
      if (typeof window !== "undefined") {
        setIsLoginPage(window.location.pathname === "/login");
      }
    };
    checkLogin();
    window.addEventListener("popstate", checkLogin);
    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("PWA: Service Worker registered successfully (Scope:", reg.scope, ")");
          })
          .catch((err) => {
            console.warn("PWA: Service Worker registration failed:", err);
          });
      });
    }

    // 2. Check if already running in standalone mode (installed app)
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes("android-app://");

      setIsInstalled(isStandaloneMode);
      return isStandaloneMode;
    };

    const standalone = checkStandalone();

    // 3. Detect iOS Safari and Desktop / PC mode
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleIos =
      /iphone|ipad|ipod/.test(userAgent) &&
      !(window as any).MSStream;
    setIsIos(isAppleIos);

    const isMobileDevice = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );
    setIsDesktop(!isMobileDevice);

    if (isAppleIos && !standalone) {
      // iOS doesn't fire beforeinstallprompt, but users can add to home screen
      setCanInstall(true);
    }

    // 4. Capture native beforeinstallprompt (Android Chrome, Desktop Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Detect app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
      setBannerDismissed(true);
      try {
        localStorage.setItem("sunset_pwa_dismissed", "true");
      } catch {
        // ignore
      }
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    // Check localStorage if banner was dismissed
    try {
      const dismissed = localStorage.getItem("sunset_pwa_dismissed");
      if (dismissed === "true") setBannerDismissed(true);
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener("popstate", checkLogin);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (!deferredPrompt) {
      setShowIosGuide(true);
      return;
    }

    try {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
        setCanInstall(false);
        setBannerDismissed(true);
        try {
          localStorage.setItem("sunset_pwa_dismissed", "true");
        } catch {
          // ignore
        }
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error("Installation prompt error:", err);
    }
  };

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    try {
      localStorage.setItem("sunset_pwa_dismissed", "true");
    } catch {
      // ignore
    }
  };

  return (
    <PwaContext.Provider
      value={{
        isInstalled,
        canInstall,
        isIos,
        installApp,
        showIosGuide,
        setShowIosGuide,
      }}
    >
      {children}

      {/* ─── Dismissible Install Banner for Mobile Browsers (Hidden in PC Mode) ─── */}
      {!isDesktop && !isInstalled && canInstall && !bannerDismissed && (
        <div
          className={cn(
            "fixed left-2.5 right-2.5 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom duration-300 md:hidden",
            isLoginPage
              ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
              : "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
          )}
        >
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 text-white rounded-2xl p-2.5 sm:p-3 shadow-2xl flex items-center justify-between gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-1 shrink-0 shadow-md flex items-center justify-center border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/Sunset-Group-Logo.png?v=2"
                alt="Sunset App"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate leading-tight">
                <span className="sm:hidden">Sunset App</span>
                <span className="hidden sm:inline">Install Sunset App</span>
              </h4>
              <p className="text-[10.5px] sm:text-xs text-emerald-400 font-medium truncate leading-tight mt-0.5">
                Fast &amp; Fullscreen
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={installApp}
                className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl transition flex items-center gap-1 shadow-sm shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>

              <button
                type="button"
                onClick={handleDismissBanner}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition shrink-0"
                aria-label="Dismiss install banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── iOS Add to Home Screen Instructions Modal ──────────────────────── */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 sm:p-5 shadow-2xl border border-slate-200 space-y-3.5 text-slate-900 max-h-[88vh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Install Sunset on iOS</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Fast &amp; Fullscreen app</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </div>
                <div className="min-w-0">
                  Tap the <strong className="text-slate-900">Share</strong> button in Safari:
                  <div className="mt-1 flex items-center gap-1.5 text-indigo-700 font-semibold bg-white px-2 py-1 rounded-lg border border-slate-200 w-fit text-[11px]">
                    <Share className="w-3 h-3 text-indigo-600" />
                    <span>Share Icon (Safari toolbar)</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </div>
                <div className="min-w-0">
                  Scroll down and tap <strong className="text-slate-900">Add to Home Screen</strong>:
                  <div className="mt-1 flex items-center gap-1.5 text-emerald-700 font-semibold bg-white px-2 py-1 rounded-lg border border-slate-200 w-fit text-[11px]">
                    <PlusSquare className="w-3 h-3 text-emerald-600" />
                    <span>Add to Home Screen</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </div>
                <p className="min-w-0">
                  Tap <strong className="text-slate-900">Add</strong> in the top-right corner. Sunset will launch in full-screen standalone mode!
                </p>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="w-full py-2 px-3 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}


// What every screen needs: the app and licence info, who is signed in, the settings, and toasts.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { api, onLicenseBlocked } from "./api";
import type { AppInfo, Session, Settings } from "../shared/types";
import { can, type Permission } from "../shared/format";
import { cx } from "./components/ui";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface AppState {
  info: AppInfo | null;
  session: Session | null;
  settings: Settings | null;
  setSession: (s: Session | null) => void;
  refreshInfo: () => Promise<AppInfo>;
  refreshSettings: () => Promise<Settings>;
  refreshSession: () => Promise<Session | null>;
  toast: (text: string, tone?: ToastTone) => void;
  can: (p: Permission) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const refreshInfo = useCallback(async () => {
    const i = await api<AppInfo>("app.info");
    setInfo(i);
    return i;
  }, []);
  const refreshSettings = useCallback(async () => {
    const s = await api<Settings>("settings.get");
    setSettings(s);
    return s;
  }, []);
  const refreshSession = useCallback(async () => {
    const s = await api<Session | null>("auth.session");
    setSession(s);
    return s;
  }, []);
  const signOut = useCallback(async () => {
    await api("auth.logout");
    setSession(null);
  }, []);

  useEffect(() => {
    void refreshInfo();
    void refreshSettings();
    void refreshSession();
    return onLicenseBlocked(() => void refreshInfo());
  }, [refreshInfo, refreshSettings, refreshSession]);

  const value: AppState = {
    info,
    session,
    settings,
    setSession,
    refreshInfo,
    refreshSettings,
    refreshSession,
    toast,
    can: (p) => can(session?.staff.role, p),
    signOut,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[360px] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "animate-toast pointer-events-auto flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg",
              t.tone === "success" && "border-emerald-200 bg-white text-slate-800",
              t.tone === "error" && "border-red-200 bg-red-50 text-red-800",
              t.tone === "info" && "border-brand-200 bg-white text-slate-800"
            )}
          >
            {t.tone === "success" ? <CheckCircle2 className="mt-px size-4 shrink-0 text-emerald-600" /> : t.tone === "error" ? <AlertTriangle className="mt-px size-4 shrink-0 text-red-600" /> : <Info className="mt-px size-4 shrink-0 text-brand-600" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

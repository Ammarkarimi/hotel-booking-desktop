// Sign-in: tap your name, type your password.
import { useEffect, useState } from "react";
import { LogIn, ArrowLeft } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Input, cx } from "../components/ui";
import { Logo } from "../components/Logo";
import { initials, label } from "../../shared/format";
import type { Role, Session } from "../../shared/types";

export function Login() {
  const { setSession, settings, info } = useApp();
  const [users, setUsers] = useState<Array<{ name: string; username: string; role: Role }>>([]);
  const [user, setUser] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<typeof users>("auth.users").then((u) => {
      setUsers(u);
      if (u.length === 1) setUser(u[0].username);
    });
  }, []);

  const login = async () => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const s = await api<Session>("auth.login", { username: user, password });
      setSession(s);
    } catch (e) {
      setError(errorText(e));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };
  const chosen = users.find((u) => u.username === user);

  return (
    <div className="flex h-full">
      <div className="hidden w-[42%] flex-col justify-between bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <span className="text-[17px] font-semibold">Innvela Hotel Desk</span>
        </div>
        <div>
          <p className="text-[30px] leading-tight font-semibold">{settings?.hotelName}</p>
          {settings?.tagline && <p className="mt-1 text-brand-100">{settings.tagline}</p>}
          <p className="mt-6 max-w-sm text-[14px] text-brand-100">Bookings, check-in and check-out, GST bills, payments, housekeeping and reports — all on this computer, even without internet.</p>
        </div>
        <p className="text-[12px] text-brand-200">Version {info?.version}</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          {!chosen ? (
            <>
              <h1 className="text-[22px] font-semibold">Who is signing in?</h1>
              <p className="mb-5 text-[13.5px] text-slate-500">Tap your name.</p>
              <div className="grid grid-cols-2 gap-3">
                {users.map((u) => (
                  <button key={u.username} onClick={() => setUser(u.username)} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[14px] font-semibold text-white">{initials(u.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{u.name}</span>
                      <span className="block text-[12px] text-slate-500">{label(u.role)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              {users.length > 1 && (
                <button type="button" onClick={() => (setUser(null), setError(""), setPassword(""))} className="mb-4 flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
                  <ArrowLeft className="size-4" /> Not {chosen.name}?
                </button>
              )}
              <div className="mb-5 flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-600 text-[16px] font-semibold text-white">{initials(chosen.name)}</span>
                <div>
                  <h1 className="text-[20px] font-semibold">Hello, {chosen.name.split(" ")[0]}</h1>
                  <p className="text-[13px] text-slate-500">{label(chosen.role)}</p>
                </div>
              </div>
              <label className="mb-1 block text-[13px] font-medium text-slate-700">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus className={cx("h-11 text-[15px]", error && "border-red-400")} />
              <div className="mt-3">
                <ErrorNote>{error}</ErrorNote>
              </div>
              <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy} icon={<LogIn className="size-4" />}>
                Sign in
              </Button>
              <p className="mt-4 text-[12px] text-slate-500">Forgot your password? The owner can set a new one in Staff & sign-ins.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

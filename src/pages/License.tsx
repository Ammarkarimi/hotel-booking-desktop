// Activating a licence: the computer's code to send to the provider, and where to paste the key.
import { useState } from "react";
import { Copy, FileUp, HardDriveDownload, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, bridge, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Note, Textarea, cx } from "../components/ui";
import { Logo } from "../components/Logo";
import { formatDate } from "../../shared/dates";
import { label } from "../../shared/format";
import type { LicenseInfo } from "../../shared/types";

export function LicensePanel({ onActivated, compact }: { onActivated?: (info: LicenseInfo) => void; compact?: boolean }) {
  const { info, refreshInfo, toast } = useApp();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lic = info?.license;
  if (!lic) return null;

  const activate = async (k = key) => {
    setBusy(true);
    setError("");
    try {
      const res = await api<LicenseInfo>("license.activate", { key: k });
      await refreshInfo();
      toast(`Licence activated until ${formatDate(res.expiresOn)}`);
      setKey("");
      onActivated?.(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const fromFile = async () => {
    const file = await bridge().pickFile("lic");
    if (!file) return;
    const text = await bridge().readTextFile(file);
    if (text) {
      setKey(text.trim());
      void activate(text.trim());
    }
  };

  return (
    <div className="space-y-4">
      <div className={cx("rounded-lg border p-4", lic.state === "active" ? "border-emerald-200 bg-emerald-50" : lic.canUse ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50")}>
        <div className="flex items-start gap-3">
          {lic.state === "active" ? <ShieldCheck className="size-6 text-emerald-600" /> : <ShieldAlert className={cx("size-6", lic.canUse ? "text-amber-600" : "text-red-600")} />}
          <div className="text-[13.5px]">
            <p className="font-semibold text-slate-900">
              {lic.state === "active" && `Licensed to ${lic.licensedTo} · ${label(lic.plan)} plan`}
              {lic.state === "trial" && `Free trial · ${lic.daysLeft} day${lic.daysLeft === 1 ? "" : "s"} left`}
              {lic.state === "grace" && "Licence ended — please renew"}
              {lic.state === "expired" && (lic.plan === "trial" ? "The free trial is over" : "Licence ended")}
              {lic.state === "invalid" && "Please check the computer's date"}
            </p>
            {lic.expiresOn && <p className="text-slate-700">{lic.state === "trial" ? "Trial ends" : "Valid until"} {formatDate(lic.expiresOn)}</p>}
            {lic.message && <p className="mt-1 text-slate-700">{lic.message}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-[13px] font-medium text-slate-700">This computer's code</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="rounded-md bg-slate-100 px-3 py-1.5 font-mono text-[17px] font-semibold tracking-wider text-slate-900">{lic.machineCode}</code>
          <Button
            size="sm"
            icon={<Copy className="size-3.5" />}
            onClick={() => {
              void navigator.clipboard.writeText(lic.machineCode);
              toast("Code copied");
            }}
          >
            Copy
          </Button>
        </div>
        <p className="mt-1.5 text-[12.5px] text-slate-500">Send this code to us when you pay for a month or a year. We send back a licence key for this computer.</p>
      </div>

      <div className="space-y-2">
        <Field label="Licence key">
          <Textarea value={key} onChange={(e) => setKey(e.target.value)} rows={compact ? 3 : 4} placeholder="INNV1.eyJ2Ijox…" className="font-mono text-[12px]" />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <Button variant="primary" loading={busy} disabled={!key.trim()} onClick={() => activate()} icon={<ShieldCheck className="size-4" />}>
            Activate licence
          </Button>
          <Button onClick={fromFile} icon={<FileUp className="size-4" />}>
            Open licence file…
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Shown instead of the app when the trial or licence has ended. Data stays safe and can be backed up. */
export function LicenseGate() {
  const { toast } = useApp();
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-gradient-to-br from-brand-900 to-brand-700 p-8">
      <div className="mt-[4vh] w-full max-w-xl rounded-xl bg-white p-7 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-[19px] font-semibold">Innvela Hotel Desk</h1>
            <p className="text-[13px] text-slate-500">Please renew your licence to continue</p>
          </div>
        </div>
        <LicensePanel />
        <Note tone="slate" className="mt-5" icon={<HardDriveDownload />}>
          All your bookings, guests and bills are safe on this computer. You can still save a backup copy:{" "}
          <button
            className="font-medium text-brand-700 underline"
            onClick={async () => {
              try {
                const f = await bridge().saveBackupAs();
                if (f) toast("Backup saved");
              } catch (e) {
                toast(errorText(e), "error");
              }
            }}
          >
            Save a backup…
          </button>
        </Note>
      </div>
    </div>
  );
}

// Front-desk staff start a shift after signing in, and read the last handover note.
import { useEffect, useState } from "react";
import { Clock, LogOut, MessageSquareQuote, Play } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Note, Textarea } from "../components/ui";
import { formatDateTime, formatTime } from "../../shared/dates";
import type { Session, Shift } from "../../shared/types";

export function ShiftStart() {
  const { session, setSession, signOut } = useApp();
  const [status, setStatus] = useState<{ lastHandover: Shift | null; othersOnShift: Array<{ staffName: string; startedAt: string }> } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<typeof status>("shift.status").then(setStatus);
  }, []);
  const start = async () => {
    setBusy(true);
    try {
      setSession(await api<Session>("shift.start", { note }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const h = status?.lastHandover;
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-8">
      <div className="mt-[6vh] w-full max-w-lg rounded-xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
            <Clock className="size-6" />
          </div>
          <div>
            <h1 className="text-[19px] font-semibold">Start your shift, {session?.staff.name.split(" ")[0]}</h1>
            <p className="text-[13px] text-slate-500">Your sign-in time is saved for attendance. Money you receive is counted in your shift.</p>
          </div>
        </div>
        {h && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900">
              <MessageSquareQuote className="size-4" /> Handover from {h.staffName} · {formatDateTime(h.endedAt)}
            </p>
            <p className="text-[13.5px] whitespace-pre-wrap text-slate-800">{h.handoverNote}</p>
          </div>
        )}
        {status && status.othersOnShift.length > 0 && (
          <Note tone="slate" className="mb-4">
            Also on shift: {status.othersOnShift.map((o) => `${o.staffName} (since ${formatTime(o.startedAt)})`).join(", ")}
          </Note>
        )}
        <Field label="Note for the start of your shift" hint="Optional, for example: “Drawer had ₹2,000 at the start”.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
        <div className="mt-5 flex justify-between">
          <Button variant="ghost" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
            Sign out
          </Button>
          <Button variant="success" size="lg" loading={busy} onClick={start} icon={<Play className="size-4" />}>
            Start shift
          </Button>
        </div>
      </div>
    </div>
  );
}

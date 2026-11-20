// End of a front-desk shift: what happened, the cash to hand over, and a note for the next person.
import { useEffect, useState } from "react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Input, Modal, Row, Textarea } from "./ui";
import { label, money } from "../../shared/format";
import { durationLabel, formatDateTime } from "../../shared/dates";
import type { Shift, ShiftSummary } from "../../shared/types";

export function EndShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setSession, toast, settings } = useApp();
  const [status, setStatus] = useState<{ shift: Shift | null; liveSummary: ShiftSummary | null } | null>(null);
  const [note, setNote] = useState("");
  const [cash, setCash] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setError("");
      void api<{ shift: Shift | null; liveSummary: ShiftSummary | null }>("shift.status").then(setStatus);
    }
  }, [open]);
  const s = status?.liveSummary;
  const cur = settings?.currency;
  const end = async () => {
    setBusy(true);
    try {
      await api("shift.end", { handoverNote: note, cashCounted: cash === "" ? null : Number(cash) });
      toast("Shift ended. Thank you!");
      setNote("");
      setCash("");
      setSession(null);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="End my shift"
      subtitle={status?.shift ? `Started ${formatDateTime(status.shift.startedAt)} · ${durationLabel(status.shift.startedAt)}` : undefined}
      footer={
        <>
          <Button onClick={onClose}>Not now</Button>
          <Button variant="primary" loading={busy} onClick={end}>
            End shift and sign out
          </Button>
        </>
      }
    >
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-x-6 rounded-md border border-slate-200 bg-slate-50 px-4 py-2">
          <Row label="Check-ins">{s.checkIns}</Row>
          <Row label="Check-outs">{s.checkOuts}</Row>
          <Row label="New bookings">{s.bookings}</Row>
          <Row label="Refunds given">{money(s.refunded, cur)}</Row>
          {Object.entries(s.byMethod).map(([m, v]) => (
            <Row key={m} label={`Received by ${label(m)}`}>{money(v, cur)}</Row>
          ))}
          <Row label="Cash to hand over" strong>{money(s.cash, cur)}</Row>
        </div>
      )}
      <div className="space-y-3">
        <Field label="Cash in the drawer (counted)" hint="Optional. Write what you actually counted, so any difference is seen.">
          <Input type="number" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={s ? String(Math.round(s.cash)) : ""} />
        </Field>
        <Field label="Handover note for the next person" required>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Room 204 wants a wake-up call at 6 am. Guest in 102 will pay the balance tomorrow…" autoFocus />
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

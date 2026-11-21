// "Fill in Pathik": what the police form still needs (and a place to add it), then Pathik opens
// in its own window with the Add Guest form filled in. Staff add the ID number and photo, press
// Submit in Pathik, and mark the stay as entered here.
import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCopy, ExternalLink, Loader2, Pencil, RefreshCw, ShieldCheck } from "lucide-react";
import { api, bridge, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Input, Loading, Modal, Note, Select, Textarea, cx } from "./ui";
import { pathikCopyRows, VEHICLE_LABELS, VEHICLE_TYPES, type PathikRecord } from "../../shared/pathik";
import { INDIAN_STATES, label } from "../../shared/format";
import { formatDateTime } from "../../shared/dates";
import type { FullBooking } from "../../shared/types";

type LiveState = "idle" | "opened" | "waiting" | "filled" | "closed" | "error";

export function PathikDialog({ open, onClose, bookingId, onChanged }: { open: boolean; onClose: () => void; bookingId: string; onChanged?: () => void }) {
  const { toast } = useApp();
  const [r, setR] = useState<PathikRecord | null>(null);
  const [live, setLive] = useState<LiveState>("idle");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState(false);

  const load = () => {
    setR(null);
    api<PathikRecord>("pathik.record", { bookingId })
      .then(setR)
      .catch((e) => toast(errorText(e), "error"));
  };
  useEffect(() => {
    if (open) {
      load();
      setLive("idle");
    }
  }, [open, bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      bridge().onPathikStatus((s) => {
        if (s.bookingId !== bookingId) return;
        setLive(s.state);
        if (s.state === "error") toast(`Pathik: ${s.message ?? "the form could not be filled"}`, "error");
      }),
    [bookingId, toast]
  );

  const openPathik = async () => {
    setBusy(true);
    try {
      await api("pathik.open", { bookingId });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const mark = async (entered: boolean) => {
    try {
      setR(await api<PathikRecord>("pathik.mark", { bookingId, entered }));
      toast(entered ? "Marked as entered in Pathik" : "Pathik mark removed");
      onChanged?.();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} width={640} title={<span className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-600" /> Fill in Pathik</span>} subtitle={r?.title ?? "Police guest register"}>
      {!r ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          {r.missing.length > 0 && (
            <Note tone="amber">
              <b>Pathik also asks for:</b> {r.missing.join(", ")}.
              <div className="mt-2">
                <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                  Add these details
                </Button>
              </div>
            </Note>
          )}
          <Note tone="slate">
            <b>Add in Pathik by hand:</b> {r.byHand.join("; ")}. This software keeps no ID numbers or copies.
          </Note>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[13px] text-emerald-900">
              Pathik opens in its own window{r.others.length ? ` and the form is filled with all ${r.others.length + 1} adults` : " and the form is filled in"}. Sign in the first time (the sign-in is remembered). Check every box — green is filled, amber is still empty — then press <b>Submit</b> in Pathik.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="success" loading={busy} icon={<ExternalLink className="size-4" />} onClick={openPathik}>
                Open Pathik and fill the form
              </Button>
              {(live === "filled" || live === "waiting") && (
                <Button icon={<RefreshCw className="size-4" />} onClick={() => void api("pathik.refill", { bookingId })}>
                  Fill again
                </Button>
              )}
              <span className="text-[12.5px] text-emerald-900">
                {live === "opened" && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3.5 animate-spin" /> Opening Pathik…
                  </span>
                )}
                {live === "waiting" && "Waiting: sign in to Pathik and open Add Guest — it fills by itself."}
                {live === "filled" && (
                  <span className="flex items-center gap-1 font-medium">
                    <CheckCircle2 className="size-4" /> Form filled. Check it and press Submit in Pathik.
                  </span>
                )}
                {live === "closed" && "Pathik window closed."}
              </span>
            </div>
          </div>

          <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-lg p-3", r.pathikAt ? "bg-emerald-50" : "bg-slate-50")}>
            <p className="text-[13px]">
              {r.pathikAt ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                  <CheckCircle2 className="size-4" /> Entered in Pathik by {r.pathikBy}, {formatDateTime(r.pathikAt)}
                </span>
              ) : (
                <span className="text-slate-700">After you press Submit in Pathik, mark this stay as entered.</span>
              )}
            </p>
            {r.pathikAt ? (
              <Button size="sm" variant="ghost" onClick={() => mark(false)}>
                Remove mark
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => mark(true)}>
                Entered in Pathik
              </Button>
            )}
          </div>

          <button onClick={() => setCopy(!copy)} className="flex items-center gap-1 text-[12.5px] font-medium text-brand-700">
            <ClipboardCopy className="size-3.5" /> {copy ? "Hide" : "Show"} the details to copy one by one
          </button>
          {copy && (
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {pathikCopyRows(r, label).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                  <span className="w-32 shrink-0 text-slate-500">{k}</span>
                  <span className="min-w-0 flex-1 font-medium break-words">{v}</span>
                  <button
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                    title={`Copy ${k}`}
                    onClick={() => {
                      void navigator.clipboard.writeText(v);
                      toast(`${k} copied`);
                    }}
                  >
                    <ClipboardCopy className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {r && <PathikDetailsDialog open={editing} onClose={() => setEditing(false)} bookingId={bookingId} onSaved={() => (load(), onChanged?.())} />}
    </Modal>
  );
}

/** The details Pathik asks for, on one screen: the guest's address and the journey. */
function PathikDetailsDialog({ open, onClose, bookingId, onSaved }: { open: boolean; onClose: () => void; bookingId: string; onSaved: () => void }) {
  const { toast } = useApp();
  const [b, setB] = useState<FullBooking | null>(null);
  const [g, setG] = useState<Record<string, string>>({});
  const [s, setS] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setError("");
    void api<FullBooking>("bookings.get", { id: bookingId }).then((x) => {
      setB(x);
      const gg = x.guest;
      setG({ lastName: gg.lastName, address: gg.address ?? "", locality: gg.locality ?? "", city: gg.city ?? "", district: gg.district ?? "", pinCode: gg.pinCode ?? "", state: gg.state ?? "", dateOfBirth: gg.dateOfBirth ?? "", email: gg.email ?? "" });
      setS({ comingFrom: x.comingFrom ?? "", goingTo: x.goingTo ?? "", vehicleType: x.vehicleType ?? "", vehicleNumber: x.vehicleNumber ?? "", companions: x.companions.map((c) => c.name).join("\n") });
    });
  }, [open, bookingId]);
  const save = async () => {
    if (!b) return;
    setBusy(true);
    try {
      await api("guests.save", { id: b.guestId, ...g });
      await api("bookings.update", {
        id: b.id,
        comingFrom: s.comingFrom,
        goingTo: s.goingTo,
        vehicleType: s.vehicleType,
        vehicleNumber: s.vehicleNumber,
        companions: s.companions
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean)
          .map((name) => ({ name })),
      });
      toast("Details saved");
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const gi = (k: string, l: string, props: Record<string, unknown> = {}) => (
    <Field label={l}>
      <Input value={g[k] ?? ""} onChange={(e) => setG({ ...g, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <Modal open={open} onClose={onClose} width={620} title="Details for Pathik" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save details</Button></>}>
      {!b ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {gi("lastName", "Last name (surname)")}
          {gi("dateOfBirth", "Date of birth", { type: "date" })}
          <div className="col-span-2">{gi("address", "Address (house, street)")}</div>
          {gi("locality", "Locality / area")}
          {gi("city", "City")}
          {gi("district", "District")}
          {gi("pinCode", "PIN code", { maxLength: 10 })}
          <Field label="State">
            <Select value={g.state ?? ""} onChange={(e) => setG({ ...g, state: e.target.value })} options={[{ value: "", label: "—" }, ...Object.values(INDIAN_STATES).sort().map((x) => ({ value: x, label: x })), { value: "Outside India", label: "Outside India" }]} />
          </Field>
          {gi("email", "Email")}
          <Field label="Coming from">
            <Input value={s.comingFrom} onChange={(e) => setS({ ...s, comingFrom: e.target.value })} />
          </Field>
          <Field label="Going to">
            <Input value={s.goingTo} onChange={(e) => setS({ ...s, goingTo: e.target.value })} />
          </Field>
          <Field label="Travelling by">
            <Select value={s.vehicleType} onChange={(e) => setS({ ...s, vehicleType: e.target.value })} options={[{ value: "", label: "—" }, ...VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_LABELS[v] }))]} />
          </Field>
          <Field label="Vehicle number">
            <Input value={s.vehicleNumber} onChange={(e) => setS({ ...s, vehicleNumber: e.target.value.toUpperCase() })} />
          </Field>
          <Field label={`Other adults in the room (${Math.max(0, b.adults - 1)})`} hint="One full name per line" className="col-span-2">
            <Textarea value={s.companions} onChange={(e) => setS({ ...s, companions: e.target.value })} rows={Math.max(2, b.adults - 1)} />
          </Field>
          <p className="col-span-2 text-[12px] text-slate-500">Tick each adult's ID on the booking page so Pathik's “document type” is filled too.</p>
          <div className="col-span-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>
      )}
    </Modal>
  );
}

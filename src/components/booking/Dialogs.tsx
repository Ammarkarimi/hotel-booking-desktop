// The dialogs on a booking: payments, extras, check-in, check-out, ID checks, changes and cancelling.
import { useEffect, useState } from "react";
import { AlertTriangle, IdCard, LogIn, LogOut, Sparkles } from "lucide-react";
import { api, errorText } from "../../api";
import { useApp } from "../../state";
import { Button, ErrorNote, Field, Input, Modal, Note, Row, Select, Textarea, Toggle } from "../ui";
import { CHARGE_CATEGORIES, ID_TYPES, PAYMENT_METHODS, SOURCES, label, money, money2 } from "../../../shared/format";
import { addDays, formatDate, nightsBetween, todayKey } from "../../../shared/dates";
import type { Folio } from "../../../shared/pricing";
import type { FullBooking, Room } from "../../../shared/types";
import { VEHICLE_LABELS, VEHICLE_TYPES, type PathikRecord } from "../../../shared/pathik";
import { PathikDetailsDialog } from "../PathikDialog";

type Done = (b: FullBooking) => void;

function useAction(onDone: Done, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (method: string, args: unknown) => {
    setBusy(true);
    setError("");
    try {
      const b = await api<FullBooking>(method, args);
      onDone(b);
      onClose();
      return b;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

export function PaymentDialog({ open, onClose, booking, refund, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; refund?: boolean; onDone: Done }) {
  const { settings, toast } = useApp();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const { busy, error, run } = useAction((b) => (onDone(b), toast(refund ? "Refund saved" : "Payment saved")), onClose);
  const due = booking.folio.balance;
  useEffect(() => {
    if (open) {
      setAmount(refund ? (due < 0 ? String(Math.abs(due)) : "") : due > 0 ? String(Math.round(due * 100) / 100) : "");
      setReference("");
      setNotes("");
      setMethod(refund ? "cash" : "cash");
    }
  }, [open, due, refund]);
  const cur = settings?.currency;
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={refund ? "Give a refund" : "Take a payment"}
      subtitle={`Booking #${booking.number} · ${booking.guestName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={refund ? "danger" : "success"} loading={busy} onClick={() => run("payments.add", { bookingId: booking.id, amount: Number(amount), method, reference, notes, refund })}>
            {refund ? "Save refund" : `Save payment${amount ? ` of ${money(Number(amount), cur)}` : ""}`}
          </Button>
        </>
      }
    >
      <div className="mb-3 rounded-md bg-slate-50 px-3 py-2">
        <Row label="Bill total">{money2(booking.folio.grandTotal, cur)}</Row>
        <Row label="Paid so far">{money2(booking.folio.netPaid, cur)}</Row>
        <Row label={due >= 0 ? "Balance to pay" : "Paid too much"} strong>
          {money2(Math.abs(due), cur)}
        </Row>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label={refund ? "Refunded by" : "Paid by"}>
          <Select value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))} />
        </Field>
        <Field label="Reference" className="col-span-2" hint="UPI / card transaction number (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Note" className="col-span-2">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      {!refund && due > 0 && (
        <div className="mt-2 flex gap-1">
          {[due, Math.round(due / 2)].map((v, i) => (
            <Button key={i} size="sm" onClick={() => setAmount(String(Math.round(v * 100) / 100))}>
              {i === 0 ? "Full balance" : "Half"} {money(v, cur)}
            </Button>
          ))}
        </div>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

const QUICK: Array<{ category: string; description: string; unitPrice: number }> = [
  { category: "food", description: "Breakfast", unitPrice: 200 },
  { category: "food", description: "Lunch", unitPrice: 300 },
  { category: "food", description: "Dinner", unitPrice: 350 },
  { category: "beverages", description: "Tea / coffee", unitPrice: 40 },
  { category: "laundry", description: "Laundry", unitPrice: 150 },
  { category: "extra_bed", description: "Extra bed (per night)", unitPrice: 500 },
  { category: "transport", description: "Taxi", unitPrice: 600 },
  { category: "late_checkout", description: "Late check-out", unitPrice: 500 },
];

export function ChargeDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done }) {
  const { settings, toast } = useApp();
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [date, setDate] = useState(todayKey());
  const { busy, error, run } = useAction((b) => (onDone(b), toast("Added to the bill")), onClose);
  useEffect(() => {
    if (open) {
      setDescription("");
      setQuantity("1");
      setUnitPrice("");
      setDate(todayKey());
    }
  }, [open]);
  const total = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title="Add to the bill"
      subtitle="Food, laundry, extra bed, taxi or any other charge"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => run("charges.add", { bookingId: booking.id, category, description, quantity: Number(quantity), unitPrice: Number(unitPrice), date })}>
            Add {total ? money(total, settings?.currency) : ""}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <Button key={q.description} size="sm" onClick={() => (setCategory(q.category), setDescription(q.description), setUnitPrice(String(q.unitPrice)))}>
            {q.description}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={CHARGE_CATEGORIES.map((c) => ({ value: c, label: label(c) }))} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Description" className="col-span-2">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={label(category)} />
        </Field>
        <Field label="Quantity">
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Price each" hint={`GST on extras: ${settings?.taxMode === "none" ? 0 : settings?.extrasTaxRate}%`}>
          <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} autoFocus />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function IdDialog({ open, onClose, booking, person, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; person: string; onDone: Done }) {
  const { toast } = useApp();
  const [name, setName] = useState(person);
  const [idType, setIdType] = useState(booking.guest.idType || "aadhaar");
  const [last4, setLast4] = useState("");
  const { busy, error, run } = useAction((b) => (onDone(b), toast("ID ticked")), onClose);
  useEffect(() => {
    if (open) {
      setName(person);
      setLast4("");
      setIdType(person === booking.guestName ? booking.guest.idType || "aadhaar" : "aadhaar");
    }
  }, [open, person, booking]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={
        <span className="flex items-center gap-2">
          <IdCard className="size-5 text-brand-600" /> Tick ID as checked
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => run("ids.add", { bookingId: booking.id, person: name, idType, idLast4: last4 })}>
            I have seen the original ID
          </Button>
        </>
      }
    >
      <Note tone="slate" className="mb-3">
        Look at the original ID and check the photo matches the person. Only the kind of ID, who checked it and when are saved — not the ID number or a copy.
      </Note>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Person" className="col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="ID shown">
          <Select value={idType} onChange={(e) => setIdType(e.target.value)} options={ID_TYPES.map((t) => ({ value: t, label: label(t) }))} />
        </Field>
        <Field label="Last 4 characters" hint="Optional, to match the ID later">
          <Input value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))} maxLength={4} />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function CheckInDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done }) {
  const { settings, toast } = useApp();
  const missing = Math.max(0, booking.adults - booking.idChecks.length);
  const [ack, setAck] = useState(false);
  const { busy, error, run } = useAction((b) => (onDone(b), toast(`${b.guestName} checked in to room ${b.room.roomNumber}`)), onClose);
  useEffect(() => setAck(false), [open]);
  // Pathik on (always in Gujarat): every detail Pathik asks for is needed before check-in.
  const [pathik, setPathik] = useState<PathikRecord | null>(null);
  const [editPathik, setEditPathik] = useState(false);
  const loadPathik = () => void api<PathikRecord>("pathik.record", { bookingId: booking.id }).then(setPathik).catch(() => setPathik(null));
  useEffect(() => {
    if (open && settings?.pathik) loadPathik();
  }, [open, settings?.pathik, booking.id]);
  const pathikMissing = settings?.pathik ? pathik?.missing ?? [] : [];
  const early = booking.checkInDate > todayKey();
  const needAck = settings?.idCheckRequired && missing > 0;
  const go = async () => {
    const res = await run("bookings.checkIn", { id: booking.id, confirmIdsMissing: ack });
    void res;
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={500}
      title={
        <span className="flex items-center gap-2">
          <LogIn className="size-5 text-emerald-600" /> Check in {booking.guestName}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Not yet</Button>
          <Button variant="success" loading={busy} disabled={(!!needAck && !ack) || pathikMissing.length > 0} onClick={go}>
            Check in to room {booking.room.roomNumber}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <Row label="Room">
            {booking.room.roomNumber} · {label(booking.room.type)}
          </Row>
          <Row label="Stay">
            {formatDate(early ? todayKey() : booking.checkInDate)} → {formatDate(booking.checkOutDate)}
          </Row>
          <Row label="Guests">
            {booking.adults} adult{booking.adults > 1 ? "s" : ""}
            {booking.children ? `, ${booking.children} child${booking.children > 1 ? "ren" : ""}` : ""}
          </Row>
          <Row label="Balance to pay">{money2(booking.folio.balance, settings?.currency)}</Row>
        </div>
        {early && <Note tone="amber">The guest is arriving before the booked date. The stay will start today ({formatDate(todayKey())}) and the bill will include the extra night(s).</Note>}
        {booking.room.housekeeping !== "clean" && (
          <Note tone="amber" icon={<Sparkles />}>
            Room {booking.room.roomNumber} is marked “{label(booking.room.housekeeping)}”. Make sure it is ready.
          </Note>
        )}
        {missing > 0 && (
          <Note tone={settings?.idCheckRequired ? "red" : "amber"} icon={<AlertTriangle />}>
            {missing} of {booking.adults} adult{booking.adults > 1 ? "s" : ""} do not have their ID ticked yet. Please look at every adult's original ID before check-in.
            {settings?.idCheckRequired && !settings?.pathik && (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Check in anyway (the IDs will be ticked later)
              </label>
            )}
          </Note>
        )}
        {pathikMissing.length > 0 && (
          <Note tone="red" icon={<AlertTriangle />}>
            <b>Pathik needs these details before check-in:</b> {pathikMissing.join(", ")}.
            <div className="mt-2">
              <Button size="sm" variant="primary" onClick={() => setEditPathik(true)}>
                Add the details
              </Button>
            </div>
            {pathikMissing.some((m) => m.startsWith("ID proof")) && <p className="mt-1 text-[12px]">Tick each adult's ID under “ID check” on the booking.</p>}
          </Note>
        )}
        <PathikDetailsDialog open={editPathik} onClose={() => setEditPathik(false)} bookingId={booking.id} onSaved={loadPathik} />
        <ErrorNote>{error.startsWith("ID_MISSING") ? "Please tick the IDs first, or choose “Check in anyway”." : error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function CheckOutDialog({ open, onClose, booking, onDone, onTakePayment }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done; onTakePayment: () => void }) {
  const { settings, toast } = useApp();
  const [preview, setPreview] = useState<{ booked: Folio; stayed: Folio; stayedCheckOut: string; differs: boolean } | null>(null);
  const [billUpTo, setBillUpTo] = useState<"booked" | "today">("booked");
  const { busy, error, run } = useAction((b) => (onDone(b), toast(`${b.guestName} checked out · invoice ${b.bill?.invoiceNumber}`)), onClose);
  useEffect(() => {
    if (open) void api<typeof preview>("bookings.checkOutPreview", { id: booking.id }).then((p) => {
      setPreview(p);
      // A late departure bills up to today; an early one keeps the booked nights unless the desk chooses otherwise.
      setBillUpTo(p && p.differs && p.stayedCheckOut > booking.checkOutDate ? "today" : "booked");
    });
  }, [open, booking.id, booking.checkOutDate, booking.folio.netPaid]);
  const cur = settings?.currency;
  const f = preview ? (billUpTo === "today" ? preview.stayed : preview.booked) : booking.folio;
  const early = preview && preview.stayedCheckOut < booking.checkOutDate;
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={540}
      title={
        <span className="flex items-center gap-2">
          <LogOut className="size-5 text-amber-600" /> Check out {booking.guestName}
        </span>
      }
      subtitle={`Room ${booking.room.roomNumber} · booking #${booking.number}`}
      footer={
        <>
          <Button onClick={onClose}>Not yet</Button>
          {f.balance >= 1 && (
            <Button variant="success" onClick={onTakePayment}>
              Take payment first
            </Button>
          )}
          <Button variant="warning" loading={busy} onClick={() => run("bookings.checkOut", { id: booking.id, billUpTo })}>
            Check out and make invoice
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {preview?.differs && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px]">
            <p className="mb-2 font-medium text-amber-900">{early ? "The guest is leaving before the booked date." : "The guest stayed longer than booked."} Bill for:</p>
            <label className="flex items-center gap-2">
              <input type="radio" checked={billUpTo === "today"} onChange={() => setBillUpTo("today")} /> The nights actually stayed ({nightsBetween(booking.checkInDate, preview.stayedCheckOut)}) — {money2(preview.stayed.grandTotal, cur)}
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" checked={billUpTo === "booked"} onChange={() => setBillUpTo("booked")} /> The booked nights ({nightsBetween(booking.checkInDate, booking.checkOutDate)}) — {money2(preview.booked.grandTotal, cur)}
            </label>
          </div>
        )}
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <Row label={`Room, ${f.nightCount} night${f.nightCount > 1 ? "s" : ""}`}>{money2(f.roomTotal, cur)}</Row>
          {f.discount > 0 && <Row label="Discount">− {money2(f.discount, cur)}</Row>}
          {f.extrasTotal > 0 && <Row label="Extras">{money2(f.extrasTotal, cur)}</Row>}
          <Row label="GST">{money2(f.taxTotal, cur)}</Row>
          <Row label="Total" strong>
            {money2(f.grandTotal, cur)}
          </Row>
          <Row label="Paid">{money2(f.netPaid, cur)}</Row>
          <Row label={f.balance >= 0 ? "Balance to pay" : "Refund due to guest"} strong className={f.balance >= 1 ? "text-red-600" : f.balance <= -1 ? "text-amber-700" : "text-emerald-700"}>
            {money2(Math.abs(f.balance), cur)}
          </Row>
        </div>
        {f.balance >= 1 && <Note tone="amber">The guest still has {money(f.balance, cur)} to pay. Take the payment first, or check out now and collect later (it will show as money due).</Note>}
        {f.balance <= -1 && <Note tone="amber">The guest has paid {money(-f.balance, cur)} more than the bill. Give a refund from the booking page.</Note>}
        <p className="text-[12.5px] text-slate-500">The GST invoice gets its number now and cannot be changed afterwards. The room is marked for cleaning.</p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function CancelDialog({ open, onClose, booking, noShow, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; noShow?: boolean; onDone: Done }) {
  const { toast, settings } = useApp();
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction((b) => (onDone(b), toast(noShow ? "Marked as no-show" : "Booking cancelled")), onClose);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      title={noShow ? "Guest did not come (no-show)" : "Cancel this booking"}
      footer={
        <>
          <Button onClick={onClose}>Keep booking</Button>
          <Button variant="danger" loading={busy} onClick={() => run("bookings.cancel", { id: booking.id, reason, noShow })}>
            {noShow ? "Mark no-show" : "Cancel booking"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13.5px]">
          Room {booking.room.roomNumber} becomes free for {formatDate(booking.checkInDate)} to {formatDate(booking.checkOutDate)}.
        </p>
        {booking.folio.netPaid > 0 && (
          <Note tone="amber">
            The guest has paid {money(booking.folio.netPaid, settings?.currency)}. If you return money, record it as a refund on the booking afterwards. Money kept is counted as a cancellation charge.
          </Note>
        )}
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Plans changed, booked by mistake…" autoFocus />
        </Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function EditStayDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done }) {
  const { toast, settings } = useApp();
  const [checkIn, setCheckIn] = useState(booking.checkInDate);
  const [checkOut, setCheckOut] = useState(booking.checkOutDate);
  const [roomId, setRoomId] = useState(booking.roomId);
  const [adults, setAdults] = useState(String(booking.adults));
  const [children, setChildren] = useState(String(booking.children));
  const [source, setSource] = useState(booking.source);
  const [otaRef, setOtaRef] = useState(booking.otaReference ?? "");
  const [rooms, setRooms] = useState<Array<{ room: Room; free: boolean; busyWith: string | null }>>([]);
  const { busy, error, run } = useAction((b) => (onDone(b), toast("Booking changed")), onClose);
  useEffect(() => {
    if (open) {
      setCheckIn(booking.checkInDate);
      setCheckOut(booking.checkOutDate);
      setRoomId(booking.roomId);
      setAdults(String(booking.adults));
      setChildren(String(booking.children));
      setSource(booking.source);
      setOtaRef(booking.otaReference ?? "");
    }
  }, [open, booking]);
  useEffect(() => {
    if (open && checkOut > checkIn) void api<typeof rooms>("bookings.availability", { checkIn, checkOut, excludeBookingId: booking.id }).then(setRooms).catch(() => setRooms([]));
  }, [open, checkIn, checkOut, booking.id]);
  const staying = booking.status === "checked_in";
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title="Change dates, room or guests"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => run("bookings.update", { id: booking.id, checkIn, checkOut, roomId, adults: Number(adults), children: Number(children), source, otaReference: otaRef })}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Arrival">
          <Input type="date" value={checkIn} disabled={staying} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Leaving" hint={staying ? "Extend or shorten the stay" : undefined}>
          <Input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
        <Field label={staying ? "Move to room" : "Room"} className="col-span-2">
          <Select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            options={rooms.map((r) => ({ value: r.room.id, label: `${r.room.roomNumber} · ${label(r.room.type)} · ${money(r.room.pricePerNight, settings?.currency)}${r.free ? "" : ` — busy: ${r.busyWith}`}` }))}
          />
        </Field>
        <Field label="Adults">
          <Input type="number" value={adults} onChange={(e) => setAdults(e.target.value)} />
        </Field>
        <Field label="Children">
          <Input type="number" value={children} onChange={(e) => setChildren(e.target.value)} />
        </Field>
        <Field label="Booked through">
          <Select value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((s) => ({ value: s, label: label(s) }))} />
        </Field>
        <Field label="Booking site's ID">
          <Input value={otaRef} onChange={(e) => setOtaRef(e.target.value)} />
        </Field>
      </div>
      {roomId !== booking.roomId && <Note className="mt-3" tone="slate">The price per night stays {money(booking.ratePerNight, settings?.currency)}. Change it with “Change price” if the new room costs more or less.</Note>}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function PriceDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done }) {
  const { toast, settings } = useApp();
  const [rate, setRate] = useState(String(booking.ratePerNight));
  const [discount, setDiscount] = useState(String(booking.discount || ""));
  const [fixedRate, setFixedRate] = useState(booking.fixedRate);
  const [gst, setGst] = useState(booking.gstRate === null ? "" : String(booking.gstRate));
  const { busy, error, run } = useAction((b) => (onDone(b), toast("Price changed")), onClose);
  useEffect(() => {
    if (open) {
      setRate(String(booking.ratePerNight));
      setDiscount(String(booking.discount || ""));
      setFixedRate(booking.fixedRate);
      setGst(booking.gstRate === null ? "" : String(booking.gstRate));
    }
  }, [open, booking]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      title="Change the price"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => run("bookings.update", { id: booking.id, ratePerNight: Number(rate), discount: Number(discount) || 0, fixedRate, gstRate: gst === "" ? null : Number(gst) })}>
            Save price
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price per night" hint={booking.pricesIncludeTax ? "Including GST" : "Before GST"}>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} autoFocus />
        </Field>
        <Field label="Discount (whole stay)">
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <Field label="GST % on the room" hint={`Empty = automatic (${booking.folio.defaultRoomTaxRate}% now)`} className="col-span-2">
          <Select value={gst} onChange={(e) => setGst(e.target.value)} options={[{ value: "", label: "Automatic, from Settings" }, ...[0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: `${r}%` }))]} />
        </Field>
        <div className="col-span-2">
          <Toggle checked={fixedRate} onChange={setFixedRate} label="Same price every night" hint="Ignore weekend and festival price changes for this booking" />
        </div>
      </div>
      {settings?.taxMode === "india_gst" && <p className="mt-2 text-[12px] text-slate-500">GST on rooms: 0% up to ₹1,000 a night, 5% up to ₹7,500, 18% above (editable in Settings).</p>}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function NotesDialog({ open, onClose, booking, onDone }: { open: boolean; onClose: () => void; booking: FullBooking; onDone: Done }) {
  const { toast } = useApp();
  const [v, setV] = useState({ notes: "", comingFrom: "", goingTo: "", purpose: "", vehicleNumber: "", vehicleType: "", companions: "" });
  const { busy, error, run } = useAction((b) => (onDone(b), toast("Saved")), onClose);
  useEffect(() => {
    if (open)
      setV({
        notes: booking.notes ?? "",
        comingFrom: booking.comingFrom ?? "",
        goingTo: booking.goingTo ?? "",
        purpose: booking.purpose ?? "",
        vehicleNumber: booking.vehicleNumber ?? "",
        vehicleType: booking.vehicleType ?? "",
        companions: booking.companions.map((c) => c.name).join("\n"),
      });
  }, [open, booking]);
  const set = (k: keyof typeof v, value: string) => setV({ ...v, [k]: value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={540}
      title="Travel details and notes"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              run("bookings.update", {
                id: booking.id,
                ...v,
                companions: v.companions
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((name) => ({ name })),
              })
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Other adults in the room" hint="One name per line, for ID checks and the registration card" className="col-span-2">
          <Textarea value={v.companions} onChange={(e) => set("companions", e.target.value)} rows={3} />
        </Field>
        <Field label="Coming from">
          <Input value={v.comingFrom} onChange={(e) => set("comingFrom", e.target.value)} />
        </Field>
        <Field label="Going to">
          <Input value={v.goingTo} onChange={(e) => set("goingTo", e.target.value)} />
        </Field>
        <Field label="Purpose of visit">
          <Input value={v.purpose} onChange={(e) => set("purpose", e.target.value)} />
        </Field>
        <Field label="Travelling by">
          <Select value={v.vehicleType} onChange={(e) => set("vehicleType", e.target.value)} options={[{ value: "", label: "—" }, ...VEHICLE_TYPES.map((t) => ({ value: t, label: VEHICLE_LABELS[t] }))]} />
        </Field>
        <Field label="Vehicle number">
          <Input value={v.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Notes" className="col-span-2">
          <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

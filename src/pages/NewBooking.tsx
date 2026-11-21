// A new booking on one screen: dates → room → guest → price and advance. Walk-ins check in at once.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, BedDouble, CheckCircle2, Crown, Footprints, Search, UserPlus, X } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Badge, Button, ErrorNote, Field, Input, Note, Page, PageHeader, Panel, Row, Select, Textarea, Toggle, cx } from "../components/ui";
import { GuestFields, type GuestDraft } from "../components/GuestFields";
import { addDays, formatDate, formatShortDate, nightsBetween, todayKey } from "../../shared/dates";
import { PAYMENT_METHODS, SOURCES, label, money, money2 } from "../../shared/format";
import type { Folio } from "../../shared/pricing";
import { VEHICLE_LABELS, VEHICLE_TYPES } from "../../shared/pathik";
import type { FullBooking, GuestSummary, Room } from "../../shared/types";

interface Avail {
  room: Room;
  free: boolean;
  busyWith: string | null;
  quote: Folio;
}

export function NewBooking() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { settings, toast, can } = useApp();
  const today = todayKey();
  const walkInStart = params.get("walkin") === "1";
  const [walkIn, setWalkIn] = useState(walkInStart);
  const [checkIn, setCheckIn] = useState(params.get("date") ?? today);
  const [checkOut, setCheckOut] = useState(addDays(params.get("date") ?? today, 1));
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [avail, setAvail] = useState<Avail[]>([]);
  const [roomId, setRoomId] = useState(params.get("room") ?? "");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [draft, setDraft] = useState<GuestDraft>({ nationality: "Indian" });
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<GuestSummary[]>([]);
  const [rate, setRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [source, setSource] = useState(walkInStart ? "walk_in" : "phone");
  const [otaRef, setOtaRef] = useState("");
  const [advance, setAdvance] = useState("");
  const [method, setMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [notes, setNotes] = useState("");
  const [comingFrom, setComingFrom] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [quote, setQuote] = useState<Folio | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [allowBlocked, setAllowBlocked] = useState(false);
  const nights = checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;
  const cur = settings?.currency;

  useEffect(() => {
    if (walkIn) {
      setCheckIn(today);
      if (checkOut <= today) setCheckOut(addDays(today, 1));
      setSource("walk_in");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkIn]);

  useEffect(() => {
    if (checkOut <= checkIn) return;
    void api<Avail[]>("bookings.availability", { checkIn, checkOut }).then((a) => {
      setAvail(a);
      if (roomId && !a.find((x) => x.room.id === roomId)?.free) setRoomId("");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  const room = avail.find((a) => a.room.id === roomId)?.room;
  useEffect(() => {
    if (room) setRate(String(room.pricePerNight));
  }, [room?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!roomId || checkOut <= checkIn) return setQuote(null);
    const t = setTimeout(() => {
      void api<Folio>("bookings.quote", { roomId, checkIn, checkOut, ratePerNight: rate === "" ? undefined : Number(rate), discount: Number(discount) || 0, advance: Number(advance) || 0 })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 150);
    return () => clearTimeout(t);
  }, [roomId, checkIn, checkOut, rate, discount, advance]);

  useEffect(() => {
    if (q.trim().length < 2) return setMatches([]);
    const t = setTimeout(() => void api<GuestSummary[]>("guests.search", { q }).then(setMatches), 200);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    const g = new Map<string, Avail[]>();
    for (const a of avail) g.set(a.room.type, [...(g.get(a.room.type) ?? []), a]);
    return [...g.entries()];
  }, [avail]);

  const save = async () => {
    setError("");
    if (!roomId) return setError("Please choose a room");
    if (!guest && !draft.firstName?.trim()) return setError("Please choose a returning guest or enter the new guest's name");
    if (!guest && !draft.phone?.trim()) return setError("Please enter the guest's mobile number");
    setBusy(true);
    try {
      const b = await api<FullBooking>("bookings.create", {
        guest: guest ? { id: guest.id } : draft,
        roomId,
        checkIn,
        checkOut,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        source,
        otaReference: otaRef,
        ratePerNight: rate === "" ? undefined : Number(rate),
        discount: Number(discount) || 0,
        notes,
        comingFrom,
        purpose,
        vehicleType,
        advance: Number(advance) > 0 ? { amount: Number(advance), method, reference: payRef } : undefined,
        walkIn,
        allowBlacklisted: allowBlocked,
      });
      if (walkIn && b.status === "reserved") {
        toast(`Booking #${b.number} made. Add the details Pathik needs, then check in.`);
        navigate(`/bookings/${b.id}?do=checkin`, { replace: true });
        return;
      }
      toast(walkIn ? `Booking #${b.number} made and ${b.guestName} checked in to room ${b.room.roomNumber}` : `Booking #${b.number} confirmed for ${b.guestName}`);
      navigate(`/bookings/${b.id}?created=1`, { replace: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title={walkIn ? "Walk-in guest" : "New booking"}
        subtitle={walkIn ? "The guest is here now: the booking is made and checked in together." : "Choose the dates, a free room and the guest."}
        actions={<Toggle checked={walkIn} onChange={setWalkIn} label="Walk-in (check in now)" />}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title="1. Dates and guests">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Arrival">
                <Input type="date" value={checkIn} disabled={walkIn} onChange={(e) => (setCheckIn(e.target.value), e.target.value >= checkOut && setCheckOut(addDays(e.target.value, 1)))} className="w-44" />
              </Field>
              <Field label="Leaving">
                <Input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className="w-44" />
              </Field>
              <div className="flex gap-1 pb-0.5">
                {[1, 2, 3, 4, 7].map((n) => (
                  <Button key={n} size="sm" variant={nights === n ? "primary" : "secondary"} onClick={() => setCheckOut(addDays(checkIn, n))}>
                    {n} night{n > 1 ? "s" : ""}
                  </Button>
                ))}
              </div>
              <Field label="Adults">
                <Input type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} className="w-20" />
              </Field>
              <Field label="Children">
                <Input type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} className="w-20" />
              </Field>
            </div>
          </Panel>

          <Panel title="2. Choose a room" subtitle={nights ? `${formatShortDate(checkIn)} to ${formatShortDate(checkOut)} · ${nights} night${nights > 1 ? "s" : ""} · price shown for the whole stay` : undefined}>
            {groups.length === 0 ? (
              <Note tone="amber">No rooms yet. Add rooms in Rooms & prices first.</Note>
            ) : (
              <div className="space-y-3">
                {groups.map(([type, list]) => (
                  <div key={type}>
                    <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                      {label(type)} · {list.filter((a) => a.free).length} free
                    </p>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                      {list.map((a) => {
                        const tooSmall = a.room.capacity < (Number(adults) || 1);
                        return (
                          <button
                            key={a.room.id}
                            disabled={!a.free}
                            onClick={() => setRoomId(a.room.id)}
                            className={cx(
                              "rounded-md border p-2.5 text-left transition-colors",
                              !a.free && "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60",
                              a.free && roomId !== a.room.id && "border-slate-200 bg-white hover:border-brand-400",
                              roomId === a.room.id && "border-brand-600 bg-brand-50 ring-2 ring-brand-200"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[15px] font-semibold">{a.room.roomNumber}</span>
                              {roomId === a.room.id && <CheckCircle2 className="size-4 text-brand-600" />}
                            </div>
                            {a.free ? (
                              <>
                                <p className="tabular text-[13px] font-medium text-slate-800">{money(a.quote.grandTotal, cur)}</p>
                                <p className="text-[11px] text-slate-500">
                                  {money(a.room.pricePerNight, cur)}/night · {a.room.capacity} guests
                                </p>
                                {tooSmall && <p className="text-[11px] text-amber-700">For {a.room.capacity} guests</p>}
                                {a.room.housekeeping !== "clean" && checkIn === today && <p className="text-[11px] text-red-600">Needs cleaning</p>}
                              </>
                            ) : (
                              <p className="truncate text-[11.5px] text-slate-500">{a.busyWith}</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="3. Guest">
            {guest ? (
              <div className="flex items-start justify-between rounded-md border border-brand-200 bg-brand-50 p-3">
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    {guest.firstName} {guest.lastName} {guest.vip && <Crown className="size-4 text-amber-500" />}
                  </p>
                  <p className="text-[12.5px] text-slate-600">
                    {guest.phone}
                    {guest.city ? ` · ${guest.city}` : ""}
                    {guest.company ? ` · ${guest.company}` : ""}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {guest.stays} earlier stay{guest.stays === 1 ? "" : "s"} · {money(guest.spent, cur)} paid in total
                  </p>
                  {guest.blacklisted && (
                    <div className="mt-2">
                      <Note tone="red" icon={<AlertTriangle />}>
                        This guest is marked “do not allow”.{guest.notes ? ` Note: ${guest.notes}` : ""}
                        {can("editPrices") && (
                          <label className="mt-1 flex items-center gap-2">
                            <input type="checkbox" checked={allowBlocked} onChange={(e) => setAllowBlocked(e.target.checked)} /> Book anyway
                          </label>
                        )}
                      </Note>
                    </div>
                  )}
                </div>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setGuest(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mb-4">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Returning guest? Type their phone number or name" className="pl-8" />
                  {matches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                      {matches.map((m) => (
                        <button key={m.id} onClick={() => (setGuest(m), setQ(""), setMatches([]))} className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-brand-50">
                          <span>
                            <span className="font-medium">
                              {m.firstName} {m.lastName}
                            </span>{" "}
                            <span className="text-slate-500">· {m.phone}</span>
                            {m.city && <span className="text-slate-500"> · {m.city}</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            {m.vip && <Badge tone="amber">VIP</Badge>}
                            {m.blacklisted && <Badge tone="red">Do not allow</Badge>}
                            <span className="text-[12px] text-slate-500">{m.stays} stays</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600">
                  <UserPlus className="size-4" /> New guest
                </p>
                <GuestFields value={draft} onChange={setDraft} />
              </>
            )}
          </Panel>

          <Panel title="4. Price, payment and notes">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label="Price per night" hint={room ? `Room price ${money(room.pricePerNight, cur)}${settings?.roomPricesIncludeTax ? " incl. GST" : ""}` : undefined}>
                <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} disabled={!room} />
              </Field>
              <Field label="Discount (whole stay)">
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Booked through">
                <Select value={source} onChange={(e) => setSource(e.target.value)} options={SOURCES.map((s) => ({ value: s, label: label(s) }))} />
              </Field>
              <Field label="Booking site's ID">
                <Input value={otaRef} onChange={(e) => setOtaRef(e.target.value)} placeholder="Optional" />
              </Field>
              <Field label="Advance paid now">
                <Input type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Paid by">
                <Select value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))} />
              </Field>
              <Field label="Payment reference" className="col-span-2">
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UPI / card transaction no. (optional)" />
              </Field>
              <Field label="Coming from">
                <Input value={comingFrom} onChange={(e) => setComingFrom(e.target.value)} />
              </Field>
              <Field label="Purpose of visit">
                <Select value={purpose} onChange={(e) => setPurpose(e.target.value)} options={["", "Tourism", "Business", "Family visit", "Wedding", "Medical", "Pilgrimage", "Other"].map((p) => ({ value: p, label: p || "—" }))} />
              </Field>
              {settings?.pathik && (
                <Field label="Travelling by" hint="Asked by Pathik">
                  <Select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} options={[{ value: "", label: "—" }, ...VEHICLE_TYPES.map((v) => ({ value: v, label: VEHICLE_LABELS[v] }))]} />
                </Field>
              )}
              <Field label="Notes" className={settings?.pathik ? "col-span-1" : "col-span-2"}>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} placeholder="Early arrival, extra bed, airport pickup…" />
              </Field>
            </div>
          </Panel>
        </div>

        <div>
          <div className="sticky top-4 space-y-3">
            <Panel title="Summary">
              {room ? (
                <div className="mb-2 flex items-center gap-2 text-[13.5px]">
                  <BedDouble className="size-4 text-slate-400" /> Room <b>{room.roomNumber}</b> · {label(room.type)}
                </div>
              ) : (
                <p className="mb-2 text-[13px] text-slate-500">Choose a room to see the price.</p>
              )}
              <p className="mb-3 text-[13px] text-slate-600">
                {formatDate(checkIn)} → {formatDate(checkOut)} · {nights} night{nights === 1 ? "" : "s"}
              </p>
              {quote && (
                <div className="border-t border-slate-100 pt-2">
                  {quote.nights.some((n) => n.adjustment) && (
                    <div className="mb-1 text-[11.5px] text-slate-500">
                      {quote.nights.map((n) => (
                        <div key={n.date} className="flex justify-between">
                          <span>{formatShortDate(n.date)}</span>
                          <span>{money2(n.rate, cur)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Row label={`Room (${quote.nightCount} × ${money2(quote.nightCount ? quote.roomTotal / quote.nightCount : 0, cur)})`}>{money2(quote.roomTotal, cur)}</Row>
                  {quote.discount > 0 && <Row label="Discount">− {money2(quote.discount, cur)}</Row>}
                  <Row label={`GST @ ${quote.roomTaxRate}%`}>{money2(quote.roomTax, cur)}</Row>
                  <Row label="Total" strong className="mt-1 border-t border-slate-200 pt-2 text-[15px]">
                    {money2(quote.grandTotal, cur)}
                  </Row>
                  {quote.netPaid > 0 && (
                    <>
                      <Row label="Advance">− {money2(quote.netPaid, cur)}</Row>
                      <Row label="Balance at hotel" strong>
                        {money2(quote.balance, cur)}
                      </Row>
                    </>
                  )}
                </div>
              )}
              <div className="mt-3">
                <ErrorNote>{error}</ErrorNote>
              </div>
              <Button variant={walkIn ? "success" : "primary"} size="lg" className="mt-3 w-full" loading={busy} onClick={save} icon={walkIn ? <Footprints className="size-4" /> : <CheckCircle2 className="size-4" />}>
                {walkIn ? "Book and check in now" : "Confirm booking"}
              </Button>
              <p className="mt-2 text-center text-[11.5px] text-slate-500">You can send the confirmation on WhatsApp next.</p>
            </Panel>
          </div>
        </div>
      </div>
    </Page>
  );
}

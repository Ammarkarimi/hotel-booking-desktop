// One booking: the stay, the bill, payments, ID checks, WhatsApp messages and every action.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Ban, BedDouble, CalendarClock, CheckCircle2, Crown, FileText, IdCard, IndianRupee, LogIn, LogOut, MessageCircle, MoreHorizontal, Pencil, Plus, Printer, RotateCcw, Trash2, Undo2, UserRound, Receipt, ClipboardList } from "lucide-react";
import { api, bridge, errorText } from "../api";
import { useApp } from "../state";
import { Badge, Button, Confirm, Loading, Note, Page, Panel, Row, StatusBadge, cx, useLoad } from "../components/ui";
import { CancelDialog, ChargeDialog, CheckInDialog, CheckOutDialog, EditStayDialog, IdDialog, NotesDialog, PaymentDialog, PriceDialog } from "../components/booking/Dialogs";
import { WhatsAppDialog } from "../components/WhatsAppDialog";
import { formatDate, formatDateTime, formatShortDate, todayKey } from "../../shared/dates";
import { label, money2, money } from "../../shared/format";
import { MESSAGE_TITLES, type MessageKind } from "../../shared/messages";
import type { ActivityEntry, FullBooking } from "../../shared/types";

type DialogName = "pay" | "refund" | "charge" | "checkin" | "checkout" | "cancel" | "noshow" | "edit" | "price" | "notes" | "id" | "wa" | "delete" | "undo" | null;

export function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { settings, toast, can } = useApp();
  const { data: b, setData, error } = useLoad(() => api<FullBooking>("bookings.get", { id }), [id]);
  const { data: history, reload: reloadHistory } = useLoad(() => api<ActivityEntry[]>("activity.list", { bookingId: id, limit: 50 }), [id]);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [waKind, setWaKind] = useState<MessageKind | undefined>();
  const [idPerson, setIdPerson] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = settings?.currency;

  useEffect(() => {
    if (!b) return;
    const d = params.get("do");
    if (d === "checkin" && b.status === "reserved") setDialog("checkin");
    if (d === "checkout" && b.status === "checked_in") setDialog("checkout");
    if (d) {
      params.delete("do");
      setParams(params, { replace: true });
    }
  }, [b, params, setParams]);

  if (error) return <Page><Note tone="red">{error}</Note></Page>;
  if (!b) return <Loading />;

  const f = b.folio;
  const done = (nb: FullBooking) => {
    setData(nb);
    reloadHistory();
  };
  const afterCheckIn = (nb: FullBooking) => {
    done(nb);
    setWaKind("checkIn");
    setTimeout(() => setDialog("wa"), 50);
  };
  const afterCheckOut = (nb: FullBooking) => {
    done(nb);
    setParams({ checkedout: "1" });
  };
  const close = () => setDialog(null);
  const print = (kind: string) => void bridge().openPrint(`/print/${kind}/${b.id}`);
  const simple = async (method: string, msg: string) => {
    setBusy(true);
    try {
      done(await api<FullBooking>(method, { id: b.id }));
      toast(msg);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const adults = [b.guestName, ...b.companions.map((c) => c.name)];
  while (adults.length < b.adults) adults.push(`Adult ${adults.length + 1}`);
  const checkedPeople = new Set(b.idChecks.map((c) => c.person.toLowerCase()));
  const active = b.status === "reserved" || b.status === "checked_in";
  const today = todayKey();

  return (
    <Page>
      <div className="mb-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Back
        </button>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[21px] font-semibold">
              {b.guestName} {b.guest.vip && <Crown className="inline size-5 text-amber-500" />}
            </h1>
            <StatusBadge status={b.status} />
            {b.guest.blacklisted && <Badge tone="red">Do not allow</Badge>}
          </div>
          <p className="text-[13px] text-slate-500">
            Booking #{b.number} · Room {b.room.roomNumber} ({label(b.room.type)}) · {formatShortDate(b.checkInDate)} → {formatShortDate(b.checkOutDate)} · {f.nightCount} night{f.nightCount > 1 ? "s" : ""} · {label(b.source)}
            {b.otaReference ? ` (${b.otaReference})` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {b.status === "reserved" && (
            <Button variant="success" icon={<LogIn className="size-4" />} onClick={() => setDialog("checkin")}>
              Check in
            </Button>
          )}
          {b.status === "checked_in" && (
            <Button variant="warning" icon={<LogOut className="size-4" />} onClick={() => setDialog("checkout")}>
              Check out
            </Button>
          )}
          {b.status !== "cancelled" && b.status !== "no_show" && (
            <Button variant="primary" icon={<IndianRupee className="size-4" />} onClick={() => setDialog("pay")}>
              Take payment
            </Button>
          )}
          <Button icon={<MessageCircle className="size-4 text-emerald-600" />} onClick={() => (setWaKind(undefined), setDialog("wa"))}>
            WhatsApp
          </Button>
          <Button icon={<Printer className="size-4" />} onClick={() => print("invoice")}>
            {b.bill ? "Invoice" : "Bill"}
          </Button>
          <div className="relative">
            <Button icon={<MoreHorizontal className="size-4" />} onClick={() => setMore(!more)}>
              More
            </Button>
            {more && (
              <div className="animate-pop absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl" onMouseLeave={() => setMore(false)} onClick={() => setMore(false)}>
                <MenuBtn icon={<FileText />} onClick={() => print("confirmation")}>Print booking confirmation</MenuBtn>
                <MenuBtn icon={<ClipboardList />} onClick={() => print("grc")}>Print registration card</MenuBtn>
                <MenuBtn icon={<Receipt />} onClick={() => print("receipt")}>Print payment receipt</MenuBtn>
                <div className="my-1 border-t border-slate-100" />
                {active && <MenuBtn icon={<CalendarClock />} onClick={() => setDialog("edit")}>{b.status === "checked_in" ? "Extend stay / move room" : "Change dates or room"}</MenuBtn>}
                {active && can("editPrices") && <MenuBtn icon={<Pencil />} onClick={() => setDialog("price")}>Change price</MenuBtn>}
                {b.folio.netPaid > 0 && <MenuBtn icon={<RotateCcw />} onClick={() => setDialog("refund")}>Give a refund</MenuBtn>}
                {b.status === "checked_in" && <MenuBtn icon={<Undo2 />} onClick={() => setDialog("undo")}>Undo check-in</MenuBtn>}
                {b.status === "reserved" && <MenuBtn icon={<Ban />} onClick={() => setDialog("noshow")}>Guest did not come (no-show)</MenuBtn>}
                {b.status === "reserved" && <MenuBtn icon={<Ban />} danger onClick={() => setDialog("cancel")}>Cancel booking</MenuBtn>}
                {(b.status === "cancelled" || b.status === "no_show") && <MenuBtn icon={<RotateCcw />} onClick={() => simple("bookings.reinstate", "Booking brought back")}>Bring booking back</MenuBtn>}
                {can("delete") && !b.bill && <MenuBtn icon={<Trash2 />} danger onClick={() => setDialog("delete")}>Delete booking</MenuBtn>}
              </div>
            )}
          </div>
        </div>
      </div>

      {params.get("created") === "1" && (
        <Note tone="green" icon={<CheckCircle2 />} className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Booking #{b.number} is saved{b.status === "checked_in" ? " and the guest is checked in" : ""}. Send the guest a confirmation?
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="success" icon={<MessageCircle className="size-3.5" />} onClick={() => (setWaKind(b.status === "checked_in" ? "checkIn" : "booking"), setDialog("wa"))}>
                Send on WhatsApp
              </Button>
              <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => print(b.status === "checked_in" ? "grc" : "confirmation")}>
                {b.status === "checked_in" ? "Registration card" : "Print confirmation"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setParams({})}>
                Close
              </Button>
            </span>
          </div>
        </Note>
      )}
      {params.get("checkedout") === "1" && b.bill && (
        <Note tone="green" icon={<CheckCircle2 />} className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Checked out. Invoice <b>{b.bill.invoiceNumber}</b> is made. Room {b.room.roomNumber} is marked for cleaning.
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="primary" icon={<Printer className="size-3.5" />} onClick={() => print("invoice")}>
                Print invoice
              </Button>
              <Button size="sm" variant="success" icon={<MessageCircle className="size-3.5" />} onClick={() => (setWaKind(f.balance >= 1 ? "reminder" : "checkOut"), setDialog("wa"))}>
                Thank-you on WhatsApp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setParams({})}>
                Close
              </Button>
            </span>
          </div>
        </Note>
      )}
      {b.status === "reserved" && b.checkInDate < today && <Note tone="amber" className="mb-4">This guest was due on {formatDate(b.checkInDate)} and has not checked in. Check them in, or mark the booking as no-show.</Note>}
      {b.status === "checked_in" && b.checkOutDate < today && <Note tone="amber" className="mb-4">This guest was due to leave on {formatDate(b.checkOutDate)}. Extend the stay or check them out.</Note>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel
            title={b.bill ? `GST invoice ${b.bill.invoiceNumber}` : "Bill"}
            subtitle={b.bill ? `Made on ${formatDate(b.bill.invoiceDate)} at check-out` : "Updates as the stay goes on"}
            actions={
              active && (
                <>
                  {can("editPrices") && (
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDialog("price")}>
                      Change price
                    </Button>
                  )}
                  <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog("charge")}>
                    Add extra
                  </Button>
                </>
              )
            }
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">Room</p>
                {f.nights.length <= 7 || b.bill ? (
                  !b.bill &&
                  f.nights.map((n) => (
                    <Row key={n.date} label={`${formatShortDate(n.date)}${n.adjustment ? (n.adjustment > 0 ? " · higher price" : " · lower price") : ""}`}>
                      {money2(n.rate, cur)}
                    </Row>
                  ))
                ) : (
                  <Row label={`${f.nightCount} nights`}>{money2(f.roomTotal, cur)}</Row>
                )}
                <Row label={`Room total (${f.nightCount} night${f.nightCount > 1 ? "s" : ""})`} strong>
                  {money2(f.roomTotal, cur)}
                </Row>
                {f.discount > 0 && <Row label="Discount">− {money2(f.discount, cur)}</Row>}
                <Row label={`GST on room @ ${f.roomTaxRate}%`}>{money2(f.roomTax, cur)}</Row>
                {f.pricesIncludeTax && <p className="text-[11.5px] text-slate-500">Room price {money2(b.ratePerNight, cur)} includes GST.</p>}

                <p className="mt-4 mb-1 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">Extras</p>
                {b.charges.length === 0 && <p className="py-1 text-[13px] text-slate-400">No extras</p>}
                {b.charges.map((c) => (
                  <div key={c.id} className="group flex items-baseline justify-between gap-2 py-1 text-[13px]">
                    <span className="text-slate-600">
                      {c.description} {c.quantity !== 1 && `× ${c.quantity}`} <span className="text-[11px] text-slate-400">{formatShortDate(c.date)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {!b.bill && (
                        <button className="invisible text-slate-400 group-hover:visible hover:text-red-600" title="Remove" onClick={() => void api<FullBooking>("charges.delete", { id: c.id }).then(done).catch((e) => toast(errorText(e), "error"))}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                      <span className="tabular">{money2(c.amount, cur)}</span>
                    </span>
                  </div>
                ))}
                {f.extrasTax > 0 && <Row label={`GST on extras @ ${f.extrasTaxRate}%`}>{money2(f.extrasTax, cur)}</Row>}
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <Row label="Room after discount">{money2(f.roomAfterDiscount, cur)}</Row>
                <Row label="Extras">{money2(f.extrasTotal, cur)}</Row>
                <Row label="CGST">{money2(f.taxTotal / 2, cur)}</Row>
                <Row label="SGST">{money2(f.taxTotal - f.taxTotal / 2, cur)}</Row>
                <Row label="Total bill" strong className="mt-1 border-t border-slate-200 pt-2 text-[16px]">
                  {money2(f.grandTotal, cur)}
                </Row>
                <Row label="Paid">{money2(f.paid, cur)}</Row>
                {f.refunded > 0 && <Row label="Refunded">− {money2(f.refunded, cur)}</Row>}
                <div className={cx("mt-2 flex items-center justify-between rounded-md px-3 py-2 text-[15px] font-semibold", f.balance >= 1 ? "bg-red-50 text-red-700" : f.balance <= -1 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>
                  <span>{f.balance >= 1 ? "Balance to pay" : f.balance <= -1 ? "Refund due" : "Fully paid"}</span>
                  <span className="tabular">{money2(Math.abs(f.balance), cur)}</span>
                </div>
                {f.balance >= 1 && b.status !== "cancelled" && (
                  <Button variant="success" className="mt-3 w-full" icon={<IndianRupee className="size-4" />} onClick={() => setDialog("pay")}>
                    Take payment
                  </Button>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Payments" padded={false} actions={b.payments.length > 0 && <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => print("receipt")}>Receipt</Button>}>
            {b.payments.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-slate-400">No payments yet</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Taken by</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {b.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDateTime(p.paidAt)}</td>
                      <td>{p.type === "refund" ? <Badge tone="red">Refund</Badge> : p.type === "advance" ? <Badge tone="blue">Advance</Badge> : <Badge tone="green">Payment</Badge>}</td>
                      <td>{label(p.method)}</td>
                      <td className="text-slate-500">{[p.reference, p.notes].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="text-slate-500">{p.receivedBy}</td>
                      <td className={cx("num font-medium", p.type === "refund" && "text-red-600")}>
                        {p.type === "refund" ? "− " : ""}
                        {money2(p.amount, cur)}
                      </td>
                      <td className="w-8">
                        {can("delete") && (
                          <button className="text-slate-300 hover:text-red-600" title="Delete payment" onClick={() => confirm(`Delete this payment of ${money(p.amount, cur)}?`) && void api<FullBooking>("payments.delete", { id: p.id }).then(done).catch((e) => toast(errorText(e), "error"))}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <Panel title="History" padded={false}>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {(history ?? []).map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2 text-[12.5px]">
                  <span className="w-36 shrink-0 text-slate-400">{formatDateTime(a.createdAt)}</span>
                  <span>
                    <b className="font-medium text-slate-800">{a.action}</b> <span className="text-slate-500">· {a.staffName}</span>
                    {a.details && <span className="block text-slate-500">{a.details}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Guest" actions={<Link to={`/guests/${b.guestId}`} className="text-[12.5px] font-medium text-brand-700 hover:underline">Profile & edit</Link>}>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                <UserRound className="size-5" />
              </div>
              <div className="min-w-0 text-[13px]">
                <p className="font-semibold text-slate-900">{b.guestName}</p>
                <p className="text-slate-600">{b.guest.phone}</p>
                {b.guest.email && <p className="truncate text-slate-600">{b.guest.email}</p>}
                {(b.guest.city || b.guest.state) && <p className="text-slate-500">{[b.guest.city, b.guest.state].filter(Boolean).join(", ")}</p>}
                {b.guest.company && (
                  <p className="mt-1 text-slate-700">
                    {b.guest.company}
                    {b.guest.gstin && <span className="block font-mono text-[12px] text-slate-500">GSTIN {b.guest.gstin}</span>}
                  </p>
                )}
                {b.guest.notes && <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-900">{b.guest.notes}</p>}
              </div>
            </div>
          </Panel>

          <Panel title="Stay" actions={active && <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDialog("edit")}>Change</Button>}>
            <Row label="Room">
              <span className="flex items-center gap-1">
                <BedDouble className="size-3.5 text-slate-400" /> {b.room.roomNumber} · {label(b.room.type)}
              </span>
            </Row>
            <Row label="Arrival">{formatDate(b.checkInDate)}</Row>
            <Row label="Leaving">{formatDate(b.checkOutDate)}</Row>
            <Row label="Guests">
              {b.adults} adult{b.adults > 1 ? "s" : ""}
              {b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}
            </Row>
            {b.actualCheckIn && <Row label="Checked in">{formatDateTime(b.actualCheckIn)}</Row>}
            {b.actualCheckOut && <Row label="Checked out">{formatDateTime(b.actualCheckOut)}</Row>}
            <Row label="Booked by">
              {b.createdBy} · {formatShortDate(b.createdAt)}
            </Row>
            {b.cancelReason && <Row label="Reason">{b.cancelReason}</Row>}
          </Panel>

          <Panel title={`ID check (${b.idChecks.length}/${b.adults})`} actions={<IdCard className="size-4 text-slate-400" />}>
            <ul className="space-y-1.5">
              {adults.map((person) => {
                const check = b.idChecks.find((c) => c.person.toLowerCase() === person.toLowerCase());
                return (
                  <li key={person} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className={cx("flex items-center gap-1.5", check ? "text-slate-800" : "text-slate-500")}>
                      {check ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span className="size-4 rounded-full border-2 border-slate-300" />}
                      {person}
                    </span>
                    {check ? (
                      <span className="text-right text-[11.5px] text-slate-500" title={`Checked by ${check.checkedBy}, ${formatDateTime(check.createdAt)}`}>
                        {label(check.idType)}
                        {check.idLast4 ? ` ··${check.idLast4}` : ""}
                        {active && (
                          <button className="ml-1 text-slate-300 hover:text-red-600" onClick={() => void api<FullBooking>("ids.remove", { id: check.id }).then(done)}>
                            ×
                          </button>
                        )}
                      </span>
                    ) : (
                      !checkedPeople.has(person.toLowerCase()) &&
                      b.status !== "cancelled" && (
                        <Button size="sm" onClick={() => (setIdPerson(person.startsWith("Adult ") ? "" : person), setDialog("id"))}>
                          Tick ID
                        </Button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
            {b.idChecks.filter((c) => !adults.some((a) => a.toLowerCase() === c.person.toLowerCase())).map((c) => (
              <p key={c.id} className="mt-1 flex items-center gap-1.5 text-[13px]">
                <CheckCircle2 className="size-4 text-emerald-600" /> {c.person} <span className="text-[11.5px] text-slate-500">{label(c.idType)}</span>
              </p>
            ))}
          </Panel>

          <Panel title="Travel & notes" actions={<Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDialog("notes")}>Edit</Button>}>
            <Row label="Coming from">{b.comingFrom || "—"}</Row>
            <Row label="Going to">{b.goingTo || "—"}</Row>
            <Row label="Purpose">{b.purpose || "—"}</Row>
            <Row label="Vehicle">{b.vehicleNumber || "—"}</Row>
            {b.notes && <p className="mt-2 rounded bg-slate-50 px-2 py-1.5 text-[12.5px] whitespace-pre-wrap text-slate-700">{b.notes}</p>}
          </Panel>

          <Panel title="WhatsApp messages" actions={<Button size="sm" variant="ghost" icon={<MessageCircle className="size-3.5" />} onClick={() => (setWaKind(undefined), setDialog("wa"))}>Send</Button>}>
            {b.messages.length === 0 ? (
              <p className="text-[13px] text-slate-400">None sent yet</p>
            ) : (
              <ul className="space-y-1.5">
                {b.messages.map((m) => (
                  <li key={m.id} className="text-[12.5px]">
                    <span className="font-medium text-slate-800">{MESSAGE_TITLES[m.kind as MessageKind]?.title ?? label(m.kind)}</span>
                    <span className="block text-slate-500">
                      {formatDateTime(m.createdAt)} · {m.sentBy}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <PaymentDialog open={dialog === "pay"} onClose={close} booking={b} onDone={done} />
      <PaymentDialog open={dialog === "refund"} onClose={close} booking={b} refund onDone={done} />
      <ChargeDialog open={dialog === "charge"} onClose={close} booking={b} onDone={done} />
      <CheckInDialog open={dialog === "checkin"} onClose={close} booking={b} onDone={afterCheckIn} />
      <CheckOutDialog open={dialog === "checkout"} onClose={close} booking={b} onDone={afterCheckOut} onTakePayment={() => setDialog("pay")} />
      <CancelDialog open={dialog === "cancel"} onClose={close} booking={b} onDone={done} />
      <CancelDialog open={dialog === "noshow"} onClose={close} booking={b} noShow onDone={done} />
      <EditStayDialog open={dialog === "edit"} onClose={close} booking={b} onDone={done} />
      <PriceDialog open={dialog === "price"} onClose={close} booking={b} onDone={done} />
      <NotesDialog open={dialog === "notes"} onClose={close} booking={b} onDone={done} />
      <IdDialog open={dialog === "id"} onClose={close} booking={b} person={idPerson} onDone={done} />
      <WhatsAppDialog open={dialog === "wa"} onClose={close} booking={b} kind={waKind} onSent={() => void api<FullBooking>("bookings.get", { id: b.id }).then(done)} />
      <Confirm open={dialog === "undo"} onClose={close} title="Undo check-in?" message="The booking goes back to “Booked”, as if the guest had not arrived yet." confirmText="Undo check-in" loading={busy} onConfirm={() => simple("bookings.undoCheckIn", "Check-in undone")} />
      <Confirm
        open={dialog === "delete"}
        onClose={close}
        danger
        title="Delete this booking?"
        message="The booking, its payments and extras are removed for good. Use Cancel instead if you want to keep a record."
        confirmText="Delete for good"
        loading={busy}
        onConfirm={async () => {
          try {
            await api("bookings.delete", { id: b.id });
            toast("Booking deleted");
            navigate("/bookings");
          } catch (e) {
            toast(errorText(e), "error");
          }
        }}
      />
    </Page>
  );
}

function MenuBtn({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-slate-50 [&>svg]:size-4", danger ? "text-red-600 [&>svg]:text-red-500" : "text-slate-700 [&>svg]:text-slate-400")}>
      {icon}
      {children}
    </button>
  );
}

// Printouts in their own window: GST tax invoice / proforma bill, booking confirmation, guest
// registration card, payment receipt and the GST invoice register. Print or save as PDF.
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { FileDown, Printer, X } from "lucide-react";
import { api, bridge } from "../api";
import { Button, Loading } from "../components/ui";
import { amountInWords } from "../../shared/words";
import { clockLabel, formatDate, formatDateTime, todayKey } from "../../shared/dates";
import { INDIAN_STATES, label, money2, sacFor } from "../../shared/format";
import type { FullBooking, Settings } from "../../shared/types";

export function PrintView() {
  const { kind = "invoice", id = "" } = useParams();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [booking, setBooking] = useState<FullBooking | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<Settings>("settings.get").then(setSettings);
    if (kind !== "gst") void api<FullBooking>("bookings.get", { id }).then(setBooking).catch((e) => setError(String(e.message ?? e)));
  }, [kind, id]);
  useEffect(() => {
    document.body.classList.add("print-body");
    document.body.style.overflow = "auto";
  }, []);
  const title = kind === "invoice" ? (booking?.bill ? `Invoice ${booking.bill.invoiceNumber}` : `Bill ${booking?.number ?? ""}`) : kind === "grc" ? `Registration card ${booking?.number ?? ""}` : kind === "confirmation" ? `Booking confirmation ${booking?.number ?? ""}` : kind === "receipt" ? `Receipt ${booking?.number ?? ""}` : `GST register ${id}`;
  useEffect(() => {
    document.title = title;
  }, [title]);

  if (error) return <p className="p-8 text-red-600">{error}</p>;
  if (!settings || (kind !== "gst" && !booking)) return <Loading />;
  return (
    <div className="min-h-full bg-slate-200 pb-10">
      <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-slate-300 bg-white px-4 py-2 shadow-sm">
        <span className="mr-auto text-[13px] font-medium text-slate-700">{title}</span>
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => void bridge().print()}>
          Print
        </Button>
        <Button icon={<FileDown className="size-4" />} onClick={() => void bridge().savePdf(title)}>
          Save as PDF
        </Button>
        <Button variant="ghost" icon={<X className="size-4" />} onClick={() => window.close()}>
          Close
        </Button>
      </div>
      <div className="print-page mx-auto mt-6 w-[210mm] min-h-[297mm] bg-white px-[14mm] py-[12mm] text-[12.5px] text-slate-900 shadow-lg">
        {kind === "invoice" && <Invoice b={booking!} s={settings} />}
        {kind === "confirmation" && <Confirmation b={booking!} s={settings} />}
        {kind === "grc" && <Registration b={booking!} s={settings} />}
        {kind === "receipt" && <Receipt b={booking!} s={settings} />}
        {kind === "gst" && <GstRegister range={id} s={settings} />}
      </div>
    </div>
  );
}

function Header({ s, title, sub }: { s: Settings; title: string; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
      <div>
        <h1 className="text-[22px] leading-tight font-bold">{s.hotelName}</h1>
        {s.legalName && s.legalName !== s.hotelName && <p className="text-[12px]">{s.legalName}</p>}
        {s.tagline && <p className="text-[12px] text-slate-600">{s.tagline}</p>}
        <p className="mt-1 text-slate-700">{[s.address, s.city, s.state, s.pinCode].filter(Boolean).join(", ")}</p>
        <p className="text-slate-700">{[s.phone && `Phone ${s.phone}`, s.email].filter(Boolean).join(" · ")}</p>
        {s.gstin && (
          <p className="font-semibold">
            GSTIN: {s.gstin}
            {INDIAN_STATES[s.gstin.slice(0, 2)] ? ` · State: ${INDIAN_STATES[s.gstin.slice(0, 2)]} (${s.gstin.slice(0, 2)})` : ""}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[17px] font-bold tracking-wide uppercase">{title}</p>
        {sub && <div className="text-slate-600">{sub}</div>}
      </div>
    </div>
  );
}

function Info({ l, children }: { l: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-[1px]">
      <span className="w-28 shrink-0 text-slate-500">{l}</span>
      <span className="font-medium">{children || "—"}</span>
    </div>
  );
}

function useUpiQr(s: Settings, amount: number, note: string) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!s.upiId || !/^[\w.-]+@[\w.-]+$/.test(s.upiId) || amount < 1) return setSvg(null);
    const link = `upi://pay?pa=${encodeURIComponent(s.upiId)}&pn=${encodeURIComponent(s.upiName || s.hotelName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
    void QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg);
  }, [s, amount, note]);
  return svg;
}

function PayQr({ s, amount, note }: { s: Settings; amount: number; note: string }) {
  const svg = useUpiQr(s, amount, note);
  if (!svg) return null;
  return (
    <div className="mt-5 flex items-center gap-4 rounded-lg border border-slate-300 p-3">
      <div className="size-28 shrink-0" dangerouslySetInnerHTML={{ __html: svg }} />
      <div>
        <p className="text-[14px] font-bold">Scan to pay {money2(amount, s.currency)} by UPI</p>
        <p className="text-slate-600">Google Pay, PhonePe, Paytm, BHIM or any UPI app</p>
        <p className="text-slate-600">
          UPI ID: <b>{s.upiId}</b>
        </p>
      </div>
    </div>
  );
}

function Invoice({ b, s }: { b: FullBooking; s: Settings }) {
  const f = b.folio;
  const cur = s.currency;
  const final = !!b.bill;
  const half = (n: number) => Math.round((n / 2) * 100) / 100;
  const pos = s.state || (s.gstin ? INDIAN_STATES[s.gstin.slice(0, 2)] : "");
  return (
    <>
      <Header s={s} title={final ? (s.taxMode === "none" ? "Invoice" : "Tax Invoice") : "Proforma Bill"} sub={final ? <>No. <b>{b.bill!.invoiceNumber}</b><br />Date {formatDate(b.bill!.invoiceDate)}</> : <>Not a tax invoice<br />Stay in progress · {formatDate(todayKey())}</>} />
      <div className="mt-3 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Billed to</p>
          <p className="text-[14px] font-semibold">{b.guest.company || b.guestName}</p>
          {b.guest.company && <p>Guest: {b.guestName}</p>}
          {(b.guest.address || b.guest.city) && <p>{[b.guest.address, b.guest.city, b.guest.state, b.guest.pinCode].filter(Boolean).join(", ")}</p>}
          <p>{b.guest.phone}</p>
          {b.guest.gstin && <p className="font-semibold">GSTIN: {b.guest.gstin}</p>}
        </div>
        <div>
          <Info l="Booking no.">#{b.number}</Info>
          <Info l="Room">
            {b.room.roomNumber} ({label(b.room.type)})
          </Info>
          <Info l="Arrival">{b.actualCheckIn ? formatDateTime(b.actualCheckIn) : formatDate(b.checkInDate)}</Info>
          <Info l="Departure">{b.actualCheckOut ? formatDateTime(b.actualCheckOut) : formatDate(b.checkOutDate)}</Info>
          <Info l="Guests">
            {b.adults} adult(s){b.children ? `, ${b.children} child(ren)` : ""}
          </Info>
          {pos && <Info l="Place of supply">{pos}</Info>}
        </div>
      </div>
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1.5 pr-2">Description</th>
            <th className="py-1.5 pr-2">SAC</th>
            <th className="py-1.5 pr-2 text-right">Qty</th>
            <th className="py-1.5 pr-2 text-right">Rate</th>
            <th className="py-1.5 pr-2 text-right">GST %</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-2">
              Room accommodation — Room {b.room.roomNumber}
              <span className="block text-[11px] text-slate-500">
                {formatDate(b.checkInDate)} to {formatDate(b.checkOutDate)}
              </span>
            </td>
            <td className="pr-2">996311</td>
            <td className="pr-2 text-right">{f.nightCount} night(s)</td>
            <td className="pr-2 text-right">{money2(f.nightCount ? f.roomTotal / f.nightCount : 0, cur)}</td>
            <td className="pr-2 text-right">{f.roomTaxRate}%</td>
            <td className="text-right">{money2(f.roomTotal, cur)}</td>
          </tr>
          {f.discount > 0 && (
            <tr className="border-b border-slate-200">
              <td className="py-1.5 pr-2">Less: discount</td>
              <td colSpan={4} />
              <td className="text-right">− {money2(f.discount, cur)}</td>
            </tr>
          )}
          {b.charges.map((c) => (
            <tr key={c.id} className="border-b border-slate-200">
              <td className="py-1.5 pr-2">
                {c.description} <span className="text-[11px] text-slate-500">({formatDate(c.date)})</span>
              </td>
              <td className="pr-2">{sacFor(c.category)}</td>
              <td className="pr-2 text-right">{c.quantity}</td>
              <td className="pr-2 text-right">{money2(c.unitPrice, cur)}</td>
              <td className="pr-2 text-right">{f.extrasTaxRate}%</td>
              <td className="text-right">{money2(c.amount, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex justify-end">
        <table className="w-80">
          <tbody>
            <tr>
              <td className="py-0.5">Taxable value</td>
              <td className="text-right">{money2(f.roomAfterDiscount + f.extrasTotal, cur)}</td>
            </tr>
            {f.roomTax > 0 && (
              <>
                <tr>
                  <td className="py-0.5">CGST on room @ {f.roomTaxRate / 2}%</td>
                  <td className="text-right">{money2(half(f.roomTax), cur)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">SGST on room @ {f.roomTaxRate / 2}%</td>
                  <td className="text-right">{money2(f.roomTax - half(f.roomTax), cur)}</td>
                </tr>
              </>
            )}
            {f.extrasTax > 0 && (
              <>
                <tr>
                  <td className="py-0.5">CGST on extras @ {f.extrasTaxRate / 2}%</td>
                  <td className="text-right">{money2(half(f.extrasTax), cur)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">SGST on extras @ {f.extrasTaxRate / 2}%</td>
                  <td className="text-right">{money2(f.extrasTax - half(f.extrasTax), cur)}</td>
                </tr>
              </>
            )}
            <tr className="border-y border-slate-800 text-[14px] font-bold">
              <td className="py-1.5">Total</td>
              <td className="text-right">{money2(f.grandTotal, cur)}</td>
            </tr>
            <tr>
              <td className="py-0.5">Paid</td>
              <td className="text-right">{money2(f.netPaid, cur)}</td>
            </tr>
            {Math.abs(f.balance) >= 0.5 && (
              <tr className="font-bold">
                <td className="py-0.5">{f.balance >= 0 ? "Balance due" : "Refund due"}</td>
                <td className="text-right">{money2(Math.abs(f.balance), cur)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2">
        <span className="text-slate-500">Amount in words:</span> <b>{amountInWords(f.grandTotal, cur)}</b>
      </p>
      {b.payments.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Payments</p>
          {b.payments.map((p) => (
            <p key={p.id} className="flex justify-between border-b border-slate-100 py-0.5">
              <span>
                {formatDateTime(p.paidAt)} · {label(p.method)}
                {p.reference ? ` · ${p.reference}` : ""}
                {p.type === "refund" ? " (refund)" : ""}
              </span>
              <span>
                {p.type === "refund" ? "− " : ""}
                {money2(p.amount, cur)}
              </span>
            </p>
          ))}
        </div>
      )}
      {f.balance >= 1 && <PayQr s={s} amount={f.balance} note={`Booking ${b.number}`} />}
      <div className="mt-12 flex items-end justify-between">
        <p className="text-[11px] text-slate-500">{s.taxMode !== "none" ? "Tax is not payable on reverse charge basis. " : ""}This is a computer generated invoice.</p>
        <div className="text-center">
          <div className="mb-1 h-10" />
          <p className="border-t border-slate-400 px-6 pt-1">For {s.legalName || s.hotelName}</p>
          <p className="text-[11px] text-slate-500">Authorised signatory</p>
        </div>
      </div>
    </>
  );
}

function Confirmation({ b, s }: { b: FullBooking; s: Settings }) {
  const f = b.folio;
  const cur = s.currency;
  return (
    <>
      <Header s={s} title="Booking Confirmation" sub={<>Booking #{b.number}<br />{formatDate(b.createdAt)}</>} />
      <p className="mt-5 text-[14px]">Dear {b.guestName},</p>
      <p className="mt-1">Thank you for choosing {s.hotelName}. Your booking is confirmed:</p>
      <div className="mt-4 grid grid-cols-2 gap-x-8 rounded-lg border border-slate-300 p-4 text-[13px]">
        <Info l="Guest">{b.guestName}</Info>
        <Info l="Phone">{b.guest.phone}</Info>
        <Info l="Arrival">
          {formatDate(b.checkInDate)}, from {clockLabel(s.checkInTime)}
        </Info>
        <Info l="Departure">
          {formatDate(b.checkOutDate)}, by {clockLabel(s.checkOutTime)}
        </Info>
        <Info l="Nights">{f.nightCount}</Info>
        <Info l="Room">{label(b.room.type)}</Info>
        <Info l="Guests">
          {b.adults} adult(s){b.children ? `, ${b.children} child(ren)` : ""}
        </Info>
        <Info l="Booked via">{label(b.source)}</Info>
      </div>
      <div className="mt-4 ml-auto w-80">
        <div className="flex justify-between py-0.5">
          <span>Room charges</span>
          <span>{money2(f.roomAfterDiscount, cur)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>GST</span>
          <span>{money2(f.roomTax, cur)}</span>
        </div>
        <div className="flex justify-between border-y border-slate-800 py-1 text-[14px] font-bold">
          <span>Total</span>
          <span>{money2(f.grandTotal, cur)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Advance paid</span>
          <span>{money2(f.netPaid, cur)}</span>
        </div>
        <div className="flex justify-between py-0.5 font-bold">
          <span>Balance at the hotel</span>
          <span>{money2(Math.max(0, f.balance), cur)}</span>
        </div>
      </div>
      {f.balance >= 1 && <PayQr s={s} amount={f.balance} note={`Booking ${b.number}`} />}
      {s.bookingTerms && (
        <div className="mt-6">
          <p className="mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Please note</p>
          <p className="whitespace-pre-wrap text-slate-700">{s.bookingTerms}</p>
        </div>
      )}
      <p className="mt-6">We look forward to welcoming you. For any questions please call {s.phone}.</p>
    </>
  );
}

function Registration({ b, s }: { b: FullBooking; s: Settings }) {
  const g = b.guest;
  const foreign = g.nationality.toLowerCase() !== "indian";
  const line = (l: string, v: ReactNode) => (
    <div className="flex border-b border-slate-300 py-1.5">
      <span className="w-40 shrink-0 text-slate-500">{l}</span>
      <span className="font-medium">{v || ""}</span>
    </div>
  );
  return (
    <>
      <Header s={s} title="Guest Registration Card" sub={<>Booking #{b.number}<br />Room {b.room.roomNumber}</>} />
      <div className="mt-4 grid grid-cols-2 gap-x-8">
        <div>
          {line("Name", b.guestName)}
          {line("Mobile", g.phone)}
          {line("Email", g.email)}
          {line("Address", [g.address, g.city, g.state, g.pinCode].filter(Boolean).join(", "))}
          {line("Nationality", g.nationality)}
          {line("Date of birth", g.dateOfBirth ? formatDate(g.dateOfBirth) : "")}
          {line("Company", g.company)}
          {line("Company GSTIN", g.gstin)}
        </div>
        <div>
          {line("Room", `${b.room.roomNumber} (${label(b.room.type)})`)}
          {line("Arrival", b.actualCheckIn ? formatDateTime(b.actualCheckIn) : formatDate(b.checkInDate))}
          {line("Departure", formatDate(b.checkOutDate))}
          {line("Guests", `${b.adults} adult(s)${b.children ? `, ${b.children} child(ren)` : ""}`)}
          {line("Coming from", b.comingFrom)}
          {line("Going to", b.goingTo)}
          {line("Purpose of visit", b.purpose)}
          {line("Vehicle no.", b.vehicleNumber)}
        </div>
      </div>
      {foreign && (
        <div className="mt-4">
          <p className="mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Foreign national (Form C)</p>
          <div className="grid grid-cols-2 gap-x-8">
            <div>{line("Passport no.", g.passportNo)}</div>
            <div>{line("Visa no.", g.visaNo)}</div>
          </div>
        </div>
      )}
      <div className="mt-4">
        <p className="mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Persons staying & ID seen</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-slate-800 text-left">
              <th className="py-1">#</th>
              <th>Name</th>
              <th>ID shown</th>
              <th>Checked by</th>
            </tr>
          </thead>
          <tbody>
            {[b.guestName, ...b.companions.map((c) => c.name), ...Array(Math.max(0, b.adults - 1 - b.companions.length)).fill("")].map((n, i) => {
              const c = n ? b.idChecks.find((x) => x.person.toLowerCase() === n.toLowerCase()) : undefined;
              return (
                <tr key={i} className="border-b border-slate-300">
                  <td className="py-2">{i + 1}</td>
                  <td>{n}</td>
                  <td>{c ? `${label(c.idType)}${c.idLast4 ? ` (ending ${c.idLast4})` : ""}` : ""}</td>
                  <td>{c?.checkedBy ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.bookingTerms && <p className="mt-4 text-[11.5px] whitespace-pre-wrap text-slate-600">{s.bookingTerms}</p>}
      <p className="mt-2 text-[11.5px] text-slate-600">I agree to the hotel's terms and confirm the details above are correct.</p>
      <div className="mt-14 flex justify-between">
        <p className="border-t border-slate-400 px-8 pt-1">Guest signature</p>
        <p className="border-t border-slate-400 px-8 pt-1">Front desk</p>
      </div>
    </>
  );
}

function Receipt({ b, s }: { b: FullBooking; s: Settings }) {
  const cur = s.currency;
  const paid = b.payments.filter((p) => p.type !== "refund").reduce((x, p) => x + p.amount, 0);
  return (
    <>
      <Header s={s} title="Payment Receipt" sub={<>Booking #{b.number}<br />{formatDate(todayKey())}</>} />
      <p className="mt-5">
        Received from <b>{b.guest.company || b.guestName}</b> for the stay in room {b.room.roomNumber} from {formatDate(b.checkInDate)} to {formatDate(b.checkOutDate)}:
      </p>
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1.5">Date</th>
            <th>Method</th>
            <th>Reference</th>
            <th>Received by</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {b.payments.map((p) => (
            <tr key={p.id} className="border-b border-slate-200">
              <td className="py-1.5">{formatDateTime(p.paidAt)}</td>
              <td>
                {label(p.method)}
                {p.type === "refund" ? " (refund)" : p.type === "advance" ? " (advance)" : ""}
              </td>
              <td>{p.reference}</td>
              <td>{p.receivedBy}</td>
              <td className="text-right">
                {p.type === "refund" ? "− " : ""}
                {money2(p.amount, cur)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 ml-auto w-72">
        <div className="flex justify-between font-bold">
          <span>Total received</span>
          <span>{money2(b.folio.netPaid, cur)}</span>
        </div>
        <div className="flex justify-between">
          <span>Bill total</span>
          <span>{money2(b.folio.grandTotal, cur)}</span>
        </div>
        <div className="flex justify-between">
          <span>Balance</span>
          <span>{money2(Math.max(0, b.folio.balance), cur)}</span>
        </div>
      </div>
      <p className="mt-3">
        <span className="text-slate-500">Amount received in words:</span> <b>{amountInWords(b.folio.netPaid || paid, cur)}</b>
      </p>
      <div className="mt-14 flex justify-end">
        <p className="border-t border-slate-400 px-8 pt-1">For {s.hotelName}</p>
      </div>
    </>
  );
}

interface GstData {
  rows: Array<{ id: string; invoiceNumber: string; invoiceDate: string; guestName: string; company: string | null; gstin: string | null; roomTaxable: number; extras: number; roomTax: number; extrasTax: number; totalAmount: number }>;
  byRate: Array<{ kind: string; rate: number; taxable: number; cgst: number; sgst: number; tax: number }>;
  totals: { invoices: number; taxable: number; tax: number; total: number };
}

function GstRegister({ range, s }: { range: string; s: Settings }) {
  const [from, to] = range.split("_");
  const [d, setD] = useState<GstData | null>(null);
  useEffect(() => void api<GstData>("reports.gst", { from, to }).then(setD), [from, to]);
  if (!d) return <Loading />;
  const cur = s.currency;
  return (
    <>
      <Header s={s} title="GST Invoice Register" sub={`${formatDate(from)} to ${formatDate(to)}`} />
      <table className="mt-4 w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1">Invoice</th>
            <th>Date</th>
            <th>Billed to</th>
            <th>GSTIN</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">CGST</th>
            <th className="text-right">SGST</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-200">
              <td className="py-1">{r.invoiceNumber}</td>
              <td>{formatDate(r.invoiceDate)}</td>
              <td>{r.company || r.guestName}</td>
              <td>{r.gstin}</td>
              <td className="text-right">{money2(r.roomTaxable + r.extras, cur)}</td>
              <td className="text-right">{money2((r.roomTax + r.extrasTax) / 2, cur)}</td>
              <td className="text-right">{money2((r.roomTax + r.extrasTax) / 2, cur)}</td>
              <td className="text-right">{money2(r.totalAmount, cur)}</td>
            </tr>
          ))}
          <tr className="border-y border-slate-800 font-bold">
            <td className="py-1" colSpan={4}>
              Total ({d.totals.invoices} invoices)
            </td>
            <td className="text-right">{money2(d.totals.taxable, cur)}</td>
            <td className="text-right">{money2(d.totals.tax / 2, cur)}</td>
            <td className="text-right">{money2(d.totals.tax / 2, cur)}</td>
            <td className="text-right">{money2(d.totals.total, cur)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-5 mb-1 text-[10.5px] font-bold text-slate-500 uppercase">Summary by rate</p>
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-slate-800 text-left">
            <th className="py-1">Supply</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Taxable</th>
            <th className="text-right">CGST</th>
            <th className="text-right">SGST</th>
          </tr>
        </thead>
        <tbody>
          {d.byRate.map((r) => (
            <tr key={r.kind + r.rate} className="border-b border-slate-200">
              <td className="py-1">{r.kind}</td>
              <td className="text-right">{r.rate}%</td>
              <td className="text-right">{money2(r.taxable, cur)}</td>
              <td className="text-right">{money2(r.cgst, cur)}</td>
              <td className="text-right">{money2(r.sgst, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

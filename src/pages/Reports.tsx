// Owner reports: occupancy, earnings, ADR/RevPAR, money received, sources, room types,
// and the GST invoice register for the accountant. Every table downloads for Excel.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Download, Printer } from "lucide-react";
import { api, bridge, saveCsv } from "../api";
import { useApp } from "../state";
import { Button, Empty, Input, Loading, Page, PageHeader, Panel, Row, Stat, Tabs, useLoad } from "../components/ui";
import { addDays, formatDate, formatShortDate, monthEnd, monthStart, todayKey } from "../../shared/dates";
import { label, money, money2, num, pct } from "../../shared/format";
import type { BookingRow } from "../../shared/types";

interface Day {
  date: string;
  roomsSold: number;
  occupancy: number;
  roomRevenue: number;
  extras: number;
  tax: number;
  total: number;
  arrivals: number;
  departures: number;
}
interface Summary {
  from: string;
  to: string;
  roomCount: number;
  days: Day[];
  totals: Record<string, number>;
  payByMethod: Record<string, number>;
  byType: Array<{ type: string; nights: number; revenue: number; adr: number }>;
  bySource: Array<{ source: string; bookings: number; nights: number; revenue: number }>;
  byCategory: Array<{ category: string; amount: number }>;
  outstanding: BookingRow[];
}
interface GstRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  number: number;
  guestName: string;
  company: string | null;
  gstin: string | null;
  roomNumber: string;
  nights: number;
  roomTaxable: number;
  roomTaxRate: number;
  roomTax: number;
  extras: number;
  extrasTaxRate: number;
  extrasTax: number;
  totalAmount: number;
  b2b: boolean;
  bookingId: string;
}
interface Gst {
  rows: GstRow[];
  byRate: Array<{ kind: string; rate: number; taxable: number; tax: number; cgst: number; sgst: number; invoices: number }>;
  totals: { invoices: number; b2b: number; taxable: number; tax: number; total: number };
}

const BRAND = "#2a6fae";
const GRID = "#e2e8f0";
const AXIS = "#64748b";

function periods(today: string) {
  const lastMonth = addDays(monthStart(today), -1);
  const fyStart = Number(today.slice(5, 7)) >= 4 ? `${today.slice(0, 4)}-04-01` : `${Number(today.slice(0, 4)) - 1}-04-01`;
  return [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart(today), to: monthEnd(today) },
    { label: "Last month", from: monthStart(lastMonth), to: lastMonth },
    { label: "Last 30 days", from: addDays(today, -29), to: today },
    { label: "This financial year", from: fyStart, to: today },
  ];
}

export function Reports() {
  const today = todayKey();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(monthEnd(today));
  const [tab, setTab] = useState<"overview" | "daily" | "gst" | "due">("overview");
  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle={`${formatDate(from)} to ${formatDate(to)}`}
        actions={
          <>
            {periods(today).map((p) => (
              <Button key={p.label} size="sm" variant={p.from === from && p.to === to ? "primary" : "secondary"} onClick={() => (setFrom(p.from), setTo(p.to))}>
                {p.label}
              </Button>
            ))}
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-7 w-36 text-[12.5px]" />
            <span className="text-slate-400">–</span>
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-7 w-36 text-[12.5px]" />
          </>
        }
      />
      <Tabs
        className="mb-4"
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "daily", label: "Day by day" },
          { value: "gst", label: "GST invoices" },
          { value: "due", label: "Money due" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "gst" ? <GstReport from={from} to={to} /> : <SummaryReport from={from} to={to} tab={tab} />}
    </Page>
  );
}

function SummaryReport({ from, to, tab }: { from: string; to: string; tab: "overview" | "daily" | "due" }) {
  const { settings } = useApp();
  const navigate = useNavigate();
  const cur = settings?.currency;
  const { data, error } = useLoad(() => api<Summary>("reports.summary", { from, to }), [from, to]);
  if (error) return <Empty title={error} />;
  if (!data) return <Loading />;
  const t = data.totals;
  const chartDays = data.days.map((d) => ({ ...d, label: formatShortDate(d.date).slice(4) }));

  if (tab === "due")
    return (
      <Panel
        title={`Guests who still owe money (${data.outstanding.length})`}
        subtitle="Checked out or staying, with a balance — all dates"
        padded={false}
        actions={
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => saveCsv("money-due.csv", ["Booking", "Guest", "Phone", "Room", "Arrival", "Leaving", "Status", "Total", "Paid", "Balance"], data.outstanding.map((b) => [b.number, b.guestName, b.guestPhone, b.roomNumber, b.checkInDate, b.checkOutDate, label(b.status), b.total, b.paid, b.balance]))}>
            Excel (CSV)
          </Button>
        }
      >
        {data.outstanding.length === 0 ? (
          <Empty title="Nobody owes money" />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Guest</th>
                <th>Phone</th>
                <th>Stay</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th className="num">Paid</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.outstanding.map((b) => (
                <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
                  <td className="text-brand-700">#{b.number}</td>
                  <td>{b.guestName}</td>
                  <td>{b.guestPhone}</td>
                  <td>
                    {formatShortDate(b.checkInDate)} → {formatShortDate(b.checkOutDate)}
                  </td>
                  <td>{label(b.status)}</td>
                  <td className="num">{money(b.total, cur)}</td>
                  <td className="num">{money(b.paid, cur)}</td>
                  <td className="num font-medium text-red-600">{money(b.balance, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    );

  if (tab === "daily")
    return (
      <Panel
        title="Day by day"
        padded={false}
        actions={
          <Button size="sm" icon={<Download className="size-3.5" />} onClick={() => saveCsv(`daily-${from}-to-${to}.csv`, ["Date", "Rooms sold", "Occupancy %", "Room earnings", "Extras", "GST", "Total", "Arrivals", "Departures"], data.days.map((d) => [d.date, d.roomsSold, Math.round(d.occupancy * 10) / 10, d.roomRevenue, d.extras, d.tax, d.total, d.arrivals, d.departures]))}>
            Excel (CSV)
          </Button>
        }
      >
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Rooms sold</th>
                <th className="num">Occupancy</th>
                <th className="num">Room earnings</th>
                <th className="num">Extras</th>
                <th className="num">GST</th>
                <th className="num">Total</th>
                <th className="num">Arrivals</th>
                <th className="num">Departures</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <td>{formatShortDate(d.date)}</td>
                  <td className="num">
                    {d.roomsSold} / {data.roomCount}
                  </td>
                  <td className="num">{pct(d.occupancy)}</td>
                  <td className="num">{money(d.roomRevenue, cur)}</td>
                  <td className="num">{money(d.extras, cur)}</td>
                  <td className="num">{money(d.tax, cur)}</td>
                  <td className="num font-medium">{money(d.total, cur)}</td>
                  <td className="num">{d.arrivals}</td>
                  <td className="num">{d.departures}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="num px-3">{t.roomNights}</td>
                <td className="num px-3">{pct(t.occupancy)}</td>
                <td className="num px-3">{money(t.roomRevenue, cur)}</td>
                <td className="num px-3">{money(t.extras, cur)}</td>
                <td className="num px-3">{money(t.tax, cur)}</td>
                <td className="num px-3">{money(t.revenueWithTax, cur)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    );

  const maxType = Math.max(1, ...data.byType.map((x) => x.revenue));
  const maxSource = Math.max(1, ...data.bySource.map((x) => x.revenue));
  const methods = Object.entries(data.payByMethod).sort((a, b) => b[1] - a[1]);
  const maxMethod = Math.max(1, ...methods.map((m) => m[1]));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Occupancy" value={pct(t.occupancy)} sub={`${num(t.roomNights)} of ${num(t.available)} room-nights`} />
        <Stat label="Room earnings" value={money(t.roomRevenue, cur)} sub="Before GST, after discounts" />
        <Stat label="Average room price (ADR)" value={money(t.adr, cur)} sub="Per room sold per night" />
        <Stat label="Earnings per room (RevPAR)" value={money(t.revpar, cur)} sub="Per available room per night" />
        <Stat label="Extras (food, laundry…)" value={money(t.extras, cur)} sub={`GST collected ${money(t.tax, cur)}`} />
        <Stat label="Money received" value={money(t.netReceived, cur)} sub={t.refunded ? `after ${money(t.refunded, cur)} refunds` : "No refunds"} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Room earnings per day" subtitle="Before GST">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartDays} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => money(v as number, cur)} />
                <Tooltip cursor={{ fill: "rgba(42,111,174,0.08)" }} formatter={(v) => [money2(Number(v), cur), "Room earnings"]} labelFormatter={(_, p) => (p?.[0] ? formatDate((p[0].payload as Day).date) : "")} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} />
                <Bar dataKey="roomRevenue" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Occupancy per night" subtitle="% of rooms sold">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDays} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v, _n, p) => [`${pct(Number(v))} (${(p.payload as Day).roomsSold} rooms)`, "Occupancy"]} labelFormatter={(_, p) => (p?.[0] ? formatDate((p[0].payload as Day).date) : "")} contentStyle={{ fontSize: 12, borderRadius: 6, borderColor: GRID }} />
                <Line type="monotone" dataKey="occupancy" stroke={BRAND} strokeWidth={2} dot={chartDays.length <= 31 ? { r: 3, fill: BRAND, strokeWidth: 0 } : false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Room types">
          {data.byType.length === 0 && <p className="text-[13px] text-slate-400">No stays in these dates</p>}
          {data.byType.map((x) => (
            <BarLine key={x.type} name={label(x.type)} value={money(x.revenue, cur)} sub={`${x.nights} nights · avg ${money(x.adr, cur)}`} frac={x.revenue / maxType} />
          ))}
        </Panel>
        <Panel title="Where bookings come from">
          {data.bySource.length === 0 && <p className="text-[13px] text-slate-400">No stays in these dates</p>}
          {data.bySource.map((x) => (
            <BarLine key={x.source} name={label(x.source)} value={money(x.revenue, cur)} sub={`${x.bookings} bookings · ${x.nights} nights`} frac={x.revenue / maxSource} />
          ))}
        </Panel>
        <Panel title="Money received by method">
          {methods.length === 0 && <p className="text-[13px] text-slate-400">No payments in these dates</p>}
          {methods.map(([m, v]) => (
            <BarLine key={m} name={label(m)} value={money(v, cur)} frac={v / maxMethod} />
          ))}
          <div className="mt-3 border-t border-slate-100 pt-2">
            <Row label="Received">{money(t.received, cur)}</Row>
            <Row label="Refunded">− {money(t.refunded, cur)}</Row>
            <Row label="Net" strong>
              {money(t.netReceived, cur)}
            </Row>
          </div>
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Bookings & guests">
          <Row label="Bookings made in these dates">{t.bookingsMade}</Row>
          <Row label="Guests who stayed">{t.guests}</Row>
          <Row label="New guests">{t.newGuests}</Row>
          <Row label="Cancelled">{t.cancelled}</Row>
          <Row label="No-shows">{t.noShows}</Row>
        </Panel>
        <Panel title="Earnings">
          <Row label="Room earnings">{money2(t.roomRevenue, cur)}</Row>
          <Row label="Extras">{money2(t.extras, cur)}</Row>
          <Row label="GST on rooms">{money2(t.roomTax, cur)}</Row>
          <Row label="GST on extras">{money2(t.extrasTax, cur)}</Row>
          <Row label="Total with GST" strong>
            {money2(t.revenueWithTax, cur)}
          </Row>
          <Row label="Money still due (all dates)" className="text-red-600">
            {money2(t.outstanding, cur)}
          </Row>
        </Panel>
        <Panel title="Extras by kind">
          {data.byCategory.length === 0 && <p className="text-[13px] text-slate-400">No extras in these dates</p>}
          {data.byCategory.map((c) => (
            <Row key={c.category} label={label(c.category)}>
              {money(c.amount, cur)}
            </Row>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function BarLine({ name, value, sub, frac }: { name: string; value: ReactNode; sub?: string; frac: number }) {
  return (
    <div className="py-1.5">
      <div className="flex justify-between text-[13px]">
        <span className="text-slate-700">{name}</span>
        <span className="tabular font-medium text-slate-900">{value}</span>
      </div>
      <div className="mt-1 h-2 rounded bg-slate-100">
        <div className="h-2 rounded" style={{ width: `${Math.max(2, frac * 100)}%`, background: BRAND }} />
      </div>
      {sub && <p className="mt-0.5 text-[11.5px] text-slate-500">{sub}</p>}
    </div>
  );
}

function GstReport({ from, to }: { from: string; to: string }) {
  const { settings } = useApp();
  const navigate = useNavigate();
  const cur = settings?.currency;
  const { data } = useLoad(() => api<Gst>("reports.gst", { from, to }), [from, to]);
  if (!data) return <Loading />;
  const csv = () =>
    saveCsv(
      `gst-invoices-${from}-to-${to}.csv`,
      ["Invoice no", "Invoice date", "Booking", "Billed to", "Guest GSTIN", "Type", "Room", "Nights", "Room taxable value", "Room GST %", "Room CGST", "Room SGST", "Extras taxable value", "Extras GST %", "Extras CGST", "Extras SGST", "Invoice total", "Place of supply"],
      data.rows.map((r) => [r.invoiceNumber, r.invoiceDate, r.number, r.company || r.guestName, r.gstin, r.b2b ? "B2B" : "B2C", r.roomNumber, r.nights, r.roomTaxable, r.roomTaxRate, Math.round((r.roomTax / 2) * 100) / 100, Math.round((r.roomTax - r.roomTax / 2) * 100) / 100, r.extras, r.extrasTaxRate, Math.round((r.extrasTax / 2) * 100) / 100, Math.round((r.extrasTax - r.extrasTax / 2) * 100) / 100, r.totalAmount, settings?.state])
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="Invoices" value={data.totals.invoices} sub={`${data.totals.b2b} to companies (B2B)`} />
        <Stat label="Taxable value" value={money2(data.totals.taxable, cur)} />
        <Stat label="CGST" value={money2(data.totals.tax / 2, cur)} />
        <Stat label="SGST" value={money2(data.totals.tax / 2, cur)} />
        <Stat label="Invoice total" value={money2(data.totals.total, cur)} />
      </div>
      <Panel title="GST by rate" subtitle="For GSTR-3B. Accommodation SAC 996311, food 996331. Place of supply: where the hotel is.">
        <table className="tbl">
          <thead>
            <tr>
              <th>Supply</th>
              <th className="num">GST rate</th>
              <th className="num">Invoices</th>
              <th className="num">Taxable value</th>
              <th className="num">CGST</th>
              <th className="num">SGST</th>
              <th className="num">Total GST</th>
            </tr>
          </thead>
          <tbody>
            {data.byRate.map((r) => (
              <tr key={`${r.kind}${r.rate}`}>
                <td>{r.kind}</td>
                <td className="num">{r.rate}%</td>
                <td className="num">{r.invoices}</td>
                <td className="num">{money2(r.taxable, cur)}</td>
                <td className="num">{money2(r.cgst, cur)}</td>
                <td className="num">{money2(r.sgst, cur)}</td>
                <td className="num font-medium">{money2(r.tax, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel
        title="Invoice register"
        subtitle="For GSTR-1 and your accountant"
        padded={false}
        actions={
          <>
            <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => void bridge().openPrint(`/print/gst/${from}_${to}`)}>
              Print
            </Button>
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={csv} disabled={!data.rows.length}>
              Excel (CSV)
            </Button>
          </>
        }
      >
        {data.rows.length === 0 ? (
          <Empty icon={<BarChart3 />} title="No invoices in these dates" text="An invoice is made when a guest checks out." />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Billed to</th>
                  <th>GSTIN</th>
                  <th className="num">Taxable</th>
                  <th className="num">GST %</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => navigate(`/bookings/${r.bookingId}`)}>
                    <td className="font-medium">{r.invoiceNumber}</td>
                    <td>{formatDate(r.invoiceDate)}</td>
                    <td>{r.company || r.guestName}</td>
                    <td className="font-mono text-[12px]">{r.gstin || "—"}</td>
                    <td className="num">{money2(r.roomTaxable + r.extras, cur)}</td>
                    <td className="num">
                      {r.roomTaxRate}%{r.extras ? ` / ${r.extrasTaxRate}%` : ""}
                    </td>
                    <td className="num">{money2((r.roomTax + r.extrasTax) / 2, cur)}</td>
                    <td className="num">{money2((r.roomTax + r.extrasTax) / 2, cur)}</td>
                    <td className="num font-medium">{money2(r.totalAmount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

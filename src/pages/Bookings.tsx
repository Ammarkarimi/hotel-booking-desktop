// All bookings: upcoming, staying now, checked out, cancelled and unpaid, with search.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BedDouble, Crown, Download, Plus, Search } from "lucide-react";
import { api, saveCsv } from "../api";
import { useApp } from "../state";
import { Button, Empty, Input, Loading, Page, PageHeader, PayBadge, Select, StatusBadge, Tabs, useLoad } from "../components/ui";
import { formatDate, formatShortDate, nightsBetween } from "../../shared/dates";
import { SOURCES, label, money } from "../../shared/format";
import type { BookingRow } from "../../shared/types";

type View = "upcoming" | "staying" | "past" | "cancelled" | "unpaid" | "all";
const VIEWS: Array<{ value: View; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "staying", label: "Staying now" },
  { value: "past", label: "Checked out" },
  { value: "unpaid", label: "Money due" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

export function Bookings() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const [params, setParams] = useSearchParams();
  const initialSearch = params.get("search") ?? "";
  const [view, setView] = useState<View>(initialSearch ? "all" : ((params.get("view") as View) ?? "upcoming"));
  const [search, setSearch] = useState(initialSearch);
  const [query, setQuery] = useState(initialSearch);
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    const s = params.get("search");
    if (s !== null) {
      setSearch(s);
      setQuery(s);
      setView("all");
    }
  }, [params]);
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, loading } = useLoad(() => api<BookingRow[]>("bookings.list", { view, search: query, source: source || undefined, from: from || undefined, to: to || undefined }), [view, query, source, from, to]);
  const cur = settings?.currency;
  const rows = data ?? [];

  const exportCsv = () =>
    saveCsv(
      `bookings-${view}.csv`,
      ["Booking no", "Guest", "Phone", "Room", "Room type", "Arrival", "Leaving", "Nights", "Adults", "Children", "Source", "Booking site ref", "Status", "Total", "Paid", "Balance", "Invoice"],
      rows.map((b) => [b.number, b.guestName, b.guestPhone, b.roomNumber, label(b.roomType), b.checkInDate, b.checkOutDate, nightsBetween(b.checkInDate, b.checkOutDate), b.adults, b.children, label(b.source), b.otaReference, label(b.status), b.total, b.paid, b.balance, b.invoiceNumber])
    );

  return (
    <Page>
      <PageHeader
        title="Bookings"
        subtitle="Click a booking to see the bill, take payments, check in or check out."
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!rows.length}>
              Excel (CSV)
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/bookings/new")}>
              New booking
            </Button>
          </>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="px-3 pt-1">
          <Tabs
            tabs={VIEWS}
            value={view}
            onChange={(v) => {
              setView(v);
              setParams({});
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, booking no., room, invoice" className="pl-8" />
          </div>
          <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-48" options={[{ value: "", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: label(s) }))]} />
          <span className="ml-2 text-[12.5px] text-slate-500">Dates</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span className="text-slate-400">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          {(from || to || source || search) && (
            <Button variant="ghost" size="sm" onClick={() => (setFrom(""), setTo(""), setSource(""), setSearch(""))}>
              Clear
            </Button>
          )}
          <span className="ml-auto text-[12.5px] text-slate-500">{rows.length} bookings</span>
        </div>
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={<BedDouble />} title="No bookings here" text={query ? "Try another name, number or phone." : undefined} />
        ) : (
          <div className="max-h-[calc(100vh-270px)] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Arrival</th>
                  <th>Leaving</th>
                  <th className="num">Nights</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
                    <td className="font-medium text-brand-700">#{b.number}</td>
                    <td>
                      <div className="flex items-center gap-1 font-medium">
                        {b.guestName}
                        {b.vip && <Crown className="size-3.5 text-amber-500" />}
                      </div>
                      <div className="text-[11.5px] text-slate-500">{b.guestPhone}</div>
                    </td>
                    <td>
                      <span className="font-semibold">{b.roomNumber}</span> <span className="text-[12px] text-slate-500">{label(b.roomType)}</span>
                    </td>
                    <td title={formatDate(b.checkInDate)}>{formatShortDate(b.checkInDate)}</td>
                    <td title={formatDate(b.checkOutDate)}>{formatShortDate(b.checkOutDate)}</td>
                    <td className="num">{nightsBetween(b.checkInDate, b.checkOutDate)}</td>
                    <td className="text-slate-600">{label(b.source)}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="num">{money(b.total, cur)}</td>
                    <td className="num">{b.status === "cancelled" || b.status === "no_show" ? "—" : b.balance >= 1 ? <span className="font-medium text-red-600">{money(b.balance, cur)}</span> : <PayBadge total={b.total} paid={b.paid} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}

// Today at a glance: who arrives and leaves, every room's state, money received and still due.
import { useNavigate } from "react-router-dom";
import { ShieldCheck, BedDouble, CalendarCheck, DoorOpen, IndianRupee, LogIn, LogOut, RefreshCw, Sparkles, Wrench, Crown } from "lucide-react";
import { api } from "../api";
import { useApp } from "../state";
import { Badge, Button, Empty, Loading, Page, Panel, PayBadge, Row, Stat, cx, useLoad } from "../components/ui";
import { formatDate, formatShortDate, formatTime, dayName, todayKey } from "../../shared/dates";
import { label, money } from "../../shared/format";
import type { BookingRow, Room } from "../../shared/types";
import { useState } from "react";
import { PathikDialog } from "../components/PathikDialog";

interface Dash {
  today: string;
  counts: { rooms: number; occupied: number; freeTonight: number; dirty: number; maintenance: number; arrivals: number; departures: number; staying: number; guestsInHouse: number };
  money: { received: number; refunded: number; byMethod: Record<string, number>; dueInHouse: number; dueCheckedOut: number };
  arrivals: BookingRow[];
  departures: BookingRow[];
  staying: BookingRow[];
  unpaidCheckedOut: BookingRow[];
  board: Array<{ room: Room; state: "free" | "occupied" | "leaving" | "arriving" | "maintenance"; booking: BookingRow | null }>;
  forecast: Array<{ date: string; sold: number; total: number }>;
  activity: Array<{ id: string; staffName: string; action: string; details: string | null; createdAt: string; bookingId: string | null }>;
}

const TILE: Record<string, string> = {
  free: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-400",
  occupied: "border-brand-200 bg-brand-50 hover:border-brand-400",
  leaving: "border-amber-300 bg-amber-50 hover:border-amber-400",
  arriving: "border-violet-200 bg-violet-50 hover:border-violet-400",
  maintenance: "border-slate-300 bg-slate-100 hover:border-slate-400",
};
const TILE_LABEL: Record<string, string> = { free: "Free", occupied: "Staying", leaving: "Leaving today", arriving: "Arriving", maintenance: "Maintenance" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Dashboard() {
  const { session, settings, can } = useApp();
  const navigate = useNavigate();
  const { data, loading, reload } = useLoad(() => api<Dash>("dashboard.get"), []);
  const pathik = useLoad(() => api<BookingRow[]>("pathik.pending"), [settings?.pathik]);
  const [pathikFor, setPathikFor] = useState<string | null>(null);
  const cur = settings?.currency;
  if (!data) return <Loading />;
  const c = data.counts;

  return (
    <Page>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold">
            {greeting()}, {session?.staff.name.split(" ")[0]}
          </h1>
          <p className="text-[13px] text-slate-500">
            {dayName(data.today)}, {formatDate(data.today)} · {c.staying} rooms staying, {c.guestsInHouse} guests in the hotel
          </p>
        </div>
        <Button variant="ghost" icon={<RefreshCw className={cx("size-4", loading && "animate-spin")} />} onClick={reload}>
          Refresh
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Arriving today" value={c.arrivals} icon={<LogIn />} tone="violet" sub={c.arrivals ? "Waiting to check in" : "No more arrivals"} />
        <Stat label="Leaving today" value={c.departures} icon={<LogOut />} tone="amber" sub={c.departures ? "To check out" : "All done"} />
        <Stat label="Rooms occupied" value={`${c.occupied} / ${c.rooms}`} icon={<BedDouble />} tone="blue" sub={`${c.rooms ? Math.round((c.occupied / c.rooms) * 100) : 0}% full now`} />
        <Stat label="Free tonight" value={c.freeTonight} icon={<DoorOpen />} tone="green" sub={c.maintenance ? `${c.maintenance} under maintenance` : "Ready to sell"} onClick={() => navigate("/calendar")} />
        <Stat label="Rooms to clean" value={c.dirty} icon={<Sparkles />} tone={c.dirty ? "red" : "green"} sub="Housekeeping" onClick={() => navigate("/housekeeping")} />
        <Stat label="Received today" value={money(data.money.received - data.money.refunded, cur)} icon={<IndianRupee />} tone="teal" sub={Object.entries(data.money.byMethod).map(([m, v]) => `${label(m)} ${money(v, cur)}`).join(" · ") || "No payments yet"} onClick={() => navigate("/payments")} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title={`Arriving today (${data.arrivals.length})`} padded={false} actions={<Button size="sm" onClick={() => navigate("/bookings?view=upcoming")}>All upcoming</Button>}>
            {data.arrivals.length === 0 ? (
              <Empty icon={<CalendarCheck />} title="No more arrivals today" />
            ) : (
              <BookingTable rows={data.arrivals} cur={cur} action={(b) => <Button size="sm" variant="primary" icon={<LogIn className="size-3.5" />} onClick={() => navigate(`/bookings/${b.id}?do=checkin`)}>Check in</Button>} navigate={navigate} showArrival />
            )}
          </Panel>
          <Panel title={`Leaving today (${data.departures.length})`} padded={false}>
            {data.departures.length === 0 ? (
              <Empty icon={<LogOut />} title="Nobody else is due to leave today" />
            ) : (
              <BookingTable rows={data.departures} cur={cur} action={(b) => <Button size="sm" variant="warning" icon={<LogOut className="size-3.5" />} onClick={() => navigate(`/bookings/${b.id}?do=checkout`)}>Check out</Button>} navigate={navigate} />
            )}
          </Panel>
          <Panel
            title="Rooms right now"
            actions={
              <div className="flex gap-3 text-[11.5px] text-slate-500">
                {Object.entries(TILE_LABEL).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className={cx("size-2.5 rounded-sm border", TILE[k])} /> {v}
                  </span>
                ))}
              </div>
            }
          >
            {data.board.length === 0 ? (
              <Empty icon={<DoorOpen />} title="No rooms yet" action={can("rooms") && <Button variant="primary" onClick={() => navigate("/rooms")}>Add rooms</Button>} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
                {data.board.map(({ room, state, booking }) => (
                  <button
                    key={room.id}
                    onClick={() => (booking ? navigate(`/bookings/${booking.id}`) : state === "free" ? navigate(`/bookings/new?room=${room.id}`) : navigate("/housekeeping"))}
                    className={cx("rounded-md border p-2 text-left transition-colors", TILE[state])}
                    title={booking ? `${booking.guestName} · #${booking.number}` : TILE_LABEL[state]}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-semibold text-slate-900">{room.roomNumber}</span>
                      {room.status === "maintenance" ? <Wrench className="size-3.5 text-slate-500" /> : room.housekeeping !== "clean" && <Sparkles className="size-3.5 text-red-500" />}
                    </div>
                    <p className="truncate text-[11.5px] text-slate-500">{label(room.type)}</p>
                    <p className="mt-1 truncate text-[12px] font-medium text-slate-700">{booking ? booking.guestName : TILE_LABEL[state]}</p>
                    {booking && state !== "arriving" && <p className="text-[11px] text-slate-500">till {formatShortDate(booking.checkOutDate)}</p>}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {settings?.pathik && (pathik.data?.length ?? 0) > 0 && (
            <Panel title={`Not entered in Pathik (${pathik.data!.length})`} subtitle="Police guest register" padded={false} actions={<ShieldCheck className="size-4 text-amber-500" />}>
              <ul className="divide-y divide-slate-100">
                {pathik.data!.slice(0, 8).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 px-4 py-2 text-[12.5px]">
                    <button className="min-w-0 text-left" onClick={() => navigate(`/bookings/${b.id}`)}>
                      <span className="block truncate font-medium text-slate-800">{b.guestName}</span>
                      <span className="text-slate-500">
                        Room {b.roomNumber} · {b.status === "checked_out" ? "left" : "staying"}
                      </span>
                    </button>
                    <Button size="sm" onClick={() => setPathikFor(b.id)}>
                      Fill in Pathik
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Money">
            <Row label="Received today">{money(data.money.received, cur)}</Row>
            {data.money.refunded > 0 && <Row label="Refunded today">− {money(data.money.refunded, cur)}</Row>}
            {Object.entries(data.money.byMethod).map(([m, v]) => (
              <Row key={m} label={<span className="pl-3">{label(m)}</span>}>{money(v, cur)}</Row>
            ))}
            <div className="my-2 border-t border-slate-100" />
            <Row label="To collect from guests staying" strong>{money(data.money.dueInHouse, cur)}</Row>
            <Row label="Unpaid after check-out">{money(data.money.dueCheckedOut, cur)}</Row>
            {data.unpaidCheckedOut.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.unpaidCheckedOut.slice(0, 5).map((b) => (
                  <button key={b.id} onClick={() => navigate(`/bookings/${b.id}`)} className="flex w-full justify-between rounded px-2 py-1 text-[12.5px] hover:bg-slate-50">
                    <span className="truncate">#{b.number} {b.guestName}</span>
                    <span className="tabular font-medium text-red-600">{money(b.balance, cur)}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Next 7 nights">
            <div className="space-y-1.5">
              {data.forecast.map((f) => {
                const p = f.total ? (f.sold / f.total) * 100 : 0;
                return (
                  <div key={f.date} className="flex items-center gap-2 text-[12.5px]">
                    <span className="w-[86px] shrink-0 text-slate-600">{formatShortDate(f.date)}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div className={cx("h-full rounded", p >= 85 ? "bg-emerald-500" : p >= 50 ? "bg-brand-500" : "bg-brand-300")} style={{ width: `${p}%` }} />
                    </div>
                    <span className="tabular w-[54px] text-right text-slate-700">
                      {f.sold}/{f.total}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Recent activity" padded={false}>
            <ul className="divide-y divide-slate-100">
              {data.activity.map((a) => (
                <li key={a.id} className={cx("px-4 py-2 text-[12.5px]", a.bookingId && "cursor-pointer hover:bg-slate-50")} onClick={() => a.bookingId && navigate(`/bookings/${a.bookingId}`)}>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-800">{a.action}</span>
                    <span className="shrink-0 text-slate-400">{formatTime(a.createdAt)}</span>
                  </div>
                  <p className="truncate text-slate-500">
                    {a.staffName}
                    {a.details ? ` · ${a.details}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      {pathikFor && <PathikDialog open onClose={() => setPathikFor(null)} bookingId={pathikFor} onChanged={pathik.reload} />}
    </Page>
  );
}

function BookingTable({ rows, cur, action, navigate, showArrival }: { rows: BookingRow[]; cur?: string; action: (b: BookingRow) => React.ReactNode; navigate: (to: string) => void; showArrival?: boolean }) {
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Room</th>
          <th>Guest</th>
          <th>{showArrival ? "Stay" : "Since"}</th>
          <th className="num">Bill</th>
          <th className="num">Balance</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
            <td>
              <span className="font-semibold">{b.roomNumber}</span> <span className="text-slate-500">{label(b.roomType)}</span>
            </td>
            <td>
              <div className="flex items-center gap-1.5 font-medium">
                {b.guestName} {b.vip && <Crown className="size-3.5 text-amber-500" />}
              </div>
              <div className="text-[11.5px] text-slate-500">
                #{b.number} · {b.guestPhone} · {label(b.source)}
              </div>
            </td>
            <td className="text-slate-600">
              {formatShortDate(b.checkInDate)} → {formatShortDate(b.checkOutDate)}
              {showArrival && b.checkInDate < todayKey() && <Badge tone="amber" className="ml-1">Late</Badge>}
            </td>
            <td className="num">{money(b.total, cur)}</td>
            <td className="num">
              {b.balance >= 1 ? <span className="font-medium text-red-600">{money(b.balance, cur)}</span> : <PayBadge total={b.total} paid={b.paid} />}
            </td>
            <td className="text-right" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-2">{action(b)}</div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


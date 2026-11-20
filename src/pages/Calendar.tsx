// The room calendar (tape chart): every room down the side, the days across. Click an empty
// box to book that room from that day; click a booking to open it.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Sparkles, Wrench } from "lucide-react";
import { api } from "../api";
import { useApp } from "../state";
import { Button, Loading, Page, PageHeader, Select, cx, useLoad } from "../components/ui";
import { addDays, dayName, diffDays, formatDate, isWeekendNight, todayKey } from "../../shared/dates";
import { label } from "../../shared/format";
import type { BookingRow, Room } from "../../shared/types";

type CalBooking = BookingRow & { displayOut: string };
const COLORS: Record<string, string> = {
  reserved: "bg-brand-500 border-brand-600 text-white",
  checked_in: "bg-emerald-500 border-emerald-600 text-white",
  checked_out: "bg-slate-300 border-slate-400 text-slate-700",
};

export function Calendar() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const today = todayKey();
  const [from, setFrom] = useState(addDays(today, -1));
  const [days, setDays] = useState(14);
  const [type, setType] = useState("");
  const { data, loading } = useLoad(() => api<{ rooms: Room[]; bookings: CalBooking[] }>("calendar.get", { from, days }), [from, days]);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)), [from, days]);
  const colW = days <= 14 ? 76 : days <= 21 ? 54 : 38;
  const rooms = (data?.rooms ?? []).filter((r) => !type || r.type === type);
  const types = [...new Set((data?.rooms ?? []).map((r) => r.type))];

  return (
    <Page className="max-w-none">
      <PageHeader
        title="Room calendar"
        subtitle="Blue: booked · Green: staying · Grey: checked out. Click an empty day to make a booking."
        actions={
          <>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44" options={[{ value: "", label: "All room types" }, ...types.map((t) => ({ value: t, label: label(t) }))]} />
            <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-32" options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "21", label: "21 days" }, { value: "31", label: "31 days" }]} />
            <Button icon={<ChevronLeft className="size-4" />} onClick={() => setFrom(addDays(from, -7))} />
            <Button onClick={() => setFrom(addDays(today, -1))}>Today</Button>
            <Button icon={<ChevronRight className="size-4" />} onClick={() => setFrom(addDays(from, 7))} />
            <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2 text-[13px]" />
          </>
        }
      />
      {!data && loading ? (
        <Loading />
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white" style={{ maxHeight: "calc(100vh - 190px)" }}>
          <div className="relative" style={{ width: 150 + colW * days }}>
            <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50">
              <div className="sticky left-0 z-30 w-[150px] shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Room</div>
              {dates.map((d) => (
                <div key={d} className={cx("shrink-0 border-r border-slate-100 py-1.5 text-center text-[11px] leading-tight", d === today ? "bg-brand-100 font-semibold text-brand-800" : isWeekendNight(d) ? "bg-amber-50/70 text-slate-600" : "text-slate-500")} style={{ width: colW }}>
                  <div>{dayName(d)}</div>
                  <div className="text-[13px] font-semibold text-slate-800">{Number(d.slice(8))}</div>
                  {(d.endsWith("-01") || d === from) && <div className="text-[10px]">{formatDate(d).split(" ")[1]}</div>}
                </div>
              ))}
            </div>
            {rooms.map((room) => {
              const list = (data?.bookings ?? []).filter((b) => b.roomId === room.id);
              return (
                <div key={room.id} className="relative flex h-12 border-b border-slate-100">
                  <div className="sticky left-0 z-10 flex w-[150px] shrink-0 items-center justify-between border-r border-slate-200 bg-white px-3">
                    <span>
                      <span className="font-semibold">{room.roomNumber}</span> <span className="text-[11.5px] text-slate-500">{label(room.type)}</span>
                    </span>
                    {room.status === "maintenance" ? <Wrench className="size-3.5 text-slate-400" /> : room.housekeeping !== "clean" && <Sparkles className="size-3.5 text-red-400" />}
                  </div>
                  {dates.map((d) => (
                    <button
                      key={d}
                      onClick={() => room.status !== "maintenance" && d >= today && navigate(`/bookings/new?room=${room.id}&date=${d}`)}
                      className={cx("group h-full shrink-0 border-r border-slate-100", d === today && "bg-brand-50/50", room.status === "maintenance" && "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)]", d >= today && room.status !== "maintenance" && "hover:bg-brand-50")}
                      style={{ width: colW }}
                      title={d >= today ? `Book room ${room.roomNumber} from ${formatDate(d)}` : ""}
                    >
                      {d >= today && room.status !== "maintenance" && <Plus className="mx-auto hidden size-4 text-brand-400 group-hover:block" />}
                    </button>
                  ))}
                  {list.map((b) => {
                    const start = Math.max(0, diffDays(from, b.checkInDate));
                    const end = Math.min(days, diffDays(from, b.displayOut));
                    if (end <= 0 || start >= days) return null;
                    // Bars run from the middle of the arrival day to the middle of the leaving day.
                    const left = 150 + start * colW + (diffDays(from, b.checkInDate) >= 0 ? colW / 2 : 0);
                    const right = 150 + end * colW + (diffDays(from, b.displayOut) < days ? colW / 2 : 0);
                    return (
                      <button
                        key={b.id}
                        onClick={() => navigate(`/bookings/${b.id}`)}
                        className={cx("absolute top-1 bottom-1 z-[5] overflow-hidden rounded border px-1.5 py-0.5 text-left text-[11px] leading-[1.25] shadow-sm hover:brightness-95", COLORS[b.status])}
                        style={{ left: left + 1, width: Math.max(18, right - left - 2) }}
                        title={`#${b.number} ${b.guestName} · ${formatDate(b.checkInDate)} → ${formatDate(b.checkOutDate)} · ${label(b.status)}${b.balance >= 1 ? ` · ${settings?.currency === "INR" ? "₹" : ""}${Math.round(b.balance)} due` : ""}`}
                      >
                        <span className="block truncate font-semibold">{b.guestName}</span>
                        <span className="block truncate opacity-85">
                          #{b.number}
                          {b.balance >= 1 && b.status === "checked_in" ? " · due" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Page>
  );
}

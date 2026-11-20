// Housekeeping board: which rooms need cleaning (guests leaving and arriving first), who is
// cleaning, done, and rooms out of order.
import { useState } from "react";
import { BedDouble, CheckCircle2, LogIn, LogOut, Play, Sparkles, Wrench } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, Field, HkBadge, Input, Loading, Modal, Page, PageHeader, Panel, Select, cx, useLoad } from "../components/ui";
import { formatTime } from "../../shared/dates";
import { label } from "../../shared/format";
import type { Housekeeping as HK, Room } from "../../shared/types";

type BoardRoom = Room & { occupied: boolean; guestName: string | null; leavingToday: boolean; arrivalToday: string | null };
interface Board {
  rooms: BoardRoom[];
  log: Array<{ id: string; roomNumber: string; status: string; staffName: string; notes: string | null; createdAt: string }>;
}

const ORDER: Record<string, number> = { dirty: 0, cleaning: 1, inspect: 2, clean: 3 };

export function Housekeeping() {
  const { toast, can } = useApp();
  const { data, setData } = useLoad(() => api<Board>("housekeeping.board"), []);
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const [edit, setEdit] = useState<BoardRoom | null>(null);
  const [who, setWho] = useState("");
  const [notes, setNotes] = useState("");
  if (!data) return <Loading />;

  const set = async (room: BoardRoom, housekeeping: HK, extra: { housekeeper?: string; notes?: string } = {}) => {
    try {
      setData(await api<Board>("housekeeping.set", { id: room.id, housekeeping, ...extra }));
      toast(`Room ${room.roomNumber}: ${label(housekeeping === "dirty" ? "needs cleaning" : housekeeping)}`);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const maintenance = async (room: BoardRoom, on: boolean) => {
    try {
      await api("rooms.setStatus", { id: room.id, status: on ? "maintenance" : "available", notes: on ? notes || "Out of order" : "" });
      setData(await api<Board>("housekeeping.board"));
      setEdit(null);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const priority = (r: BoardRoom) => (r.arrivalToday ? 0 : r.leavingToday ? 1 : 2);
  const rooms = [...data.rooms].filter((r) => filter === "all" || r.housekeeping !== "clean" || r.status === "maintenance").sort((a, b) => ORDER[a.housekeeping] - ORDER[b.housekeeping] || priority(a) - priority(b) || a.sortOrder - b.sortOrder);
  const count = (s: string) => data.rooms.filter((r) => r.housekeeping === s).length;

  return (
    <Page>
      <PageHeader
        title="Housekeeping"
        subtitle="Rooms become “Needs cleaning” by themselves when a guest checks out. Rooms with guests arriving today are shown first."
        actions={
          <>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as "todo" | "all")} className="w-44" options={[{ value: "todo", label: "Rooms to clean" }, { value: "all", label: "All rooms" }]} />
            {count("inspect") > 0 && (
              <Button icon={<CheckCircle2 className="size-4" />} onClick={async () => setData(await api<Board>("housekeeping.markAll", { from: "inspect", to: "clean" }))}>
                Mark all checked rooms clean
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-4 gap-3">
        {(["dirty", "cleaning", "inspect", "clean"] as const).map((s) => (
          <div key={s} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <HkBadge status={s} />
            <span className="text-[20px] font-semibold">{count(s)}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] content-start gap-3">
          {rooms.length === 0 && (
            <div className="col-span-full rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-800">
              <Sparkles className="mx-auto mb-2 size-7" /> All rooms are clean.
            </div>
          )}
          {rooms.map((r) => (
            <div key={r.id} className={cx("rounded-lg border bg-white p-3", r.status === "maintenance" ? "border-slate-300 bg-slate-50" : r.housekeeping === "dirty" ? "border-red-200" : r.housekeeping === "cleaning" ? "border-amber-300" : "border-slate-200")}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[18px] leading-tight font-semibold">{r.roomNumber}</p>
                  <p className="text-[12px] text-slate-500">
                    {label(r.type)}
                    {r.floor ? ` · floor ${r.floor}` : ""}
                  </p>
                </div>
                {r.status === "maintenance" ? (
                  <span className="flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[11.5px] font-medium text-slate-700">
                    <Wrench className="size-3" /> Out of order
                  </span>
                ) : (
                  <HkBadge status={r.housekeeping} />
                )}
              </div>
              <div className="mt-2 space-y-0.5 text-[12px]">
                {r.arrivalToday && (
                  <p className="flex items-center gap-1 font-medium text-violet-700">
                    <LogIn className="size-3.5" /> Guest arriving today: {r.arrivalToday}
                  </p>
                )}
                {r.occupied && (
                  <p className={cx("flex items-center gap-1", r.leavingToday ? "font-medium text-amber-700" : "text-slate-600")}>
                    {r.leavingToday ? <LogOut className="size-3.5" /> : <BedDouble className="size-3.5" />} {r.leavingToday ? "Leaving today" : "Guest staying"}: {r.guestName}
                  </p>
                )}
                {r.housekeeper && r.housekeeping === "cleaning" && <p className="text-slate-600">Cleaning: {r.housekeeper}</p>}
                {r.hkNotes && <p className="text-slate-500 italic">{r.hkNotes}</p>}
                {r.hkUpdatedAt && <p className="text-slate-400">Updated {formatTime(r.hkUpdatedAt)}</p>}
              </div>
              {r.status !== "maintenance" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {r.housekeeping === "dirty" && (
                    <Button size="sm" variant="warning" icon={<Play className="size-3.5" />} onClick={() => set(r, "cleaning")}>
                      Start cleaning
                    </Button>
                  )}
                  {(r.housekeeping === "dirty" || r.housekeeping === "cleaning") && (
                    <Button size="sm" variant="success" icon={<CheckCircle2 className="size-3.5" />} onClick={() => set(r, can("frontdesk") ? "clean" : "inspect")}>
                      {can("frontdesk") ? "Clean" : "Done"}
                    </Button>
                  )}
                  {r.housekeeping === "inspect" && can("frontdesk") && (
                    <Button size="sm" variant="success" icon={<CheckCircle2 className="size-3.5" />} onClick={() => set(r, "clean")}>
                      Checked, clean
                    </Button>
                  )}
                  {r.housekeeping === "clean" && (
                    <Button size="sm" onClick={() => set(r, "dirty")}>
                      Needs cleaning
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => (setEdit(r), setWho(r.housekeeper ?? ""), setNotes(r.hkNotes ?? ""))}>
                    More
                  </Button>
                </div>
              )}
              {r.status === "maintenance" && can("frontdesk") && (
                <Button size="sm" className="mt-3" onClick={() => maintenance(r, false)}>
                  Back in use
                </Button>
              )}
            </div>
          ))}
        </div>
        <Panel title="Today's cleaning log" padded={false}>
          <ul className="max-h-[calc(100vh-280px)] divide-y divide-slate-100 overflow-y-auto">
            {data.log.length === 0 && <li className="px-4 py-3 text-[13px] text-slate-400">Nothing yet today</li>}
            {data.log.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-2 text-[12.5px]">
                <span>
                  <b>{l.roomNumber}</b> → {label(l.status === "dirty" ? "needs_cleaning" : l.status)} <span className="text-slate-500">· {l.staffName}</span>
                </span>
                <span className="text-slate-400">{formatTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Room ${edit?.roomNumber}`}
        width={440}
        footer={
          <>
            {can("frontdesk") && edit && (
              <Button variant="danger" icon={<Wrench className="size-4" />} onClick={() => maintenance(edit, true)}>
                Out of order
              </Button>
            )}
            <Button
              variant="primary"
              onClick={async () => {
                if (edit) await set(edit, edit.housekeeping, { housekeeper: who, notes });
                setEdit(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Housekeeper">
            <Input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Note" hint="For example: towel missing, AC not cooling">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Page>
  );
}

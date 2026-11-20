// Rooms and prices: add and change rooms, weekend prices and festival / off-season prices.
import { useEffect, useState } from "react";
import { CalendarHeart, DoorOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Badge, Button, Empty, ErrorNote, Field, HkBadge, Input, Modal, Page, PageHeader, Panel, Select, Textarea, useLoad } from "../components/ui";
import { formatDate } from "../../shared/dates";
import { label, money } from "../../shared/format";
import type { Room, SeasonalRate, Settings } from "../../shared/types";

export function Rooms() {
  const { settings, toast, refreshSettings } = useApp();
  const { data: rooms, setData: setRooms } = useLoad(() => api<Room[]>("rooms.list"), []);
  const { data: seasons, setData: setSeasons } = useLoad(() => api<SeasonalRate[]>("seasonal.list"), []);
  const [edit, setEdit] = useState<Partial<Room> | null>(null);
  const [many, setMany] = useState(false);
  const [season, setSeason] = useState<Partial<SeasonalRate> | null>(null);
  const [weekend, setWeekend] = useState("");
  const [newType, setNewType] = useState("");
  useEffect(() => setWeekend(String(settings?.weekendSurcharge ?? 0)), [settings]);
  const cur = settings?.currency;
  const types = settings?.roomTypes ?? [];

  const saveSettings = async (patch: Partial<Settings>) => {
    try {
      await api("settings.save", patch);
      await refreshSettings();
      toast("Saved");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Rooms & prices"
        subtitle="The price per night here is the normal price. You can still agree a different price on any booking."
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setMany(true)}>
              Add many rooms
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ type: types[0], capacity: 2, pricePerNight: 1500 })}>
              Add room
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title={`${rooms?.length ?? 0} rooms`} padded={false}>
          {rooms && rooms.length === 0 ? (
            <Empty icon={<DoorOpen />} title="No rooms yet" text="Add your rooms to start taking bookings." />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Floor</th>
                  <th className="num">Guests</th>
                  <th className="num">Price / night</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rooms ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.roomNumber}</td>
                    <td>{label(r.type)}</td>
                    <td>{r.floor || "—"}</td>
                    <td className="num">{r.capacity}</td>
                    <td className="num">{money(r.pricePerNight, cur)}</td>
                    <td>{r.status === "maintenance" ? <Badge tone="slate">Out of order</Badge> : <HkBadge status={r.housekeeping} />}</td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(r)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Weekend price">
            <p className="mb-2 text-[12.5px] text-slate-500">Change the price on Friday and Saturday nights by a percentage. 0 = same price every night.</p>
            <div className="flex items-end gap-2">
              <Field label="Weekend change %">
                <Input type="number" value={weekend} onChange={(e) => setWeekend(e.target.value)} className="w-28" />
              </Field>
              <Button onClick={() => saveSettings({ weekendSurcharge: Number(weekend) || 0 })}>Save</Button>
            </div>
          </Panel>
          <Panel title="Special prices" subtitle="Festivals, holidays, off-season" actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setSeason({ percent: 20 })}>Add</Button>}>
            {(seasons ?? []).length === 0 && <p className="text-[13px] text-slate-400">None. Example: Diwali +30% for all rooms.</p>}
            <ul className="divide-y divide-slate-100">
              {(seasons ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-[13px]">
                  <span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <CalendarHeart className="size-3.5 text-rose-500" /> {s.name}{" "}
                      <Badge tone={s.percent >= 0 ? "amber" : "green"}>
                        {s.percent > 0 ? "+" : ""}
                        {s.percent}%
                      </Badge>
                    </span>
                    <span className="text-[12px] text-slate-500">
                      {formatDate(s.startDate)} – {formatDate(s.endDate)} · {s.roomType ? label(s.roomType) : "all rooms"}
                    </span>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSeason(s)} icon={<Pencil className="size-3.5" />} />
                    <Button size="sm" variant="ghost" onClick={async () => setSeasons(await api<SeasonalRate[]>("seasonal.delete", { id: s.id }))} icon={<Trash2 className="size-3.5" />} />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Room types">
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[12.5px]">
                  {label(t)}
                  {!(rooms ?? []).some((r) => r.type === t) && (
                    <button className="text-slate-400 hover:text-red-600" onClick={() => saveSettings({ roomTypes: types.filter((x) => x !== t) })}>
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="New type, e.g. Executive" />
              <Button onClick={() => newType.trim() && (saveSettings({ roomTypes: [...types, newType.trim()] }), setNewType(""))}>Add</Button>
            </div>
          </Panel>
        </div>
      </div>
      <RoomDialog room={edit} types={types} onClose={() => setEdit(null)} onSaved={(r) => setRooms(r)} />
      <ManyDialog open={many} types={types} onClose={() => setMany(false)} onSaved={(r) => setRooms(r)} />
      <SeasonDialog season={season} types={types} onClose={() => setSeason(null)} onSaved={(s) => setSeasons(s)} />
    </Page>
  );
}

function RoomDialog({ room, types, onClose, onSaved }: { room: Partial<Room> | null; types: string[]; onClose: () => void; onSaved: (r: Room[]) => void }) {
  const { toast } = useApp();
  const [v, setV] = useState<Partial<Room>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    setV(room ?? {});
    setError("");
  }, [room]);
  const save = async () => {
    try {
      onSaved(await api<Room[]>("rooms.save", v));
      toast("Room saved");
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async () => {
    if (!room?.id || !confirm(`Remove room ${room.roomNumber}?`)) return;
    try {
      onSaved(await api<Room[]>("rooms.delete", { id: room.id }));
      toast("Room removed");
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal
      open={!!room}
      onClose={onClose}
      title={room?.id ? `Room ${room.roomNumber}` : "Add a room"}
      footer={
        <>
          {room?.id && (
            <Button variant="danger" className="mr-auto" icon={<Trash2 className="size-4" />} onClick={remove}>
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save room
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Room number or name" required>
          <Input value={v.roomNumber ?? ""} onChange={(e) => setV({ ...v, roomNumber: e.target.value })} autoFocus />
        </Field>
        <Field label="Type">
          <Select value={v.type ?? types[0]} onChange={(e) => setV({ ...v, type: e.target.value })} options={types.map((t) => ({ value: t, label: label(t) }))} />
        </Field>
        <Field label="Price per night">
          <Input type="number" value={v.pricePerNight ?? ""} onChange={(e) => setV({ ...v, pricePerNight: e.target.value as unknown as number })} />
        </Field>
        <Field label="Guests allowed">
          <Input type="number" value={v.capacity ?? 2} onChange={(e) => setV({ ...v, capacity: e.target.value as unknown as number })} />
        </Field>
        <Field label="Floor">
          <Input value={v.floor ?? ""} onChange={(e) => setV({ ...v, floor: e.target.value })} />
        </Field>
        <Field label="Order on screens" hint="Lower numbers come first">
          <Input type="number" value={v.sortOrder ?? ""} onChange={(e) => setV({ ...v, sortOrder: e.target.value as unknown as number })} />
        </Field>
        <Field label="Description" className="col-span-2">
          <Textarea value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} placeholder="AC, balcony, king bed…" />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function ManyDialog({ open, types, onClose, onSaved }: { open: boolean; types: string[]; onClose: () => void; onSaved: (r: Room[]) => void }) {
  const { toast } = useApp();
  const [v, setV] = useState({ from: "101", to: "110", type: types[0] ?? "standard", pricePerNight: "1500", capacity: "2", floor: "", prefix: "" });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      onSaved(await api<Room[]>("rooms.addMany", { ...v, from: Number(v.from), to: Number(v.to), pricePerNight: Number(v.pricePerNight), capacity: Number(v.capacity) }));
      toast("Rooms added");
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add many rooms" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add rooms</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From room number">
          <Input value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />
        </Field>
        <Field label="To room number">
          <Input value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />
        </Field>
        <Field label="Type">
          <Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={types.map((t) => ({ value: t, label: label(t) }))} />
        </Field>
        <Field label="Price per night">
          <Input type="number" value={v.pricePerNight} onChange={(e) => setV({ ...v, pricePerNight: e.target.value })} />
        </Field>
        <Field label="Guests allowed">
          <Input type="number" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
        </Field>
        <Field label="Floor">
          <Input value={v.floor} onChange={(e) => setV({ ...v, floor: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function SeasonDialog({ season, types, onClose, onSaved }: { season: Partial<SeasonalRate> | null; types: string[]; onClose: () => void; onSaved: (s: SeasonalRate[]) => void }) {
  const [v, setV] = useState<Partial<SeasonalRate>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    setV(season ?? {});
    setError("");
  }, [season]);
  const save = async () => {
    try {
      onSaved(await api<SeasonalRate[]>("seasonal.save", v));
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal open={!!season} onClose={onClose} title="Special prices" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" className="col-span-2">
          <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Diwali, New Year, Monsoon offer…" autoFocus />
        </Field>
        <Field label="First night">
          <Input type="date" value={v.startDate ?? ""} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
        </Field>
        <Field label="Last night">
          <Input type="date" value={v.endDate ?? ""} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
        </Field>
        <Field label="Price change %" hint="+30 = 30% more, −15 = 15% less">
          <Input type="number" value={v.percent ?? ""} onChange={(e) => setV({ ...v, percent: e.target.value as unknown as number })} />
        </Field>
        <Field label="Rooms">
          <Select value={v.roomType ?? ""} onChange={(e) => setV({ ...v, roomType: e.target.value || null })} options={[{ value: "", label: "All room types" }, ...types.map((t) => ({ value: t, label: label(t) }))]} />
        </Field>
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

// First run: licence or trial, the hotel's details, the owner's sign-in and the rooms.
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, DoorOpen, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { api, errorText } from "../api";
import { useApp } from "../state";
import { Button, ErrorNote, Field, Input, Note, Select, Toggle, cx } from "../components/ui";
import { Logo } from "../components/Logo";
import { LicensePanel } from "./License";
import { DEFAULT_ROOM_TYPES, INDIAN_STATES, isValidGstin, label } from "../../shared/format";
import type { Settings } from "../../shared/types";

type RoomRow = { from: string; to: string; type: string; pricePerNight: string; capacity: string };

const STEPS = [
  { title: "Licence", icon: <ShieldCheck /> },
  { title: "Your hotel", icon: <Building2 /> },
  { title: "Owner sign-in", icon: <UserRound /> },
  { title: "Rooms", icon: <DoorOpen /> },
];

export function Setup() {
  const { info, refreshInfo, refreshSettings, toast } = useApp();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hotel, setHotel] = useState<Partial<Settings>>({ hotelName: "", address: "", city: "", state: "", pinCode: "", phone: "", email: "", gstin: "", checkInTime: "12:00", checkOutTime: "11:00", taxMode: "india_gst" });
  const [owner, setOwner] = useState({ name: "", username: "owner", password: "", again: "" });
  const [rooms, setRooms] = useState<RoomRow[]>([{ from: "101", to: "105", type: "standard", pricePerNight: "1500", capacity: "2" }]);
  const [sample, setSample] = useState(false);
  const set = (k: keyof Settings, v: string) => setHotel((h) => ({ ...h, [k]: v }));

  const next = () => {
    setError("");
    if (step === 1) {
      if (!hotel.hotelName?.trim()) return setError("Please enter the hotel's name");
      if (hotel.gstin && !isValidGstin(hotel.gstin)) return setError("The GSTIN does not look right. It has 15 characters, like 24ABCDE1234F1Z5. Leave it empty if you do not have one.");
    }
    if (step === 2) {
      if (!owner.name.trim()) return setError("Please enter your name");
      if (owner.password.length < 4) return setError("The password must have at least 4 characters");
      if (owner.password !== owner.again) return setError("The two passwords are not the same");
    }
    setStep(step + 1);
  };

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      const roomList = sample
        ? []
        : rooms.filter((r) => r.from.trim()).map((r) => ({ from: Number(r.from), to: Number(r.to || r.from), type: r.type, pricePerNight: Number(r.pricePerNight) || 0, capacity: Number(r.capacity) || 2 }));
      if (roomList.some((r) => !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.to < r.from)) throw new Error("Please check the room numbers: use numbers like 101 to 110");
      const gstState = hotel.gstin ? INDIAN_STATES[hotel.gstin.slice(0, 2)] : "";
      await api("setup.complete", { hotel: { ...hotel, state: hotel.state || gstState || "" }, owner: { name: owner.name, username: owner.username, password: owner.password }, rooms: roomList, sample });
      await refreshSettings();
      await refreshInfo();
      toast("Your hotel is ready. Please sign in.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full overflow-y-auto bg-gradient-to-br from-brand-900 to-brand-700">
      <div className="m-auto w-full max-w-3xl p-6">
        <div className="mb-5 flex items-center gap-3 text-white">
          <Logo className="size-11" />
          <div>
            <h1 className="text-[22px] font-semibold">Welcome to Innvela Hotel Desk</h1>
            <p className="text-[13.5px] text-brand-100">Let's set up your hotel. It takes about two minutes.</p>
          </div>
        </div>
        <div className="rounded-xl bg-white shadow-2xl">
          <div className="flex border-b border-slate-200">
            {STEPS.map((s, i) => (
              <div key={s.title} className={cx("flex flex-1 items-center gap-2 px-4 py-3 text-[13px] font-medium [&>svg]:size-4", i === step ? "border-b-2 border-brand-600 text-brand-700" : i < step ? "text-emerald-600" : "text-slate-400")}>
                {i < step ? <CheckCircle2 /> : s.icon}
                {s.title}
              </div>
            ))}
          </div>
          <div className="min-h-[340px] p-6">
            {step === 0 && (
              <div className="space-y-4">
                <Note icon={<ShieldCheck />}>
                  You can use the software free for <b>{info?.license.daysLeft} days</b>. To keep using it, pay monthly or yearly and enter the licence key we send you. You can also do that later from Settings → Licence.
                </Note>
                <LicensePanel compact onActivated={() => setStep(1)} />
              </div>
            )}
            {step === 1 && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Hotel name" required className="col-span-2">
                  <Input value={hotel.hotelName} onChange={(e) => set("hotelName", e.target.value)} autoFocus placeholder="Hotel Sunrise Residency" />
                </Field>
                <Field label="Address" className="col-span-2">
                  <Input value={hotel.address} onChange={(e) => set("address", e.target.value)} placeholder="Plot 12, Station Road" />
                </Field>
                <Field label="City">
                  <Input value={hotel.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
                <Field label="State">
                  <Select value={hotel.state} onChange={(e) => set("state", e.target.value)} options={[{ value: "", label: "Choose…" }, ...Object.values(INDIAN_STATES).sort().map((s) => ({ value: s, label: s }))]} />
                </Field>
                <Field label="Phone (shown on bills and WhatsApp messages)">
                  <Input value={hotel.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" />
                </Field>
                <Field label="Email">
                  <Input value={hotel.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label="GSTIN" hint="Printed on GST invoices. Leave empty if not registered.">
                  <Input value={hotel.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} />
                </Field>
                <Field label="PIN code">
                  <Input value={hotel.pinCode} onChange={(e) => set("pinCode", e.target.value)} maxLength={6} />
                </Field>
                <Field label="Check-in time">
                  <Input type="time" value={hotel.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
                </Field>
                <Field label="Check-out time">
                  <Input type="time" value={hotel.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
                </Field>
              </div>
            )}
            {step === 2 && (
              <div className="grid max-w-md gap-4">
                <p className="text-[13.5px] text-slate-600">This is the owner's account. It can do everything, including adding staff. You can add front-desk and housekeeping staff later.</p>
                <Field label="Your name" required>
                  <Input value={owner.name} onChange={(e) => setOwner({ ...owner, name: e.target.value })} autoFocus />
                </Field>
                <Field label="Sign-in name" hint="Letters and numbers, no spaces">
                  <Input value={owner.username} onChange={(e) => setOwner({ ...owner, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
                </Field>
                <Field label="Password" required hint="At least 4 characters. Keep it secret.">
                  <Input type="password" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} />
                </Field>
                <Field label="Password again" required>
                  <Input type="password" value={owner.again} onChange={(e) => setOwner({ ...owner, again: e.target.value })} />
                </Field>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-4">
                <Toggle checked={sample} onChange={setSample} label="Fill with sample data to try the software" hint="Adds 10 rooms, 40 guests and a few weeks of bookings, payments and invoices. Good for training. Start with an empty hotel for real use." />
                {!sample && (
                  <>
                    <p className="text-[13.5px] text-slate-600">Add your rooms in groups. For example rooms 101 to 110 are Standard at ₹1,500. You can change rooms and prices later.</p>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>From room no.</th>
                          <th>To room no.</th>
                          <th>Room type</th>
                          <th>Price per night (₹)</th>
                          <th>Guests</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.map((r, i) => {
                          const upd = (k: keyof RoomRow, v: string) => setRooms(rooms.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                          return (
                            <tr key={i}>
                              <td><Input value={r.from} onChange={(e) => upd("from", e.target.value)} /></td>
                              <td><Input value={r.to} onChange={(e) => upd("to", e.target.value)} /></td>
                              <td><Select value={r.type} onChange={(e) => upd("type", e.target.value)} options={DEFAULT_ROOM_TYPES.map((t) => ({ value: t, label: label(t) }))} /></td>
                              <td><Input type="number" value={r.pricePerNight} onChange={(e) => upd("pricePerNight", e.target.value)} /></td>
                              <td><Input type="number" value={r.capacity} onChange={(e) => upd("capacity", e.target.value)} className="w-16" /></td>
                              <td>
                                {rooms.length > 1 && (
                                  <Button variant="ghost" size="sm" onClick={() => setRooms(rooms.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" />} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRooms([...rooms, { from: "", to: "", type: "deluxe", pricePerNight: "2500", capacity: "2" }])}>
                      Add another group
                    </Button>
                  </>
                )}
              </div>
            )}
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-b-xl border-t border-slate-200 bg-slate-50 px-6 py-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft className="size-4" />}>
              Back
            </Button>
            {step < 3 ? (
              <Button variant="primary" onClick={next} disabled={step === 0 && !info?.license.canUse}>
                {step === 0 ? (info?.license.state === "active" ? "Next" : "Start free trial") : "Next"} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="success" loading={busy} onClick={finish} icon={<CheckCircle2 className="size-4" />}>
                Finish setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

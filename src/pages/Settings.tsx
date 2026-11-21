// Settings: hotel details, bills & GST, WhatsApp wording, front desk rules, backups and licence.
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, FolderOpen, HardDriveDownload, HardDriveUpload, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { api, bridge, errorText } from "../api";
import { useApp } from "../state";
import { Button, Confirm, Field, Input, Loading, Note, Page, PageHeader, Panel, Select, Tabs, Textarea, Toggle, useLoad } from "../components/ui";
import { LicensePanel } from "./License";
import { DEFAULT_MESSAGES, MESSAGE_FIELDS, MESSAGE_KINDS, MESSAGE_TITLES, fillMessage, type MessageKind } from "../../shared/messages";
import { INDIAN_STATES, isValidGstin } from "../../shared/format";
import { clockLabel, formatDateTime } from "../../shared/dates";
import type { Settings } from "../../shared/types";
import { isGujarat } from "../../shared/pathik";
import type { GstSlab } from "../../shared/pricing";

type Tab = "hotel" | "billing" | "whatsapp" | "desk" | "backup" | "license";

export function SettingsPage() {
  const { settings, refreshSettings, toast, can } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "hotel");
  const [v, setV] = useState<Settings | null>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(settings), [settings]);
  useEffect(() => {
    const t = params.get("tab") as Tab | null;
    if (t) setTab(t);
  }, [params]);
  if (!v) return <Loading />;
  const set = <K extends keyof Settings>(k: K, value: Settings[K]) => setV({ ...v, [k]: value });
  const save = async (keys: Array<keyof Settings>) => {
    if (keys.includes("gstin") && v.gstin && !isValidGstin(v.gstin)) return toast("The GSTIN does not look right (15 characters, like 24ABCDE1234F1Z5)", "error");
    setBusy(true);
    try {
      await api("settings.save", Object.fromEntries(keys.map((k) => [k, v[k]])));
      await refreshSettings();
      toast("Settings saved");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const SaveBar = ({ keys }: { keys: Array<keyof Settings> }) => (
    <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
      <Button variant="primary" loading={busy} icon={<Save className="size-4" />} onClick={() => save(keys)}>
        Save
      </Button>
    </div>
  );

  return (
    <Page className="max-w-[1100px]">
      <PageHeader title="Settings" />
      <Tabs
        className="mb-4"
        tabs={[
          { value: "hotel", label: "Hotel details" },
          { value: "billing", label: "Bills & GST" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "desk", label: "Front desk" },
          { value: "backup", label: "Backups" },
          ...(can("license") ? [{ value: "license" as Tab, label: "Licence" }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "hotel" && (
        <Panel title="Hotel details" subtitle="Printed on invoices, registration cards and confirmations">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Hotel name" required>
              <Input value={v.hotelName} onChange={(e) => set("hotelName", e.target.value)} />
            </Field>
            <Field label="Tagline">
              <Input value={v.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Comfort stay near the station" />
            </Field>
            <Field label="Legal / business name" hint="If different from the hotel name, printed on GST invoices">
              <Input value={v.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </Field>
            <Field label="GSTIN">
              <Input value={v.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} />
            </Field>
            <Field label="Address" className="col-span-2">
              <Input value={v.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="City">
              <Input value={v.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State" hint={v.gstin ? `From GSTIN: ${INDIAN_STATES[v.gstin.slice(0, 2)] ?? "?"}` : undefined}>
              <Select value={v.state} onChange={(e) => set("state", e.target.value)} options={[{ value: "", label: "—" }, ...Object.values(INDIAN_STATES).sort().map((s) => ({ value: s, label: s }))]} />
            </Field>
            <Field label="PIN code">
              <Input value={v.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={v.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Google review link" hint="Sent in the thank-you message">
              <Input value={v.reviewLink} onChange={(e) => set("reviewLink", e.target.value)} placeholder="https://g.page/r/…" />
            </Field>
            <Field label="Check-in time">
              <Input type="time" value={v.checkInTime} onChange={(e) => set("checkInTime", e.target.value)} />
            </Field>
            <Field label="Check-out time">
              <Input type="time" value={v.checkOutTime} onChange={(e) => set("checkOutTime", e.target.value)} />
            </Field>
            <Field label="Terms printed on confirmations and registration cards" className="col-span-2">
              <Textarea value={v.bookingTerms} onChange={(e) => set("bookingTerms", e.target.value)} rows={3} />
            </Field>
          </div>
          <SaveBar keys={["hotelName", "tagline", "legalName", "gstin", "address", "city", "state", "pinCode", "phone", "email", "reviewLink", "checkInTime", "checkOutTime", "bookingTerms"]} />
        </Panel>
      )}

      {tab === "billing" && (
        <Panel title="Bills & GST">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tax on rooms" className="col-span-2">
              <Select
                value={v.taxMode}
                onChange={(e) => set("taxMode", e.target.value as Settings["taxMode"])}
                options={[
                  { value: "india_gst", label: "Indian GST by room price (slabs below)" },
                  { value: "flat", label: "One fixed tax rate" },
                  { value: "none", label: "No tax (not GST registered)" },
                ]}
              />
            </Field>
            {v.taxMode === "india_gst" && <SlabEditor slabs={v.gstSlabs} onChange={(s) => set("gstSlabs", s)} />}
            {v.taxMode === "flat" && (
              <Field label="Tax rate on rooms %">
                <Input type="number" value={v.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
              </Field>
            )}
            {v.taxMode !== "none" && (
              <Field label="GST on food & extras %" hint="Restaurant service in a hotel is usually 5% (or 18% if room price above ₹7,500)">
                <Input type="number" value={v.extrasTaxRate} onChange={(e) => set("extrasTaxRate", Number(e.target.value))} />
              </Field>
            )}
            <div className="col-span-2">
              <Toggle checked={v.roomPricesIncludeTax} onChange={(x) => set("roomPricesIncludeTax", x)} label="Room prices already include GST" hint="Turn on if ₹2,000 means ₹2,000 including GST. The invoice then shows the price before GST plus the GST. Applies to new bookings." />
            </div>
            <Field label="Invoice number starts with" hint={`Invoices look like ${(v.invoicePrefix || "INV").replace(/\s+/g, "")}/2026-27/0001 and restart each financial year`}>
              <Input value={v.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase().slice(0, 6))} />
            </Field>
            <Field label="Currency">
              <Select value={v.currency} onChange={(e) => set("currency", e.target.value)} options={["INR", "NPR", "LKR", "AED", "USD"]} />
            </Field>
            <Field label="Your UPI ID" hint="A QR code to pay the balance is printed on bills and sent in messages">
              <Input value={v.upiId} onChange={(e) => set("upiId", e.target.value.trim())} placeholder="sunrise@okaxis" />
            </Field>
            <Field label="Name shown in UPI apps">
              <Input value={v.upiName} onChange={(e) => set("upiName", e.target.value)} placeholder={v.hotelName} />
            </Field>
          </div>
          <SaveBar keys={["taxMode", "gstSlabs", "taxRate", "extrasTaxRate", "roomPricesIncludeTax", "invoicePrefix", "currency", "upiId", "upiName"]} />
        </Panel>
      )}

      {tab === "whatsapp" && <WhatsAppSettings v={v} set={set} SaveBar={SaveBar} />}

      {tab === "desk" && (
        <Panel title="Front desk">
          <div className="space-y-3">
            <Toggle checked={v.staffShifts} onChange={(x) => set("staffShifts", x)} label="Staff start and end a shift" hint="Front-desk staff and managers start a shift after signing in and end it with a handover note and the cash count. You see their sign-in times in Staff & sign-ins." />
            <Toggle checked={v.idCheckRequired} onChange={(x) => set("idCheckRequired", x)} label="Every adult's ID must be ticked before check-in" hint="Staff can still check in without it, but must confirm they will tick the IDs later." />
          </div>
          <SaveBar keys={["staffShifts", "idCheckRequired"]} />
        </Panel>
      )}
      {tab === "desk" && (
        <Panel title="Pathik (police guest register)" subtitle="Hotels in Gujarat enter every guest in Pathik" className="mt-4">
          <div className="space-y-3">
            <Toggle checked={v.pathik || isGujarat(v)} disabled={isGujarat(v)} onChange={(x) => set("pathik", x)} label="Fill in Pathik from this software" hint="Adds “Fill in Pathik” to bookings and a list of guests not entered yet. Pathik opens in its own window and its Add Guest form is filled in — with every adult in the room. ID numbers and photos are added by hand." />
            {isGujarat(v) && <Note tone="blue">Compulsory for hotels in Gujarat: every guest must be entered in Pathik, and check-in needs all the details Pathik asks for.</Note>}
            {v.pathik && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Add Guest page address" className="col-span-3" hint="Change only if Pathik moves its Add Guest page">
                  <Input value={v.pathikUrl} onChange={(e) => set("pathikUrl", e.target.value.trim())} />
                </Field>
                <Field label="Date format in Pathik">
                  <Select value={v.pathikDateFormat} onChange={(e) => set("pathikDateFormat", e.target.value)} options={["dd/mm/yyyy", "dd-mm-yyyy", "yyyy-mm-dd", "mm/dd/yyyy"]} />
                </Field>
                <Field label="Time format in Pathik">
                  <Select value={v.pathikTimeFormat} onChange={(e) => set("pathikTimeFormat", e.target.value as Settings["pathikTimeFormat"])} options={[{ value: "12h", label: "02:05 PM" }, { value: "24h", label: "14:05" }]} />
                </Field>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api("pathik.forgetLogin");
                        toast("Signed out of Pathik on this computer");
                      } catch (e) {
                        toast(errorText(e), "error");
                      }
                    }}
                  >
                    Sign out of Pathik
                  </Button>
                </div>
              </div>
            )}
          </div>
          <SaveBar keys={["pathik", "pathikUrl", "pathikDateFormat", "pathikTimeFormat"]} />
        </Panel>
      )}

      {tab === "backup" && <Backups v={v} set={set} save={save} />}
      {tab === "license" && (
        <Panel title="Licence">
          <div className="max-w-xl">
            <LicensePanel />
          </div>
        </Panel>
      )}
    </Page>
  );
}

function SlabEditor({ slabs, onChange }: { slabs: GstSlab[]; onChange: (s: GstSlab[]) => void }) {
  return (
    <div className="col-span-2 rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-[12.5px] font-medium text-slate-700">GST slabs by price per night (after discount)</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Price per night up to (₹)</th>
            <th>GST %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {slabs.map((s, i) => (
            <tr key={i}>
              <td>{s.upTo === null ? <span className="text-slate-500">Above that</span> : <Input type="number" value={s.upTo} onChange={(e) => onChange(slabs.map((x, j) => (j === i ? { ...x, upTo: Number(e.target.value) } : x)))} className="w-40" />}</td>
              <td>
                <Input type="number" value={s.rate} onChange={(e) => onChange(slabs.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))} className="w-24" />
              </td>
              <td>{s.upTo !== null && slabs.length > 2 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => onChange(slabs.filter((_, j) => j !== i))} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => onChange([...slabs.filter((s) => s.upTo !== null), { upTo: 5000, rate: 12 }, ...slabs.filter((s) => s.upTo === null)])}>
          Add slab
        </Button>
        <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => onChange([{ upTo: 1000, rate: 0 }, { upTo: 7500, rate: 5 }, { upTo: null, rate: 18 }])}>
          GST rules from 22 Sept 2025
        </Button>
      </div>
    </div>
  );
}

function WhatsAppSettings({ v, set, SaveBar }: { v: Settings; set: <K extends keyof Settings>(k: K, value: Settings[K]) => void; SaveBar: (p: { keys: Array<keyof Settings> }) => ReactNode }) {
  const [kind, setKind] = useState<MessageKind>("booking");
  const key = MESSAGE_TITLES[kind].setting;
  const text = (v[key] as string) || DEFAULT_MESSAGES[kind];
  const sample: Record<string, string> = {
    hotel: v.hotelName,
    guest: "Rahul Sharma",
    booking_no: "1024",
    room_type: "Deluxe",
    room_no: "204",
    guests: "2 adults",
    arrival_date: "20 Nov 2026",
    leaving_date: "22 Nov 2026",
    nights: "2 nights",
    check_in_time: clockLabel(v.checkInTime),
    check_out_time: clockLabel(v.checkOutTime),
    checked_in_at: "20 Nov 2026, 1:15 pm",
    total: "₹5,880",
    paid: "₹2,000",
    balance: "₹3,880",
    invoice_no: kind === "checkOut" ? "INV/2026-27/0042" : "",
    upi_id: v.upiId,
    review_link: v.reviewLink,
    hotel_phone: v.phone,
    hotel_address: [v.address, v.city].filter(Boolean).join(", "),
  };
  return (
    <Panel title="WhatsApp messages to guests">
      <div className="mb-4 grid grid-cols-2 gap-4">
        <Field label="Open messages in">
          <Select value={v.whatsappMode} onChange={(e) => set("whatsappMode", e.target.value as Settings["whatsappMode"])} options={[{ value: "app", label: "WhatsApp Desktop app (recommended)" }, { value: "web", label: "WhatsApp Web in the browser" }]} />
        </Field>
        <Field label="Country code for numbers without one">
          <Input value={v.countryCode} onChange={(e) => set("countryCode", e.target.value.replace(/\D/g, ""))} className="w-24" />
        </Field>
      </div>
      <Tabs tabs={MESSAGE_KINDS.map((k) => ({ value: k, label: MESSAGE_TITLES[k].title }))} value={kind} onChange={setKind} className="mb-3" />
      <p className="mb-2 text-[12.5px] text-slate-500">{MESSAGE_TITLES[kind].when} Lines with a detail that is empty (for example no balance) are left out by themselves.</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Textarea value={text} onChange={(e) => set(key, e.target.value as never)} rows={16} className="text-[13px]" />
          <div className="mt-2 flex flex-wrap gap-1">
            {MESSAGE_FIELDS.map((f) => (
              <button key={f.key} title={f.label} onClick={() => set(key, `${text}{${f.key}}` as never)} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 hover:bg-brand-100">
                {`{${f.key}}`}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={<RotateCcw className="size-3.5" />} onClick={() => set(key, "" as never)}>
            Use the standard wording
          </Button>
        </div>
        <div>
          <p className="mb-1 text-[12px] font-medium text-slate-500">Preview</p>
          <div className="rounded-lg bg-[#e7ddd3] p-3">
            <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] whitespace-pre-wrap text-slate-900 shadow-sm">{fillMessage(text, sample)}</div>
          </div>
        </div>
      </div>
      <SaveBar keys={["whatsappMode", "countryCode", "msgBooking", "msgCheckIn", "msgCheckOut", "msgReminder"]} />
    </Panel>
  );
}

function Backups({ v, set, save }: { v: Settings; set: <K extends keyof Settings>(k: K, value: Settings[K]) => void; save: (keys: Array<keyof Settings>) => Promise<unknown> }) {
  const { toast, can, info, setSession } = useApp();
  const { data, reload } = useLoad(() => api<{ folder: string; backups: Array<{ name: string; path: string; size: number; createdAt: string }>; lastBackupAt: string | null }>("backup.status"), []);
  const [restore, setRestore] = useState<{ file: string; hotelName: string; bookings: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const pickRestore = async (file?: string | null) => {
    const f = file ?? (await bridge().pickFile("backup"));
    if (!f) return;
    try {
      const r = await api<{ hotelName: string; bookings: number }>("backup.check", { file: f });
      setRestore({ file: f, ...r });
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
    <div className="space-y-4">
      <Note tone="blue" icon={<Database />}>
        All data is kept on this computer in <code className="text-[12px]">{info?.databaseFile}</code>. A backup copy is made every day and each time the software is closed. Keep the backup folder on a USB drive or inside a Google Drive / OneDrive folder so the data is safe even if this computer breaks.
      </Note>
      <Panel title="Automatic backups">
        <div className="space-y-3">
          <Toggle checked={v.autoBackup} onChange={(x) => set("autoBackup", x)} label="Make a backup every day and when closing" />
          <Field label="Backup folder" hint="Empty = Documents\Innvela Backups">
            <div className="flex gap-2">
              <Input value={v.backupFolder || data?.folder || ""} onChange={(e) => set("backupFolder", e.target.value)} />
              <Button
                icon={<FolderOpen className="size-4" />}
                onClick={async () => {
                  const f = await bridge().pickFolder();
                  if (f) set("backupFolder", f);
                }}
              >
                Choose…
              </Button>
            </div>
          </Field>
          <Field label="Keep this many backups">
            <Input type="number" value={v.keepBackups} onChange={(e) => set("keepBackups", Number(e.target.value))} className="w-24" />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" icon={<Save className="size-4" />} onClick={() => save(["autoBackup", "backupFolder", "keepBackups"]).then(reload)}>
              Save
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title="Backups"
        subtitle={data?.lastBackupAt ? `Last backup ${formatDateTime(data.lastBackupAt)}` : undefined}
        actions={
          <>
            <Button size="sm" icon={<HardDriveDownload className="size-3.5" />} onClick={async () => {
              try {
                await api("backup.now");
                toast("Backup made");
                reload();
              } catch (e) {
                toast(errorText(e), "error");
              }
            }}>
              Back up now
            </Button>
            <Button size="sm" icon={<HardDriveDownload className="size-3.5" />} onClick={async () => {
              try {
                const f = await bridge().saveBackupAs();
                if (f) toast("Backup saved");
              } catch (e) {
                toast(errorText(e), "error");
              }
            }}>
              Save a copy to…
            </Button>
            {can("restore") && (
              <Button size="sm" variant="danger" icon={<HardDriveUpload className="size-3.5" />} onClick={() => pickRestore()}>
                Restore from file…
              </Button>
            )}
          </>
        }
        padded={false}
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Backup</th>
              <th>Made</th>
              <th className="num">Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data?.backups ?? []).map((b) => (
              <tr key={b.path}>
                <td className="font-mono text-[12px]">{b.name}</td>
                <td>{formatDateTime(b.createdAt)}</td>
                <td className="num">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => void bridge().showFolder(b.path)}>
                    Show
                  </Button>
                  {can("restore") && (
                    <Button size="sm" variant="ghost" onClick={() => pickRestore(b.path)}>
                      Restore
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Confirm
        open={!!restore}
        onClose={() => setRestore(null)}
        danger
        title="Restore this backup?"
        confirmText="Restore and sign out"
        loading={busy}
        message={
          <>
            All data on this computer will be replaced with the backup <b>{restore?.file.split(/[\\/]/).pop()}</b> ({restore?.hotelName}, {restore?.bookings} bookings). A copy of the current data is saved first, so this can be undone.
          </>
        }
        onConfirm={async () => {
          setBusy(true);
          try {
            await api("backup.restore", { file: restore!.file });
            toast("Backup restored. Please sign in again.");
            setSession(null);
          } catch (e) {
            toast(errorText(e), "error");
          } finally {
            setBusy(false);
            setRestore(null);
          }
        }}
      />
    </div>
  );
}

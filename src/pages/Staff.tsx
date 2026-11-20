// Staff: accounts and roles, sign-ins and shifts (attendance, handover notes, cash), and the
// history of who did what.
import { useEffect, useState } from "react";
import { Download, KeyRound, Pencil, Plus, UserCog } from "lucide-react";
import { api, errorText, saveCsv } from "../api";
import { useApp } from "../state";
import { Badge, Button, Empty, ErrorNote, Field, Input, Loading, Modal, Page, PageHeader, Panel, Select, Tabs, Toggle, cx, useLoad } from "../components/ui";
import { addDays, durationLabel, formatDateTime, formatShortDate, formatTime, monthStart, todayKey } from "../../shared/dates";
import { ROLES, ROLE_HELP, initials, label, money } from "../../shared/format";
import type { ActivityEntry, Role, Shift, Staff } from "../../shared/types";

export function StaffPage() {
  const [tab, setTab] = useState<"staff" | "shifts" | "activity">("staff");
  return (
    <Page>
      <PageHeader title="Staff & sign-ins" subtitle="Who can use the software, when they worked, and what they did." />
      <Tabs
        className="mb-4"
        tabs={[
          { value: "staff", label: "Staff accounts" },
          { value: "shifts", label: "Sign-ins & shifts" },
          { value: "activity", label: "Activity history" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "staff" && <StaffAccounts />}
      {tab === "shifts" && <Shifts />}
      {tab === "activity" && <Activity />}
    </Page>
  );
}

function StaffAccounts() {
  const { session } = useApp();
  const { data, setData } = useLoad(() => api<Staff[]>("staff.list"), []);
  const [edit, setEdit] = useState<Partial<Staff> & { password?: string } | null>(null);
  const [reset, setReset] = useState<Staff | null>(null);
  if (!data) return <Loading />;
  return (
    <Panel title={`${data.filter((s) => s.active).length} active accounts`} padded={false} actions={<Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit({ role: "front_desk" })}>Add staff</Button>}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sign-in name</th>
            <th>Role</th>
            <th>Phone</th>
            <th>Last signed in</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr key={s.id} className={cx(!s.active && "opacity-50")}>
              <td>
                <span className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-700">{initials(s.name)}</span>
                  <span className="font-medium">{s.name}</span>
                  {s.id === session?.staff.id && <Badge>You</Badge>}
                  {!s.active && <Badge tone="red">Switched off</Badge>}
                </span>
              </td>
              <td className="font-mono text-[12.5px]">{s.username}</td>
              <td>{label(s.role)}</td>
              <td>{s.phone || "—"}</td>
              <td className="text-slate-600">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}</td>
              <td className="text-right">
                <Button size="sm" variant="ghost" icon={<KeyRound className="size-3.5" />} onClick={() => setReset(s)}>
                  New password
                </Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(s)}>
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <StaffDialog staff={edit} onClose={() => setEdit(null)} onSaved={setData} />
      <ResetDialog staff={reset} onClose={() => setReset(null)} onSaved={setData} />
    </Panel>
  );
}

function StaffDialog({ staff, onClose, onSaved }: { staff: (Partial<Staff> & { password?: string }) | null; onClose: () => void; onSaved: (s: Staff[]) => void }) {
  const { toast, session } = useApp();
  const [v, setV] = useState<Partial<Staff> & { password?: string }>({});
  const [error, setError] = useState("");
  useEffect(() => {
    setV(staff ?? {});
    setError("");
  }, [staff]);
  const isNew = !staff?.id;
  const save = async () => {
    try {
      onSaved(isNew ? await api<Staff[]>("staff.create", v) : await api<Staff[]>("staff.update", { id: v.id, name: v.name, role: v.role, phone: v.phone, active: v.active }));
      toast("Saved");
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const roles = ROLES.filter((r) => r !== "owner" || session?.staff.role === "owner");
  return (
    <Modal open={!!staff} onClose={onClose} title={isNew ? "Add staff" : `Edit ${staff?.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Phone">
          <Input value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </Field>
        <Field label="Sign-in name" hint="Letters and numbers, no spaces">
          <Input value={v.username ?? ""} disabled={!isNew} onChange={(e) => setV({ ...v, username: e.target.value.toLowerCase().replace(/\s/g, "") })} />
        </Field>
        {isNew && (
          <Field label="Password" hint="At least 4 characters">
            <Input type="password" value={v.password ?? ""} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </Field>
        )}
        <Field label="Role" className="col-span-2" hint={v.role ? ROLE_HELP[v.role as Role] : ""}>
          <Select value={v.role ?? "front_desk"} onChange={(e) => setV({ ...v, role: e.target.value as Role })} options={roles.map((r) => ({ value: r, label: label(r) }))} />
        </Field>
        {!isNew && (
          <div className="col-span-2">
            <Toggle checked={v.active ?? true} onChange={(a) => setV({ ...v, active: a })} label="Account switched on" hint="Switch off for staff who have left. Their history stays." />
          </div>
        )}
      </div>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function ResetDialog({ staff, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: (s: Staff[]) => void }) {
  const { toast } = useApp();
  const [p, setP] = useState("");
  const [error, setError] = useState("");
  useEffect(() => (setP(""), setError("")), [staff]);
  return (
    <Modal
      open={!!staff}
      onClose={onClose}
      width={420}
      title={`New password for ${staff?.name}`}
      footer={
        <Button
          variant="primary"
          onClick={async () => {
            try {
              onSaved(await api<Staff[]>("staff.update", { id: staff!.id, password: p }));
              toast("Password changed. Tell them the new password.");
              onClose();
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Set password
        </Button>
      }
    >
      <Field label="New password" hint="At least 4 characters">
        <Input value={p} onChange={(e) => setP(e.target.value)} autoFocus />
      </Field>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function Shifts() {
  const { settings, toast } = useApp();
  const today = todayKey();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const { data, reload } = useLoad(() => api<Shift[]>("shift.list", { from, to }), [from, to]);
  const cur = settings?.currency;
  const rows = data ?? [];
  const hours = new Map<string, number>();
  for (const s of rows) hours.set(s.staffName, (hours.get(s.staffName) ?? 0) + (Date.parse(s.endedAt ?? new Date().toISOString()) - Date.parse(s.startedAt)) / 3600000);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={from === addDays(today, -6) ? "primary" : "secondary"} onClick={() => (setFrom(addDays(today, -6)), setTo(today))}>
          Last 7 days
        </Button>
        <Button size="sm" variant={from === monthStart(today) ? "primary" : "secondary"} onClick={() => (setFrom(monthStart(today)), setTo(today))}>
          This month
        </Button>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36" />
        <span className="text-slate-400">–</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-36" />
        <Button
          size="sm"
          className="ml-auto"
          icon={<Download className="size-3.5" />}
          onClick={() => saveCsv(`shifts-${from}-to-${to}.csv`, ["Staff", "Started", "Ended", "Hours", "Check-ins", "Check-outs", "Bookings", "Cash received", "Cash counted", "Handover note"], rows.map((s) => [s.staffName, formatDateTime(s.startedAt), s.endedAt ? formatDateTime(s.endedAt) : "On shift", Math.round(((Date.parse(s.endedAt ?? new Date().toISOString()) - Date.parse(s.startedAt)) / 3600000) * 10) / 10, s.summary?.checkIns, s.summary?.checkOuts, s.summary?.bookings, s.summary?.cash, s.cashCounted, s.handoverNote]))}
        >
          Excel (CSV)
        </Button>
      </div>
      {!settings?.staffShifts && <p className="text-[13px] text-amber-700">Shifts are switched off in Settings → Front desk, so front-desk staff are not asked to start a shift.</p>}
      <div className="flex flex-wrap gap-3">
        {[...hours.entries()].map(([n, h]) => (
          <div key={n} className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <p className="text-[12px] text-slate-500">{n}</p>
            <p className="text-[17px] font-semibold">{Math.round(h * 10) / 10} h</p>
          </div>
        ))}
      </div>
      <Panel title="Shifts" padded={false}>
        {rows.length === 0 ? (
          <Empty icon={<UserCog />} title="No shifts in these dates" />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Day</th>
                <th>Signed in</th>
                <th>Signed out</th>
                <th>Length</th>
                <th className="num">In / Out / New</th>
                <th className="num">Cash taken</th>
                <th className="num">Cash counted</th>
                <th>Handover note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const diff = s.cashCounted !== null && s.summary ? s.cashCounted - s.summary.cash : 0;
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.staffName}</td>
                    <td>{formatShortDate(s.startedAt)}</td>
                    <td>{formatTime(s.startedAt)}</td>
                    <td>{s.endedAt ? formatTime(s.endedAt) : <Badge tone="green">On shift</Badge>}</td>
                    <td>{durationLabel(s.startedAt, s.endedAt ?? undefined)}</td>
                    <td className="num">{s.summary ? `${s.summary.checkIns} / ${s.summary.checkOuts} / ${s.summary.bookings}` : "—"}</td>
                    <td className="num">{s.summary ? money(s.summary.cash, cur) : "—"}</td>
                    <td className="num">
                      {s.cashCounted !== null ? money(s.cashCounted, cur) : "—"}
                      {Math.abs(diff) >= 1 && <span className={cx("block text-[11px]", diff < 0 ? "text-red-600" : "text-amber-700")}>{diff < 0 ? "short" : "extra"} {money(Math.abs(diff), cur)}</span>}
                    </td>
                    <td className="max-w-xs text-[12.5px] text-slate-600">
                      {s.handoverNote}
                      {s.closedBy && <span className="block text-[11px] text-slate-400">Closed by {s.closedBy}</span>}
                    </td>
                    <td>
                      {!s.endedAt && (
                        <Button size="sm" onClick={async () => {
                          try {
                            await api("shift.close", { id: s.id });
                            toast("Shift closed");
                            reload();
                          } catch (e) {
                            toast(errorText(e), "error");
                          }
                        }}>
                          Close shift
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Activity() {
  const today = todayKey();
  const [from, setFrom] = useState(addDays(today, -2));
  const [to, setTo] = useState(today);
  const { data } = useLoad(() => api<ActivityEntry[]>("activity.list", { from, to, limit: 2000 }), [from, to]);
  return (
    <Panel
      title="Who did what"
      padded={false}
      actions={
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36" />
          <span className="text-slate-400">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-36" />
        </div>
      }
    >
      {!data ? (
        <Loading />
      ) : (
        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                  <td>{a.staffName}</td>
                  <td className="font-medium">{a.action}</td>
                  <td className="text-slate-600">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

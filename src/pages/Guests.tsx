// Guest records: search, returning guests, VIPs, companies, and each guest's stays.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Crown, Download, MessageCircle, Plus, Search, Trash2, Users } from "lucide-react";
import { api, errorText, saveCsv } from "../api";
import { useApp } from "../state";
import { Badge, Button, Empty, ErrorNote, Input, Loading, Modal, Page, PageHeader, Panel, PayBadge, Row, StatusBadge, Tabs, Textarea, useLoad } from "../components/ui";
import { GuestFields, type GuestDraft } from "../components/GuestFields";
import { openWhatsApp } from "../components/WhatsAppDialog";
import { formatDate, formatShortDate } from "../../shared/dates";
import { label, money } from "../../shared/format";
import type { BookingRow, Guest, GuestSummary } from "../../shared/types";

type Filter = "all" | "vip" | "company" | "foreign" | "blocked";

export function Guests() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading } = useLoad(() => api<GuestSummary[]>("guests.list", { q: query, filter }), [query, filter]);
  const cur = settings?.currency;
  const rows = data ?? [];
  return (
    <Page>
      <PageHeader
        title="Guests"
        subtitle="Everyone who has stayed or booked. Returning guests are found by phone or name when booking."
        actions={
          <>
            <Button
              icon={<Download className="size-4" />}
              disabled={!rows.length}
              onClick={() =>
                saveCsv(
                  "guests.csv",
                  ["First name", "Last name", "Phone", "Email", "City", "State", "Nationality", "Company", "GSTIN", "Stays", "Nights", "Paid in total", "Last stay", "VIP"],
                  rows.map((g) => [g.firstName, g.lastName, g.phone, g.email, g.city, g.state, g.nationality, g.company, g.gstin, g.stays, g.nights, g.spent, g.lastStay, g.vip ? "Yes" : ""])
                )
              }
            >
              Excel (CSV)
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Add guest
            </Button>
          </>
        }
      />
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-3 pt-1">
          <Tabs
            tabs={[
              { value: "all", label: "All" },
              { value: "vip", label: "VIP" },
              { value: "company", label: "Companies" },
              { value: "foreign", label: "Foreign" },
              { value: "blocked", label: "Do not allow" },
            ]}
            value={filter}
            onChange={setFilter}
            className="border-b-0"
          />
          <div className="relative ml-auto w-80 py-2">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, company, city, GSTIN" className="pl-8" />
          </div>
        </div>
        {loading && !data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={<Users />} title="No guests found" />
        ) : (
          <div className="max-h-[calc(100vh-240px)] overflow-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Company</th>
                  <th className="num">Stays</th>
                  <th className="num">Nights</th>
                  <th className="num">Paid in total</th>
                  <th>Last stay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id} className="clickable" onClick={() => navigate(`/guests/${g.id}`)}>
                    <td>
                      <span className="flex items-center gap-1.5 font-medium">
                        {g.firstName} {g.lastName}
                        {g.vip && <Crown className="size-3.5 text-amber-500" />}
                        {g.blacklisted && <Badge tone="red">Do not allow</Badge>}
                      </span>
                    </td>
                    <td>{g.phone}</td>
                    <td className="text-slate-600">{[g.city, g.nationality !== "Indian" ? g.nationality : ""].filter(Boolean).join(", ")}</td>
                    <td className="text-slate-600">{g.company}</td>
                    <td className="num">{g.stays}</td>
                    <td className="num">{g.nights}</td>
                    <td className="num">{money(g.spent, cur)}</td>
                    <td className="text-slate-600">{g.lastStay ? formatDate(g.lastStay) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <GuestEditDialog open={adding} onClose={() => setAdding(false)} onSaved={(g) => navigate(`/guests/${g.id}`)} />
    </Page>
  );
}

export function GuestEditDialog({ open, onClose, guest, onSaved }: { open: boolean; onClose: () => void; guest?: Guest; onSaved: (g: Guest) => void }) {
  const { toast } = useApp();
  const [draft, setDraft] = useState<GuestDraft>(guest ?? { nationality: "Indian" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(guest ?? { nationality: "Indian" });
      setError("");
    }
  }, [open, guest]);
  const save = async () => {
    setBusy(true);
    try {
      const { createdAt: _c, ...rest } = draft as Guest;
      void _c;
      const g = await api<Guest>("guests.save", rest);
      toast("Guest saved");
      onSaved(g);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} width={640} title={guest ? "Edit guest" : "Add guest"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save guest</Button></>}>
      <GuestFields value={draft} onChange={setDraft} full />
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

export function GuestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, can, toast } = useApp();
  const { data, reload } = useLoad(() => api<{ guest: GuestSummary; bookings: BookingRow[] }>("guests.get", { id }), [id]);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState(false);
  const [text, setText] = useState("");
  if (!data) return <Loading />;
  const g = data.guest;
  const cur = settings?.currency;
  const due = data.bookings.reduce((s, b) => s + (b.status === "cancelled" || b.status === "no_show" ? 0 : Math.max(0, b.balance)), 0);
  return (
    <Page>
      <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Back
      </button>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {g.firstName} {g.lastName} {g.vip && <Crown className="size-5 text-amber-500" />} {g.blacklisted && <Badge tone="red">Do not allow</Badge>}
          </span>
        }
        subtitle={`${g.phone}${g.city ? ` · ${g.city}` : ""} · guest since ${formatDate(g.createdAt)}`}
        actions={
          <>
            <Button icon={<MessageCircle className="size-4 text-emerald-600" />} onClick={() => (setText(`Dear ${g.firstName},\n\n\nRegards,\n${settings?.hotelName}`), setMsg(true))}>
              WhatsApp
            </Button>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            {can("delete") && data.bookings.length === 0 && (
              <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={async () => {
                if (!confirm("Delete this guest?")) return;
                try {
                  await api("guests.delete", { id: g.id });
                  navigate("/guests");
                } catch (e) {
                  toast(errorText(e), "error");
                }
              }}>
                Delete
              </Button>
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/bookings/new")}>
              New booking
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Panel title="Details">
            <Row label="Phone">{g.phone}</Row>
            <Row label="Email">{g.email || "—"}</Row>
            <Row label="Address">{[g.address, g.city, g.state, g.pinCode].filter(Boolean).join(", ") || "—"}</Row>
            <Row label="Nationality">{g.nationality}</Row>
            {g.passportNo && <Row label="Passport">{g.passportNo}</Row>}
            <Row label="ID usually shown">{g.idType ? label(g.idType) : "—"}</Row>
            <Row label="Date of birth">{g.dateOfBirth ? formatDate(g.dateOfBirth) : "—"}</Row>
            <Row label="Company">{g.company || "—"}</Row>
            <Row label="GSTIN">{g.gstin || "—"}</Row>
            {g.notes && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12.5px] text-amber-900">{g.notes}</p>}
          </Panel>
          <Panel title="Summary">
            <Row label="Stays">{g.stays}</Row>
            <Row label="Nights">{g.nights}</Row>
            <Row label="Paid in total">{money(g.spent, cur)}</Row>
            <Row label="Money due" strong className={due >= 1 ? "text-red-600" : ""}>
              {money(due, cur)}
            </Row>
          </Panel>
        </div>
        <Panel title="Bookings" padded={false}>
          {data.bookings.length === 0 ? (
            <Empty title="No bookings yet" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Room</th>
                  <th>Stay</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => navigate(`/bookings/${b.id}`)}>
                    <td className="font-medium text-brand-700">#{b.number}</td>
                    <td>{b.roomNumber}</td>
                    <td>
                      {formatShortDate(b.checkInDate)} → {formatShortDate(b.checkOutDate)}
                    </td>
                    <td>{label(b.source)}</td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="num">{money(b.total, cur)}</td>
                    <td className="num">{b.balance >= 1 && b.status !== "cancelled" ? <span className="text-red-600">{money(b.balance, cur)}</span> : <PayBadge total={b.total} paid={b.paid} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <GuestEditDialog open={editing} onClose={() => setEditing(false)} guest={g} onSaved={() => reload()} />
      <Modal
        open={msg}
        onClose={() => setMsg(false)}
        title={`WhatsApp to ${g.firstName}`}
        footer={
          <Button
            variant="success"
            onClick={async () => {
              if (!settings) return;
              await openWhatsApp(g.phone, text, settings);
              await api("messages.log", { guestId: g.id, kind: "custom", phone: g.phone, text });
              setMsg(false);
            }}
          >
            Open in WhatsApp
          </Button>
        }
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} />
      </Modal>
    </Page>
  );
}

// Money received: by day or any dates, by cash / UPI / card, by staff member, with refunds.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Wallet } from "lucide-react";
import { api, saveCsv } from "../api";
import { useApp } from "../state";
import { Badge, Button, Empty, Input, Loading, Page, PageHeader, Panel, Row, Select, cx, useLoad } from "../components/ui";
import { addDays, formatDateTime, monthStart, todayKey } from "../../shared/dates";
import { PAYMENT_METHODS, label, money, money2 } from "../../shared/format";

interface PayRow {
  id: string;
  bookingId: string;
  number: number;
  guestName: string;
  roomNumber: string;
  amount: number;
  method: string;
  type: string;
  reference: string | null;
  notes: string | null;
  receivedBy: string | null;
  paidAt: string;
}

export function Payments() {
  const navigate = useNavigate();
  const { settings } = useApp();
  const today = todayKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [method, setMethod] = useState("");
  const { data, loading } = useLoad(() => api<PayRow[]>("payments.list", { from, to, method: method || undefined }), [from, to, method]);
  const rows = data ?? [];
  const cur = settings?.currency;
  const byMethod = new Map<string, number>();
  const byStaff = new Map<string, number>();
  let inTotal = 0;
  let refunds = 0;
  for (const p of rows) {
    const v = p.type === "refund" ? -p.amount : p.amount;
    if (p.type === "refund") refunds += p.amount;
    else inTotal += p.amount;
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + v);
    byStaff.set(p.receivedBy ?? "—", (byStaff.get(p.receivedBy ?? "—") ?? 0) + v);
  }
  const quick = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart(today), to: today },
  ];
  return (
    <Page>
      <PageHeader
        title="Payments"
        subtitle="Money received and refunded. Cash in the drawer = cash received minus cash refunds."
        actions={
          <Button
            icon={<Download className="size-4" />}
            disabled={!rows.length}
            onClick={() => saveCsv(`payments-${from}-to-${to}.csv`, ["Date & time", "Booking", "Guest", "Room", "Type", "Method", "Reference", "Taken by", "Amount"], rows.map((p) => [formatDateTime(p.paidAt), p.number, p.guestName, p.roomNumber, label(p.type), label(p.method), p.reference, p.receivedBy, p.type === "refund" ? -p.amount : p.amount]))}
          >
            Excel (CSV)
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {quick.map((q) => (
          <Button key={q.label} size="sm" variant={from === q.from && to === q.to ? "primary" : "secondary"} onClick={() => (setFrom(q.from), setTo(q.to))}>
            {q.label}
          </Button>
        ))}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 w-40" />
        <span className="text-slate-400">–</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <Select value={method} onChange={(e) => setMethod(e.target.value)} className="w-44" options={[{ value: "", label: "All methods" }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: label(m) }))]} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <Panel title={`${rows.length} payments`} padded={false}>
          {loading && !data ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty icon={<Wallet />} title="No payments in these dates" />
          ) : (
            <div className="max-h-[calc(100vh-260px)] overflow-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Booking</th>
                    <th>Guest</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Taken by</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/bookings/${p.bookingId}`)}>
                      <td>{formatDateTime(p.paidAt)}</td>
                      <td className="text-brand-700">#{p.number}</td>
                      <td>
                        {p.guestName} <span className="text-slate-500">· {p.roomNumber}</span>
                      </td>
                      <td>
                        {label(p.method)} {p.type === "refund" && <Badge tone="red">Refund</Badge>}
                        {p.type === "advance" && <Badge tone="blue">Advance</Badge>}
                      </td>
                      <td className="text-slate-500">{p.reference || "—"}</td>
                      <td className="text-slate-500">{p.receivedBy}</td>
                      <td className={cx("num font-medium", p.type === "refund" && "text-red-600")}>{p.type === "refund" ? `− ${money2(p.amount, cur)}` : money2(p.amount, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Totals">
            <Row label="Received">{money2(inTotal, cur)}</Row>
            <Row label="Refunded">− {money2(refunds, cur)}</Row>
            <Row label="Net" strong className="border-t border-slate-100 pt-2">
              {money2(inTotal - refunds, cur)}
            </Row>
          </Panel>
          <Panel title="By method">
            {[...byMethod.entries()].map(([m, v]) => (
              <Row key={m} label={label(m)} strong={m === "cash"}>
                {money(v, cur)}
              </Row>
            ))}
            {byMethod.size === 0 && <p className="text-[13px] text-slate-400">—</p>}
          </Panel>
          <Panel title="By staff">
            {[...byStaff.entries()].map(([s, v]) => (
              <Row key={s} label={s}>
                {money(v, cur)}
              </Row>
            ))}
            {byStaff.size === 0 && <p className="text-[13px] text-slate-400">—</p>}
          </Panel>
        </div>
      </div>
    </Page>
  );
}

// WhatsApp: every message sent to guests, and a quick message to any number.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Send, Settings as Cog } from "lucide-react";
import { api } from "../api";
import { useApp } from "../state";
import { Button, Empty, Field, Input, Loading, Modal, Note, Page, PageHeader, Panel, Textarea, useLoad } from "../components/ui";
import { openWhatsApp } from "../components/WhatsAppDialog";
import { formatDateTime } from "../../shared/dates";
import { label } from "../../shared/format";
import { MESSAGE_TITLES, type MessageKind } from "../../shared/messages";

interface Msg {
  id: string;
  bookingId: string | null;
  number: number | null;
  guestName: string | null;
  kind: string;
  phone: string;
  text: string;
  sentBy: string;
  createdAt: string;
}

export function WhatsApp() {
  const navigate = useNavigate();
  const { settings, can, toast } = useApp();
  const { data, reload } = useLoad(() => api<Msg[]>("messages.list", { limit: 500 }), []);
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [view, setView] = useState<Msg | null>(null);
  return (
    <Page>
      <PageHeader
        title="WhatsApp messages"
        subtitle="Messages open in WhatsApp on this computer, ready to send. Booking confirmations, welcome and thank-you messages are sent from each booking."
        actions={
          <>
            {can("settings") && (
              <Button icon={<Cog className="size-4" />} onClick={() => navigate("/settings?tab=whatsapp")}>
                Change the wording
              </Button>
            )}
            <Button variant="success" icon={<Send className="size-4" />} onClick={() => setOpen(true)}>
              New message
            </Button>
          </>
        }
      />
      <Note tone="slate" className="mb-4" icon={<MessageCircle />}>
        Install <b>WhatsApp Desktop</b> on this computer and link it to the hotel's phone (WhatsApp → Linked devices). If you prefer WhatsApp Web in the browser, choose it in Settings → WhatsApp.
      </Note>
      <Panel title="Sent from this computer" padded={false}>
        {!data ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty icon={<MessageCircle />} title="No messages yet" text="Open a booking and press WhatsApp to send a confirmation." />
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Guest</th>
                <th>Number</th>
                <th>Message</th>
                <th>Sent by</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => setView(m)}>
                  <td>{formatDateTime(m.createdAt)}</td>
                  <td>
                    {m.guestName ?? "—"} {m.number && <span className="text-slate-500">· #{m.number}</span>}
                  </td>
                  <td>{m.phone}</td>
                  <td>
                    <span className="font-medium">{MESSAGE_TITLES[m.kind as MessageKind]?.title ?? label(m.kind)}</span>
                    <span className="block max-w-xl truncate text-[12px] text-slate-500">{m.text.split("\n").join(" · ")}</span>
                  </td>
                  <td className="text-slate-500">{m.sentBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New WhatsApp message"
        footer={
          <Button
            variant="success"
            icon={<Send className="size-4" />}
            disabled={!phone.trim() || !text.trim()}
            onClick={async () => {
              if (!settings) return;
              await openWhatsApp(phone, text, settings);
              await api("messages.log", { kind: "custom", phone, text });
              toast("WhatsApp opened. Press Send there.", "info");
              setOpen(false);
              setText("");
              setPhone("");
              reload();
            }}
          >
            Open in WhatsApp
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="WhatsApp number">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" autoFocus />
          </Field>
          <Field label="Message">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} />
          </Field>
        </div>
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title={view?.guestName ?? view?.phone ?? ""} subtitle={view ? `${formatDateTime(view.createdAt)} · ${view.sentBy}` : ""} footer={view?.bookingId && <Button onClick={() => navigate(`/bookings/${view.bookingId}`)}>Open booking</Button>}>
        <pre className="font-sans text-[13px] whitespace-pre-wrap">{view?.text}</pre>
      </Modal>
    </Page>
  );
}

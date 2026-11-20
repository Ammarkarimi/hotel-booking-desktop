// Send a message to a guest on WhatsApp: the text is filled in from the booking, can be changed,
// and opens in WhatsApp on this computer (the app or WhatsApp Web) ready to send.
import { useEffect, useState } from "react";
import { Copy, MessageCircle, Send } from "lucide-react";
import { api, bridge } from "../api";
import { useApp } from "../state";
import { Button, Field, Input, Modal, Note, Select, Textarea } from "./ui";
import { MESSAGE_KINDS, MESSAGE_TITLES, bookingMessage, messageKindFor, type MessageKind } from "../../shared/messages";
import { whatsappNumber } from "../../shared/format";
import type { FullBooking, Settings } from "../../shared/types";

export function whatsappUrl(phone: string, text: string, s: Settings) {
  const num = whatsappNumber(phone, s.countryCode);
  const t = encodeURIComponent(text);
  return s.whatsappMode === "web" ? `https://web.whatsapp.com/send?phone=${num}&text=${t}` : `whatsapp://send?phone=${num}&text=${t}`;
}

/** Opens WhatsApp with the text; if the WhatsApp app is not installed, falls back to wa.me in the browser. */
export async function openWhatsApp(phone: string, text: string, s: Settings) {
  const ok = await bridge().openExternal(whatsappUrl(phone, text, s));
  if (!ok) await bridge().openExternal(`https://wa.me/${whatsappNumber(phone, s.countryCode)}?text=${encodeURIComponent(text)}`);
}

export function WhatsAppDialog({ open, onClose, booking, kind: initialKind, onSent }: { open: boolean; onClose: () => void; booking: FullBooking; kind?: MessageKind; onSent?: () => void }) {
  const { settings, toast } = useApp();
  const [kind, setKind] = useState<MessageKind>(initialKind ?? messageKindFor(booking, booking.folio.balance));
  const [text, setText] = useState("");
  const [phone, setPhone] = useState(booking.guest.phone);
  useEffect(() => {
    if (open) {
      const k = initialKind ?? messageKindFor(booking, booking.folio.balance);
      setKind(k);
      setPhone(booking.guest.phone);
    }
  }, [open, initialKind, booking]);
  useEffect(() => {
    if (settings) setText(bookingMessage(kind, booking, settings));
  }, [kind, booking, settings]);
  if (!settings) return null;

  const send = async () => {
    await openWhatsApp(phone, text, settings);
    await api("messages.log", { bookingId: booking.id, guestId: booking.guestId, kind, phone, text });
    toast("WhatsApp opened with the message. Press Send in WhatsApp.", "info");
    onSent?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title={
        <span className="flex items-center gap-2">
          <MessageCircle className="size-5 text-emerald-600" /> WhatsApp to {booking.guestName}
        </span>
      }
      footer={
        <>
          <Button
            icon={<Copy className="size-4" />}
            onClick={() => {
              void navigator.clipboard.writeText(text);
              toast("Message copied");
            }}
          >
            Copy text
          </Button>
          <Button variant="success" icon={<Send className="size-4" />} onClick={send} disabled={!phone.trim() || !text.trim()}>
            Open in WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Message">
            <Select value={kind} onChange={(e) => setKind(e.target.value as MessageKind)} options={MESSAGE_KINDS.map((k) => ({ value: k, label: MESSAGE_TITLES[k].title }))} />
          </Field>
          <Field label="WhatsApp number">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Text (you can change it before sending)">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={13} className="font-[inherit] text-[13px]" />
        </Field>
        <Note tone="slate">
          {settings.whatsappMode === "web" ? "Opens WhatsApp Web in your browser." : "Opens the WhatsApp app on this computer."} The message is ready; press Send there. To change the wording for every guest, go to Settings → WhatsApp.
        </Note>
      </div>
    </Modal>
  );
}

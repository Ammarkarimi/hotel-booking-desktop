// WhatsApp messages to guests. The owner can change the wording in Settings; {fields} are filled in
// from the booking. A line whose field has nothing to show (for example no invoice yet) is left out.
import { clockLabel, formatDate, formatDateTime } from "./dates";
import { label, money } from "./format";
import type { FullBooking, Settings } from "./types";

export const MESSAGE_KINDS = ["booking", "checkIn", "checkOut", "reminder"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_TITLES: Record<MessageKind, { title: string; when: string; setting: keyof Settings }> = {
  booking: { title: "Booking confirmation", when: "After a booking is made, and any time before the guest arrives.", setting: "msgBooking" },
  checkIn: { title: "Welcome at check-in", when: "Right after check-in, and while the guest is staying.", setting: "msgCheckIn" },
  checkOut: { title: "Thank you at check-out", when: "Right after check-out, with the invoice number.", setting: "msgCheckOut" },
  reminder: { title: "Payment reminder", when: "When money is still to be paid on a booking.", setting: "msgReminder" },
};

export const DEFAULT_MESSAGES: Record<MessageKind, string> = {
  booking: [
    "Dear {guest},",
    "Your booking at {hotel} is confirmed.",
    "",
    "Booking no: #{booking_no}",
    "Room: {room_type} room",
    "Guests: {guests}",
    "Arrival: {arrival_date}, check-in from {check_in_time}",
    "Departure: {leaving_date}, check-out by {check_out_time}",
    "Total: {total}",
    "Paid: {paid}",
    "Balance to pay: {balance}",
    "Pay by UPI: {upi_id}",
    "",
    "Address: {hotel_address}",
    "Questions? Call us on {hotel_phone}",
    "Thank you for choosing {hotel}!",
  ].join("\n"),
  checkIn: [
    "Welcome to {hotel}, {guest}!",
    "",
    "You are checked in. Your stay details:",
    "Booking no: #{booking_no}",
    "Room: {room_no} ({room_type})",
    "Checked in: {checked_in_at}",
    "Check-out: {leaving_date} by {check_out_time}",
    "",
    "Bill so far: {total}",
    "Paid: {paid}",
    "Balance: {balance}",
    "",
    "For anything you need, call the front desk on {hotel_phone}.",
    "Have a pleasant stay!",
  ].join("\n"),
  checkOut: [
    "Dear {guest},",
    "Thank you for staying at {hotel}!",
    "",
    "Booking no: #{booking_no}",
    "Invoice: {invoice_no}",
    "Stay: {arrival_date} to {leaving_date} ({nights})",
    "Total bill: {total}",
    "Paid: {paid}",
    "Balance: {balance}",
    "",
    "We hope to see you again. If you enjoyed your stay, a short review helps us a lot: {review_link}",
    "For your next booking call us on {hotel_phone}.",
  ].join("\n"),
  reminder: [
    "Dear {guest},",
    "A gentle reminder from {hotel} about booking #{booking_no} ({arrival_date} to {leaving_date}).",
    "",
    "Total: {total}",
    "Paid: {paid}",
    "Balance to pay: {balance}",
    "Pay by UPI: {upi_id}",
    "",
    "Thank you! For any questions call {hotel_phone}.",
  ].join("\n"),
};

export const MESSAGE_FIELDS: { key: string; label: string }[] = [
  { key: "hotel", label: "Hotel name" },
  { key: "guest", label: "Guest name" },
  { key: "booking_no", label: "Booking number" },
  { key: "room_type", label: "Room type" },
  { key: "room_no", label: "Room number" },
  { key: "guests", label: "Adults and children" },
  { key: "arrival_date", label: "Arrival date" },
  { key: "leaving_date", label: "Leaving date" },
  { key: "nights", label: "Number of nights" },
  { key: "check_in_time", label: "Hotel check-in time" },
  { key: "check_out_time", label: "Hotel check-out time" },
  { key: "checked_in_at", label: "When the guest checked in" },
  { key: "total", label: "Bill total" },
  { key: "paid", label: "Paid so far" },
  { key: "balance", label: "Balance to pay" },
  { key: "invoice_no", label: "Invoice number" },
  { key: "upi_id", label: "Your UPI ID (only while money is due)" },
  { key: "review_link", label: "Your Google review link" },
  { key: "hotel_phone", label: "Hotel phone" },
  { key: "hotel_address", label: "Hotel address" },
];

export function messageValues(b: FullBooking, s: Settings): Record<string, string> {
  const m = (n: number) => money(n, s.currency, Number.isInteger(n) ? 0 : 2);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const balance = Math.max(0, b.folio.balance);
  return {
    hotel: s.hotelName,
    guest: b.guestName,
    booking_no: String(b.number),
    room_type: label(b.room.type),
    room_no: b.room.roomNumber,
    guests: [plural(b.adults, "adult", "adults"), b.children ? plural(b.children, "child", "children") : ""].filter(Boolean).join(", "),
    arrival_date: formatDate(b.checkInDate),
    leaving_date: formatDate(b.checkOutDate),
    nights: plural(b.folio.nightCount, "night", "nights"),
    check_in_time: clockLabel(s.checkInTime),
    check_out_time: clockLabel(s.checkOutTime),
    checked_in_at: b.actualCheckIn ? formatDateTime(b.actualCheckIn) : "",
    total: m(b.folio.grandTotal),
    paid: m(b.folio.netPaid),
    balance: m(balance),
    invoice_no: b.bill?.invoiceNumber ?? "",
    upi_id: balance >= 1 ? s.upiId : "",
    review_link: s.reviewLink,
    hotel_phone: s.phone,
    hotel_address: [s.address, s.city].filter(Boolean).join(", "),
  };
}

/**
 * Fills the {fields} in a message. A line with a field that has nothing to show is left out
 * (so "Invoice: {invoice_no}" disappears before check-out), and blank lines never pile up.
 */
export function fillMessage(template: string, values: Record<string, string>) {
  const lines: string[] = [];
  for (const line of template.replace(/\r\n/g, "\n").split("\n")) {
    let missing = false;
    const filled = line.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
      if (!(key in values)) return whole;
      if (!values[key]) missing = true;
      return values[key];
    });
    if (missing) continue;
    if (!filled.trim() && (lines.length === 0 || !lines[lines.length - 1].trim())) continue;
    lines.push(filled.trimEnd());
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n");
}

export function templateFor(kind: MessageKind, s: Settings) {
  const own = String(s[MESSAGE_TITLES[kind].setting] ?? "").trim();
  return own || DEFAULT_MESSAGES[kind];
}

export function bookingMessage(kind: MessageKind, b: FullBooking, s: Settings) {
  return fillMessage(templateFor(kind, s), messageValues(b, s));
}

/** Which message suits a booking now. */
export function messageKindFor(b: { status: string }, balance: number): MessageKind {
  if (b.status === "checked_in") return "checkIn";
  if (b.status === "checked_out") return balance >= 1 ? "reminder" : "checkOut";
  return "booking";
}

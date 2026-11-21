// Pathik (Gujarat police guest register): the details of a stay for Pathik's form, opening Pathik
// with the form filled in, and which stays have been entered.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathikRecord } from "../../shared/pathik";
import { now, update } from "../db";
import { fail, log, requirePerm } from "./context";
import { bookingRows, loadBooking } from "./bookings";
import { getSettings } from "./settings";
import { forgetPathikLogin, openPathik, refillPathik } from "../pathik";

function record(bookingId: string) {
  const b = loadBooking(bookingId);
  if (b.status === "cancelled" || b.status === "no_show") fail("This booking is cancelled, so it is not entered in Pathik");
  return pathikRecord(b, getSettings());
}

export const pathikApi = {
  "pathik.record": ({ bookingId }: { bookingId: string }) => {
    requirePerm("frontdesk");
    return record(bookingId);
  },
  "pathik.open": ({ bookingId }: { bookingId: string }) => {
    requirePerm("frontdesk");
    const s = getSettings();
    if (!s.pathik) fail("Pathik is switched off. Switch it on in Settings → Front desk.");
    const icon = join(__dirname, "..", "build", "icon.png");
    openPathik({ record: record(bookingId), addGuestUrl: s.pathikUrl, dateFormat: s.pathikDateFormat, timeFormat: s.pathikTimeFormat, icon: existsSync(icon) ? icon : undefined });
    return true;
  },
  "pathik.refill": ({ bookingId }: { bookingId: string }) => {
    requirePerm("frontdesk");
    const s = getSettings();
    // The details may have changed: send the new ones.
    openPathik({ record: record(bookingId), addGuestUrl: s.pathikUrl, dateFormat: s.pathikDateFormat, timeFormat: s.pathikTimeFormat });
    return refillPathik();
  },
  "pathik.mark": ({ bookingId, entered }: { bookingId: string; entered: boolean }) => {
    const staff = requirePerm("frontdesk");
    const b = loadBooking(bookingId);
    update("bookings", b.id, { pathikAt: entered ? now() : null, pathikBy: entered ? staff.name : null });
    log(entered ? "Entered in Pathik" : "Pathik mark removed", `#${b.number} ${b.guestName}`, b.id);
    return record(bookingId);
  },
  /** Guests staying now (or who left in the last 2 days) who are not marked as entered. */
  "pathik.pending": () => {
    requirePerm("frontdesk");
    if (!getSettings().pathik) return [];
    return bookingRows("(b.status = 'checked_in' OR (b.status = 'checked_out' AND substr(b.actualCheckOut, 1, 10) >= date('now', '-2 days'))) AND b.pathikAt IS NULL", [], "b.actualCheckIn");
  },
  "pathik.forgetLogin": async () => {
    requirePerm("settings");
    await forgetPathikLogin();
    log("Signed out of Pathik on this computer");
    return true;
  },
};

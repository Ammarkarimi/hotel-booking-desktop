// Rooms and housekeeping: which rooms need cleaning, who is cleaning them, and maintenance.
import { todayKey } from "../../shared/dates";
import type { Housekeeping, Room } from "../../shared/types";
import { all, get, insert, now, run, scalar, tx, update } from "../db";
import { fail, log, numberIn, opt, requirePerm, requireStaff, str } from "./context";
import { getSettings } from "./settings";

export function roomFromRow(r: Record<string, unknown>): Room {
  return r as unknown as Room;
}

export function listRooms(): Room[] {
  return all("SELECT * FROM rooms WHERE deleted = 0 ORDER BY sortOrder, CAST(roomNumber AS INTEGER), roomNumber").map(roomFromRow);
}

const HK: Housekeeping[] = ["clean", "dirty", "cleaning", "inspect"];

function roomFields(input: Partial<Room>) {
  const roomNumber = str(input.roomNumber, 20);
  if (!roomNumber) fail("Please enter the room number or name");
  const types = getSettings().roomTypes;
  const type = str(input.type, 40) || types[0];
  return {
    roomNumber,
    type,
    floor: opt(input.floor, 20),
    capacity: Math.round(numberIn(input.capacity ?? 2, "Guests allowed", 1, 50)),
    pricePerNight: numberIn(input.pricePerNight, "Price per night", 0, 1e7),
    description: opt(input.description, 500),
  };
}

export function addRoom(input: Partial<Room>) {
  const f = roomFields(input);
  if (get("SELECT id FROM rooms WHERE roomNumber = ? AND deleted = 0", f.roomNumber)) fail(`Room ${f.roomNumber} already exists`);
  const order = (scalar<number>("SELECT COALESCE(MAX(sortOrder), 0) FROM rooms") ?? 0) + 1;
  return insert("rooms", { ...f, status: "available", housekeeping: "clean", sortOrder: order, createdAt: now() });
}

export const roomsApi = {
  "rooms.list": () => (requireStaff(), listRooms()),
  "rooms.save": (input: Partial<Room>) => {
    requirePerm("rooms");
    return tx(() => {
      if (input.id) {
        const f = roomFields(input);
        if (get("SELECT id FROM rooms WHERE roomNumber = ? AND deleted = 0 AND id != ?", f.roomNumber, input.id)) fail(`Room ${f.roomNumber} already exists`);
        update("rooms", input.id, { ...f, sortOrder: input.sortOrder !== undefined ? Number(input.sortOrder) || 0 : undefined });
        log("Changed room", f.roomNumber);
      } else {
        addRoom(input);
        log("Added room", str(input.roomNumber));
      }
      return listRooms();
    });
  },
  "rooms.addMany": (input: { from: number; to: number; type: string; pricePerNight: number; capacity: number; floor?: string; prefix?: string }) => {
    requirePerm("rooms");
    const from = Math.round(numberIn(input.from, "First room number", 0, 99999));
    const to = Math.round(numberIn(input.to, "Last room number", from, from + 200));
    return tx(() => {
      let added = 0;
      for (let n = from; n <= to; n++) {
        const roomNumber = `${str(input.prefix, 5)}${n}`;
        if (get("SELECT id FROM rooms WHERE roomNumber = ? AND deleted = 0", roomNumber)) continue;
        addRoom({ roomNumber, type: input.type, pricePerNight: input.pricePerNight, capacity: input.capacity, floor: input.floor });
        added++;
      }
      log("Added rooms", `${added} rooms`);
      return listRooms();
    });
  },
  "rooms.delete": ({ id }: { id: string }) => {
    requirePerm("rooms");
    const r = get<Room>("SELECT * FROM rooms WHERE id = ?", id);
    if (!r) fail("Room not found");
    const future = scalar<number>("SELECT COUNT(*) FROM bookings WHERE roomId = ? AND status IN ('reserved','checked_in')", id);
    if (future) fail(`Room ${r.roomNumber} has ${future} booking(s) that are not finished. Move them to another room first.`);
    const any = scalar<number>("SELECT COUNT(*) FROM bookings WHERE roomId = ?", id);
    if (any) run("UPDATE rooms SET deleted = 1 WHERE id = ?", id);
    else run("DELETE FROM rooms WHERE id = ?", id);
    log("Removed room", r.roomNumber);
    return listRooms();
  },
  "rooms.setStatus": ({ id, status, notes }: { id: string; status: "available" | "maintenance"; notes?: string }) => {
    requirePerm("housekeeping");
    const r = get<Room>("SELECT * FROM rooms WHERE id = ?", id);
    if (!r) fail("Room not found");
    if (status === "maintenance") {
      const staying = scalar<number>("SELECT COUNT(*) FROM bookings WHERE roomId = ? AND status = 'checked_in'", id);
      if (staying) fail(`A guest is staying in room ${r.roomNumber}. Move them to another room first.`);
    }
    update("rooms", id, { status: status === "maintenance" ? "maintenance" : "available", hkNotes: notes !== undefined ? opt(notes, 300) : undefined, hkUpdatedAt: now() });
    log(status === "maintenance" ? "Room under maintenance" : "Room back in use", `${r.roomNumber}${notes ? `: ${notes}` : ""}`);
    return listRooms();
  },

  "housekeeping.board": () => {
    requirePerm("housekeeping");
    const today = todayKey();
    const rooms = listRooms();
    const staying = all<{ roomId: string; guestName: string; checkOutDate: string; number: number; id: string }>(
      "SELECT b.id, b.roomId, b.number, b.checkOutDate, trim(g.firstName || ' ' || g.lastName) AS guestName FROM bookings b JOIN guests g ON g.id = b.guestId WHERE b.status = 'checked_in'"
    );
    const arriving = all<{ roomId: string; guestName: string; number: number }>(
      "SELECT b.roomId, b.number, trim(g.firstName || ' ' || g.lastName) AS guestName FROM bookings b JOIN guests g ON g.id = b.guestId WHERE b.status = 'reserved' AND b.checkInDate <= ?",
      today
    );
    const log = all("SELECT h.*, r.roomNumber FROM hk_log h JOIN rooms r ON r.id = h.roomId WHERE substr(h.createdAt, 1, 10) = ? ORDER BY h.createdAt DESC LIMIT 200", today);
    return {
      rooms: rooms.map((r) => {
        const stay = staying.find((s) => s.roomId === r.id);
        const arrival = arriving.find((a) => a.roomId === r.id);
        return { ...r, occupied: !!stay, guestName: stay?.guestName ?? null, leavingToday: !!stay && stay.checkOutDate <= today, arrivalToday: arrival?.guestName ?? null };
      }),
      log,
    };
  },
  "housekeeping.set": ({ id, housekeeping, housekeeper, notes }: { id: string; housekeeping: Housekeeping; housekeeper?: string; notes?: string }) => {
    const staff = requirePerm("housekeeping");
    if (!HK.includes(housekeeping)) fail("Unknown cleaning status");
    const r = get<Room>("SELECT * FROM rooms WHERE id = ?", id);
    if (!r) fail("Room not found");
    tx(() => {
      update("rooms", id, {
        housekeeping,
        housekeeper: housekeeper !== undefined ? opt(housekeeper, 60) : housekeeping === "cleaning" ? staff.name : undefined,
        hkNotes: notes !== undefined ? opt(notes, 300) : housekeeping === "clean" ? null : undefined,
        hkUpdatedAt: now(),
      });
      insert("hk_log", { roomId: id, status: housekeeping, staffName: staff.name, notes: opt(notes, 300), createdAt: now() });
    });
    return roomsApi["housekeeping.board"]();
  },
  "housekeeping.markAll": ({ from, to }: { from: Housekeeping; to: Housekeeping }) => {
    const staff = requirePerm("housekeeping");
    if (!HK.includes(to)) fail("Unknown cleaning status");
    tx(() => {
      for (const r of all<Room>("SELECT * FROM rooms WHERE deleted = 0 AND housekeeping = ?", from)) {
        update("rooms", r.id, { housekeeping: to, hkUpdatedAt: now() });
        insert("hk_log", { roomId: r.id, status: to, staffName: staff.name, notes: null, createdAt: now() });
      }
    });
    log("Housekeeping", `All ${from} rooms marked ${to}`);
    return roomsApi["housekeeping.board"]();
  },
};

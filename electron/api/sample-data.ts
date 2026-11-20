// Sample hotel data for trying the software out or training staff: rooms, guests and a few weeks
// of bookings (past stays with invoices, guests staying now, arrivals today, future bookings).
import { addDays, todayKey } from "../../shared/dates";
import { round2 } from "../../shared/pricing";
import { insert, nextSeq, now, run, scalar, tx } from "../db";
import { fail } from "./context";
import { folioOf, nextInvoiceNumber } from "./bookings";
import { addRoom, listRooms } from "./rooms";

const FIRST = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Rohan", "Kavya", "Arjun", "Meera", "Sanjay", "Pooja", "Karan", "Neha", "Aditya", "Divya", "Manish", "Ritu", "Suresh", "Lakshmi", "Imran", "Fatima", "Harpreet", "Gurpreet", "Joseph", "Mary", "Deepak", "Swati", "Nikhil", "Isha"];
const LAST = ["Sharma", "Patel", "Verma", "Iyer", "Reddy", "Singh", "Gupta", "Nair", "Mehta", "Joshi", "Khan", "Das", "Kulkarni", "Chopra", "Bose", "Menon", "Shah", "Rao", "Pillai", "Desai"];
const CITIES: Array<[string, string]> = [["Mumbai", "Maharashtra"], ["Pune", "Maharashtra"], ["Ahmedabad", "Gujarat"], ["Surat", "Gujarat"], ["Delhi", "Delhi"], ["Bengaluru", "Karnataka"], ["Chennai", "Tamil Nadu"], ["Hyderabad", "Telangana"], ["Jaipur", "Rajasthan"], ["Kolkata", "West Bengal"], ["Indore", "Madhya Pradesh"], ["Lucknow", "Uttar Pradesh"]];
const SOURCES = ["walk_in", "walk_in", "phone", "phone", "booking_com", "makemytrip", "goibibo", "agoda", "travel_agent", "corporate"];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function loadSampleData(staffName: string) {
  if (scalar<number>("SELECT COUNT(*) FROM bookings") > 0) fail("Sample data can only be added to an empty hotel (no bookings yet)");
  const rand = rng(20261120);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const today = todayKey();
  tx(() => {
    if (listRooms().length === 0) {
      for (const n of [101, 102, 103, 104]) addRoom({ roomNumber: String(n), type: "standard", pricePerNight: 1800, capacity: 2, floor: "1" });
      for (const n of [201, 202, 203, 204]) addRoom({ roomNumber: String(n), type: "deluxe", pricePerNight: 2800, capacity: 3, floor: "2" });
      for (const n of [301, 302]) addRoom({ roomNumber: String(n), type: "suite", pricePerNight: 4500, capacity: 4, floor: "3" });
    }
    const rooms = listRooms();
    const at = now();
    const guestIds: string[] = [];
    const guestNames: string[] = [];
    for (let i = 0; i < 40; i++) {
      const [city, state] = pick(CITIES);
      const lastName = pick(LAST);
      guestNames.push(`${FIRST[i % FIRST.length]} ${lastName}`);
      const company = i % 7 === 0 ? pick(["Tata Consultancy Services", "Infosys Ltd", "Reliance Retail", "Larsen & Toubro", "Asian Paints"]) : null;
      guestIds.push(
        insert("guests", {
          firstName: FIRST[i % FIRST.length],
          lastName,
          phone: `9${Math.floor(100000000 + rand() * 899999999)}`,
          email: null,
          nationality: i === 13 ? "British" : "Indian",
          city,
          state,
          address: `${Math.floor(rand() * 200) + 1}, ${pick(["MG Road", "Station Road", "Park Street", "Lake View", "Gandhi Nagar", "Civil Lines"])}`,
          company,
          gstin: company ? `27AAACT${Math.floor(1000 + rand() * 8999)}K1Z${Math.floor(rand() * 9)}` : null,
          idType: i === 13 ? "passport" : pick(["aadhaar", "aadhaar", "driving_licence", "voter_id"]),
          vip: i % 11 === 0 ? 1 : 0,
          blacklisted: 0,
          createdAt: at,
          updatedAt: at,
        })
      );
    }

    // Fill each room with back-to-back stays from 40 days ago to 20 days ahead, with some gaps.
    let g = 0;
    const pendingBills: Array<{ id: string; checkOut: string; folio: ReturnType<typeof folioOf> }> = [];
    for (const room of rooms) {
      let day = addDays(today, -40 + Math.floor(rand() * 3));
      while (day < addDays(today, 20)) {
        if (rand() < 0.3) {
          day = addDays(day, 1 + Math.floor(rand() * 2));
          continue;
        }
        const nights = 1 + Math.floor(rand() * (rand() < 0.2 ? 5 : 3));
        const checkIn = day;
        const checkOut = addDays(day, nights);
        day = checkOut;
        const guestName = guestNames[g % guestIds.length];
        const guestId = guestIds[g++ % guestIds.length];
        const source = pick(SOURCES);
        let status: string;
        if (checkOut < today) status = rand() < 0.06 ? "cancelled" : "checked_out";
        else if (checkIn < today || (checkIn === today && rand() < 0.4)) status = "checked_in";
        else status = "reserved";
        if (checkOut === today && rand() < 0.25) status = "checked_out"; // some of today's departures have left
        const rate = round2(room.pricePerNight * (source === "corporate" ? 0.85 : rand() < 0.2 ? 0.9 : 1));
        const number = nextSeq("booking_seq", 1000);
        const created = `${addDays(checkIn, -Math.floor(rand() * 10))}T${String(9 + Math.floor(rand() * 10)).padStart(2, "0")}:15:00.000+05:30`;
        const id = insert("bookings", {
          number,
          guestId,
          roomId: room.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          actualCheckIn: status === "checked_in" || status === "checked_out" ? `${checkIn}T13:${String(Math.floor(rand() * 59)).padStart(2, "0")}:00.000+05:30` : null,
          actualCheckOut: status === "checked_out" ? `${checkOut}T10:${String(Math.floor(rand() * 59)).padStart(2, "0")}:00.000+05:30` : null,
          status,
          source,
          otaReference: ["booking_com", "makemytrip", "goibibo", "agoda"].includes(source) ? String(Math.floor(1e9 + rand() * 9e9)) : null,
          ratePerNight: rate,
          fixedRate: 0,
          gstRate: null,
          pricesIncludeTax: 0,
          discount: rand() < 0.15 ? 200 : 0,
          adults: Math.min(room.capacity, 1 + Math.floor(rand() * 2)),
          children: rand() < 0.2 ? 1 : 0,
          notes: null,
          cancelReason: status === "cancelled" ? "Plans changed" : null,
          comingFrom: pick(CITIES)[0],
          goingTo: null,
          purpose: pick(["Tourism", "Business", "Family visit", "Wedding"]),
          vehicleNumber: null,
          companions: "[]",
          createdBy: staffName,
          createdAt: created,
          updatedAt: created,
        });
        if (status === "cancelled") continue;
        if (status !== "reserved") {
          insert("id_checks", { bookingId: id, person: guestName, idType: "aadhaar", idLast4: null, checkedBy: staffName, createdAt: `${checkIn}T13:00:00.000+05:30` });
          if (rand() < 0.45) insert("charges", { bookingId: id, category: "food", description: pick(["Breakfast", "Dinner", "Room service", "Lunch thali"]), quantity: 1 + Math.floor(rand() * 3), unitPrice: pick([150, 250, 350]), amount: 0, date: checkIn, addedBy: staffName });
          if (rand() < 0.15) insert("charges", { bookingId: id, category: "laundry", description: "Laundry", quantity: 1, unitPrice: 200, amount: 200, date: checkIn, addedBy: staffName });
        }
        run("UPDATE charges SET amount = round(quantity * unitPrice, 2) WHERE bookingId = ?", id);
        const charges = [{ amount: scalar<number>("SELECT COALESCE(SUM(amount),0) FROM charges WHERE bookingId = ?", id) }];
        const folio = folioOf({ checkInDate: checkIn, checkOutDate: checkOut, ratePerNight: rate, fixedRate: false, discount: scalar<number>("SELECT discount FROM bookings WHERE id = ?", id), gstRate: null, pricesIncludeTax: false }, room.type, charges, []);
        const method = ["booking_com", "makemytrip", "goibibo", "agoda"].includes(source) ? "ota_prepaid" : pick(["cash", "upi", "upi", "card"]);
        const advance = status === "reserved" ? (rand() < 0.5 ? round2(folio.grandTotal * 0.3) : 0) : round2(folio.grandTotal * (method === "ota_prepaid" ? 1 : 0.4));
        if (advance > 0) insert("payments", { bookingId: id, amount: advance, method, type: "advance", reference: null, notes: null, receivedBy: staffName, shiftId: null, paidAt: created });
        if (status === "checked_out") {
          const rest = round2(folio.grandTotal - advance);
          // A couple of company guests still owe money (paid by the company later).
          if (rest > 0 && rand() < 0.93) insert("payments", { bookingId: id, amount: rest, method: pick(["cash", "upi", "card"]), type: "payment", reference: null, notes: null, receivedBy: staffName, shiftId: null, paidAt: `${checkOut}T10:00:00.000+05:30` });
          pendingBills.push({ id, checkOut, folio });
        }
      }
    }
    // Invoice numbers follow the dates, as they would in real use.
    pendingBills.sort((a, b) => a.checkOut.localeCompare(b.checkOut));
    for (const { id, checkOut, folio } of pendingBills) {
          insert("bills", {
            bookingId: id,
            invoiceNumber: nextInvoiceNumber(checkOut),
            invoiceDate: checkOut,
            nights: folio.nightCount,
            roomCharges: folio.roomTotal,
            discount: folio.discount,
            roomTaxable: folio.roomAfterDiscount,
            roomTaxRate: folio.roomTaxRate,
            roomTax: folio.roomTax,
            extras: folio.extrasTotal,
            extrasTaxRate: folio.extrasTaxRate,
            extrasTax: folio.extrasTax,
            totalAmount: folio.grandTotal,
            generatedAt: `${checkOut}T10:05:00.000+05:30`,
          });
    }
    // Rooms whose guests left today need cleaning.
    run("UPDATE rooms SET housekeeping = 'dirty', hkUpdatedAt = ? WHERE id IN (SELECT roomId FROM bookings WHERE status = 'checked_out' AND checkOutDate = ?)", now(), today);
    run("UPDATE rooms SET housekeeping = 'dirty' WHERE id IN (SELECT id FROM rooms ORDER BY roomNumber LIMIT 1 OFFSET 5)");
  });
}

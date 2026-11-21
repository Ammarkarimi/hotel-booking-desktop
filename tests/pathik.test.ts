import { test } from "node:test";
import assert from "node:assert/strict";
import { mobileFor, pathikRecord, splitName, countryOf } from "../shared/pathik";
import type { FullBooking } from "../shared/types";

test("names, numbers and countries as Pathik wants them", () => {
  assert.deepEqual(splitName("Ravi Kumar Shah"), { firstName: "Ravi", middleName: "Kumar", lastName: "Shah" });
  assert.deepEqual(splitName("Ravi Kumar", "Shah"), { firstName: "Ravi", middleName: "Kumar", lastName: "Shah" });
  assert.equal(mobileFor("+91 98450 11223", true), "9845011223");
  assert.equal(mobileFor("098450 11223", true), "9845011223");
  assert.equal(countryOf("Indian"), "India");
  assert.equal(countryOf("British"), "United Kingdom");
});

test("a booking becomes Pathik's form, with the other adults and what is missing", () => {
  const b = {
    id: "b1",
    number: 1042,
    guestName: "Ravi Shah",
    adults: 3,
    children: 1,
    checkInDate: "2026-11-20",
    checkOutDate: "2026-11-22",
    actualCheckIn: null,
    actualCheckOut: null,
    comingFrom: "Mumbai",
    goingTo: "",
    vehicleType: "four_wheeler",
    vehicleNumber: "GJ01AB1234",
    pathikAt: null,
    pathikBy: null,
    companions: [{ name: "Meera Shah" }],
    room: { roomNumber: "204" },
    idChecks: [
      { person: "Ravi Shah", idType: "aadhaar" },
      { person: "meera shah", idType: "passport" },
    ],
    guest: { firstName: "Ravi", lastName: "Shah", phone: "+91 98765 43210", email: null, nationality: "Indian", address: "12 Lake Road", locality: null, city: "Surat", district: "Surat", state: "Gujarat", pinCode: "395 001", company: null, dateOfBirth: "1988-05-14", idType: null },
  } as unknown as FullBooking;
  const r = pathikRecord(b, { checkInTime: "12:00", checkOutTime: "11:00" });
  assert.equal(r.guest.mobile, "9876543210");
  assert.equal(r.guest.zipCode, "395001");
  assert.equal(r.guest.locality, "Surat");
  assert.equal(r.guest.docType, "aadhaar");
  assert.equal(r.stay.checkInTime, "12:00");
  assert.equal(r.others.length, 1);
  assert.equal(r.others[0].docType, "passport");
  assert.ok(r.missing.includes("Email"));
  assert.ok(r.missing.includes("Going to"));
  assert.ok(r.missing.includes("Names of the other adult"));
  assert.equal(r.title, "Booking #1042 · Room 204 · Ravi Shah");
});

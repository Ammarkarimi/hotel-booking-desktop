import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFolio, priceNights, roomTaxRate, DEFAULT_GST_SLABS } from "../shared/pricing";
import { addDays, eachNight, financialYear, nightsBetween } from "../shared/dates";
import { amountInWords } from "../shared/words";
import { fillMessage } from "../shared/messages";
import { whatsappNumber, isValidGstin } from "../shared/format";

const gst = { taxMode: "india_gst", taxRate: 12, gstSlabs: DEFAULT_GST_SLABS, extrasTaxRate: 5 };

test("nights and dates", () => {
  assert.equal(nightsBetween("2026-11-20", "2026-11-22"), 2);
  assert.equal(nightsBetween("2026-11-20", "2026-11-20"), 1);
  assert.deepEqual(eachNight("2026-12-31", "2027-01-02"), ["2026-12-31", "2027-01-01"]);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(financialYear("2026-03-31"), "2025-26");
  assert.equal(financialYear("2026-04-01"), "2026-27");
});

test("GST slabs by nightly price", () => {
  assert.equal(roomTaxRate(900, gst), 0);
  assert.equal(roomTaxRate(1000, gst), 0);
  assert.equal(roomTaxRate(1800, gst), 5);
  assert.equal(roomTaxRate(7500, gst), 5);
  assert.equal(roomTaxRate(9000, gst), 18);
});

test("bill with discount, extras and payments", () => {
  const nights = priceNights({ baseRate: 2000, checkIn: "2026-11-16", checkOut: "2026-11-18", roomType: "deluxe", rules: { weekendSurcharge: 0, seasonalRates: [] } });
  const f = computeFolio({ nights, discount: 400, charges: [{ amount: 300 }], payments: [{ amount: 1000, type: "advance" }, { amount: 100, type: "refund" }], tax: gst });
  assert.equal(f.roomTotal, 4000);
  assert.equal(f.roomAfterDiscount, 3600);
  assert.equal(f.roomTaxRate, 5);
  assert.equal(f.roomTax, 180);
  assert.equal(f.extrasTax, 15);
  assert.equal(f.grandTotal, 4095);
  assert.equal(f.netPaid, 900);
  assert.equal(f.balance, 3195);
});

test("prices that include GST are split back out", () => {
  const nights = priceNights({ baseRate: 2100, checkIn: "2026-11-16", checkOut: "2026-11-17", roomType: "deluxe", rules: { weekendSurcharge: 0, seasonalRates: [] } });
  const f = computeFolio({ nights, discount: 0, charges: [], payments: [], tax: gst, pricesIncludeTax: true });
  assert.equal(f.grandTotal, 2100);
  assert.equal(f.roomAfterDiscount, 2000);
  assert.equal(f.roomTax, 100);
});

test("weekend and festival prices", () => {
  const nights = priceNights({ baseRate: 1000, checkIn: "2026-11-13", checkOut: "2026-11-16", roomType: "deluxe", rules: { weekendSurcharge: 20, seasonalRates: [{ startDate: "2026-11-15", endDate: "2026-11-15", roomType: null, percent: 50 }] } });
  assert.deepEqual(nights.map((n) => n.rate), [1200, 1200, 1500]); // Fri, Sat (+20%), Sun (+50%)
});

test("amount in words, Indian style", () => {
  assert.equal(amountInWords(125050.5), "Rupees One Lakh Twenty Five Thousand Fifty and Fifty Paise Only");
});

test("message lines with empty fields are dropped", () => {
  assert.equal(fillMessage("Hi {guest}\nInvoice: {invoice_no}\nBye", { guest: "Ravi", invoice_no: "" }), "Hi Ravi\nBye");
});

test("WhatsApp numbers and GSTIN", () => {
  assert.equal(whatsappNumber("98765 43210"), "919876543210");
  assert.equal(whatsappNumber("+91 98765-43210"), "919876543210");
  assert.equal(whatsappNumber("09876543210"), "919876543210");
  assert.ok(isValidGstin("24ABCDE1234F1Z5"));
  assert.ok(!isValidGstin("24ABCDE1234F1Y5"));
});

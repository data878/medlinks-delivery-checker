import assert from "node:assert/strict";
import test from "node:test";

import { testable } from "../api/check-delivery.js";

test("normalizes courier tokens without duplicating Token prefix", () => {
  assert.equal(testable.normalizeToken("Token abc123"), "abc123");
  assert.equal(testable.tokenHeader("abc123"), "Token abc123");
  assert.equal(testable.tokenHeader("Token abc123"), "Token abc123");
});

test("extracts TAT from supported response shapes", () => {
  assert.equal(testable.extractTatDays({ data: { tat: 3 } }), 3);
  assert.equal(testable.extractTatDays({ expected_tat: "5" }), 5);
  assert.equal(testable.extractTatDays({ data: {} }), null);
});

test("adds an operating day after the noon IST cutoff", () => {
  process.env.CUTOFF_HOUR_IST = "12";
  process.env.HOLIDAY_DATES = "";
  const beforeCutoff = new Date("2026-09-16T05:30:00.000Z"); // 11:00 IST
  const afterCutoff = new Date("2026-09-16T07:30:00.000Z"); // 13:00 IST

  assert.equal(
    testable.calculateDeliveryDate(2, beforeCutoff).toISOString().slice(0, 10),
    "2026-09-18"
  );
  assert.equal(
    testable.calculateDeliveryDate(2, afterCutoff).toISOString().slice(0, 10),
    "2026-09-19"
  );
});

test("skips Sundays and configured holidays", () => {
  process.env.CUTOFF_HOUR_IST = "12";
  process.env.HOLIDAY_DATES = "2026-10-02";
  const thursdayMorning = new Date("2026-10-01T04:00:00.000Z");

  assert.equal(
    testable
      .calculateDeliveryDate(2, thursdayMorning)
      .toISOString()
      .slice(0, 10),
    "2026-10-05"
  );
});

test("extracts a customer-friendly location from Delhivery postal data", () => {
  assert.deepEqual(
    testable.extractLocation({
      city: "New Delhi",
      district: "Central Delhi",
      state_code: "DL",
    }),
    { city: "New Delhi", district: "Central Delhi", state: "DL" }
  );

  assert.deepEqual(
    testable.extractLocation({ district: "Gurugram", state: "Haryana" }),
    { city: "Gurugram", district: "Gurugram", state: "Haryana" }
  );

  assert.deepEqual(testable.extractLocation(null), {
    city: null,
    district: null,
    state: null,
  });
});

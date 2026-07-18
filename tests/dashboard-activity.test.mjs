import assert from "node:assert/strict";
import test from "node:test";

import {
  getDashboardPeriodDates,
  getStageDateFields,
  summarizeDashboardRows,
} from "../lib/dashboard/activity.js";

test("today uses Asia/Kolkata business date instead of UTC date", () => {
  const dates = getDashboardPeriodDates("today", undefined, undefined, new Date("2026-07-17T20:30:00.000Z"));

  assert.deepEqual(dates, { from: "2026-07-18", to: "2026-07-18" });
});

test("week returns the current Monday to Sunday range in Asia/Kolkata", () => {
  const dates = getDashboardPeriodDates("week", undefined, undefined, new Date("2026-07-18T06:00:00.000Z"));

  assert.deepEqual(dates, { from: "2026-07-13", to: "2026-07-19" });
});

test("stage totals use stage dates and split new CVs from existing work", () => {
  const rows = [
    {
      id: "old-shortlisted-today",
      application_date: "2026-07-10",
      shortlist_by_hr_date: "2026-07-18",
      shortlisted_hr: 1,
      tel_int_date: "2026-07-11",
      tel_int_done: 1,
    },
    {
      id: "new-tel-today",
      application_date: "2026-07-18",
      tel_int_date: "2026-07-18",
      tel_int_done: 1,
    },
    {
      id: "old-no-work-today",
      application_date: "2026-07-01",
      shortlisted_by_mgmt_date: "2026-07-02",
      shortlisted_mgmt: 1,
    },
  ];

  const stats = summarizeDashboardRows(rows, { from: "2026-07-18", to: "2026-07-18" });

  assert.equal(stats.total, 2);
  assert.equal(stats.new_cvs, 1);
  assert.equal(stats.worked_on_existing, 1);
  assert.equal(stats.tel_int_done, 1);
  assert.equal(stats.shortlisted_hr, 1);
  assert.equal(stats.shortlisted_mgmt, 0);
  assert.deepEqual(stats.stage_splits.shortlisted_hr, { new: 0, worked: 1 });
  assert.deepEqual(stats.stage_splits.tel_int_done, { new: 1, worked: 0 });
});

test("PI done counts a candidate once when any PI round date is in range", () => {
  const stats = summarizeDashboardRows([
    {
      id: "pi-candidate",
      application_date: "2026-07-01",
      pi1_date: "2026-07-18",
      pi2_date: "2026-07-18",
      pi_done: 1,
    },
  ], { from: "2026-07-18", to: "2026-07-18" });

  assert.equal(stats.pi_done, 1);
  assert.deepEqual(getStageDateFields("pi_done"), ["pi1_date", "pi2_date", "pi3_date"]);
});

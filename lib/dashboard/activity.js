const BUSINESS_TIME_ZONE = "Asia/Kolkata";

const STAGE_DATE_FIELDS = {
  tel_int_done: ["tel_int_date"],
  gf_sent: ["google_form_sent_date"],
  gf_received: ["google_form_received_date"],
  shortlisted_hr: ["shortlist_by_hr_date"],
  pi_done: ["pi1_date", "pi2_date", "pi3_date"],
  shortlisted_mgmt: ["shortlisted_by_mgmt_date"],
  gf_issued: ["gf_issue_date"],
  gf_recv: ["gf_received_date"],
  appointed: ["offered_date"],
  joined: ["doj_actual", "doj"],
  offered_not_joined: ["offered_not_joined_date"],
};

const STAGE_KEYS = Object.keys(STAGE_DATE_FIELDS);

function businessDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
  };
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function startOfBusinessMonth(isoDate) {
  return `${isoDate.slice(0, 8)}01`;
}

function endOfBusinessMonth(isoDate) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getDashboardPeriodDates(period, dateFrom, dateTo, now = new Date()) {
  const today = businessDateParts(now).date;

  switch (period) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const weekdayIndex = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[businessDateParts(now).weekday] ?? 0;
      const from = addDays(today, -weekdayIndex);
      return { from, to: addDays(from, 6) };
    }
    case "month":
      return { from: startOfBusinessMonth(today), to: endOfBusinessMonth(today) };
    case "lastmonth": {
      const [year, month] = today.split("-").map(Number);
      const lastMonthDate = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
      return { from: startOfBusinessMonth(lastMonthDate), to: endOfBusinessMonth(lastMonthDate) };
    }
    case "last30":
      return { from: addDays(today, -30), to: today };
    case "custom":
      return { from: dateFrom || undefined, to: dateTo || undefined };
    case "all":
    default:
      return { from: undefined, to: undefined };
  }
}

function asDateOnly(value) {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
}

function inRange(value, range) {
  const date = asDateOnly(value);
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function hasRange(range) {
  return Boolean(range.from || range.to);
}

function getStageDateFields(stageKey) {
  return STAGE_DATE_FIELDS[stageKey] ? [...STAGE_DATE_FIELDS[stageKey]] : [];
}

function rowStageInRange(row, stageKey, range) {
  return getStageDateFields(stageKey).some((field) => inRange(row[field], range));
}

function rowStageEverActive(row, stageKey) {
  if (getStageDateFields(stageKey).some((field) => Boolean(asDateOnly(row[field])))) return true;
  return Number(row[stageKey] ?? 0) > 0;
}

function rowHasAnyStageInRange(row, range) {
  return STAGE_KEYS.some((stageKey) => rowStageInRange(row, stageKey, range));
}

function summarizeDashboardRows(rows, range = {}) {
  const ranged = hasRange(range);
  const activeRows = ranged
    ? rows.filter((row) => inRange(row.application_date, range) || rowHasAnyStageInRange(row, range))
    : rows;

  const stats = {
    total: activeRows.length,
    new_cvs: ranged ? activeRows.filter((row) => inRange(row.application_date, range)).length : activeRows.length,
    worked_on_existing: ranged
      ? activeRows.filter((row) => !inRange(row.application_date, range) && rowHasAnyStageInRange(row, range)).length
      : 0,
    stage_splits: {},
  };

  for (const stageKey of STAGE_KEYS) {
    let count = 0;
    const split = { new: 0, worked: 0 };

    for (const row of rows) {
      const active = ranged ? rowStageInRange(row, stageKey, range) : rowStageEverActive(row, stageKey);
      if (!active) continue;
      count += 1;
      if (ranged) {
        if (inRange(row.application_date, range)) split.new += 1;
        else split.worked += 1;
      }
    }

    stats[stageKey] = count;
    stats.stage_splits[stageKey] = split;
  }

  return stats;
}

module.exports = {
  BUSINESS_TIME_ZONE,
  STAGE_DATE_FIELDS,
  getDashboardPeriodDates,
  getStageDateFields,
  inRange,
  rowHasAnyStageInRange,
  rowStageInRange,
  summarizeDashboardRows,
};

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(value);
    return isValid(d) ? format(d, "dd/MM/yyyy") : "";
  } catch {
    return "";
  }
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function pct(num: number, denom: number): string {
  if (!denom) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Map Excel serial date (number) to ISO string */
export function excelDateToISO(serial: number): string | null {
  if (!serial || isNaN(serial)) return null;
  const utcDays = serial - 25569;
  const utcValue = utcDays * 86400 * 1000;
  const d = new Date(utcValue);
  return isValid(d) ? d.toISOString().split("T")[0] : null;
}

export function safeString(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

/** Strip all non-digits, then remove leading country code (91 → 10-digit, 0 → 10-digit).
 *  Returns empty string if the result is shorter than 7 digits (not a real mobile). */
export function normalizeMobile(val: unknown): string {
  const digits = String(val ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0"))  return digits.slice(1);
  return digits.length >= 7 ? digits : "";
}

export function safeNumber(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

const MONTH_NAMES = ["january","february","march","april","may","june","july","august","september","october","november","december"];

/** Normalise any month representation to YYYY-MM.
 *  Handles: Excel serial ints, "Month YYYY", "Month-YY", "Month YY", YYYY-MM.
 *  Returns null for garbage values. */
export function parseMonthToYYYYMM(val: unknown): string | null {
  if (val == null || val === "") return null;
  // Numeric Excel serial (covers ~2009-2064)
  if (typeof val === "number") {
    if (val > 40000 && val < 70000) {
      const d = new Date((val - 25569) * 86400 * 1000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }
    return null;
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const num = Number(s);
  if (!isNaN(num) && Number.isInteger(num) && num > 40000 && num < 70000) {
    const d = new Date((num - 25569) * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  // "MonthName YYYY" or "MonthName-YY" or "MonthName YY"
  const m = s.match(/^([a-zA-Z]+)[\s\-](\d{2,4})$/);
  if (m) {
    const mIdx = MONTH_NAMES.indexOf(m[1].toLowerCase());
    if (mIdx !== -1) {
      let y = parseInt(m[2], 10);
      if (y < 100) y += 2000;
      return `${y}-${String(mIdx + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

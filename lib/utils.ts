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

export function safeNumber(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

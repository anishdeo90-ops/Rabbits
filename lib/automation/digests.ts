import type { Profile } from "@/lib/types";

export function buildDailyDigest(recruiter: Partial<Profile>) {
  return `Hi ${recruiter.name ?? "there"},\n\nHere is your daily follow-up digest. Please review pending candidates in HireRabbits.\n\n- HireRabbits Automation`;
}

export function buildWeeklySummary(hrManager: Partial<Profile>) {
  return `Hi ${hrManager.name ?? "there"},\n\nHere is your weekly recruitment summary. Please review pipeline health in HireRabbits.\n\n- HireRabbits Automation`;
}

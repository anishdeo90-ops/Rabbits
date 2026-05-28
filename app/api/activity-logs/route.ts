import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const candidateId = new URL(req.url).searchParams.get("candidate_id");
  if (!candidateId) return NextResponse.json({ error: "candidate_id required" }, { status: 400 });

  const { data: logs, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("record_id", candidateId)
    .eq("table_name", "candidates")
    .order("changed_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Batch fetch profile names
  const changerIds = Array.from(new Set((logs ?? []).map((l: { changed_by: string }) => l.changed_by).filter(Boolean)));
  const profileMap: Record<string, string> = {};
  if (changerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id,name").in("id", changerIds);
    (profiles ?? []).forEach((p: { id: string; name: string }) => { profileMap[p.id] = p.name; });
  }

  const SKIP = new Set(['updated_at','updated_by','custom_data','portal_token','created_at','created_by','is_deleted','deleted_at','deleted_by']);

  type LogRow = { id: string; action: string; changed_at: string; changed_by: string; old_data: Record<string,unknown>|null; new_data: Record<string,unknown>|null };

  const entries = (logs ?? [] as LogRow[]).map((log: LogRow) => {
    let changes: { field: string; from: string | null; to: string | null }[] = [];
    if (log.action === 'INSERT') {
      changes = [{ field: 'record', from: null, to: 'created' }];
    } else if (log.action === 'DELETE') {
      changes = [{ field: 'record', from: 'active', to: 'deleted' }];
    } else {
      const oldD = (log.old_data ?? {}) as Record<string, unknown>;
      const newD = (log.new_data ?? {}) as Record<string, unknown>;
      const allKeys = new Set([...Object.keys(oldD), ...Object.keys(newD)]);
      allKeys.forEach(k => {
        if (SKIP.has(k)) return;
        const ov = oldD[k] ?? null;
        const nv = newD[k] ?? null;
        if (String(ov) !== String(nv)) {
          changes.push({ field: k, from: ov === null ? null : String(ov), to: nv === null ? null : String(nv) });
        }
      });
    }
    return { id: log.id, action: log.action, changed_at: log.changed_at, changed_by_name: profileMap[log.changed_by] ?? 'System', changes };
  }).filter(e => e.changes.length > 0);

  return NextResponse.json({ data: entries });
}

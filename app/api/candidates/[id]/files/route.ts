import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const BUCKET = "candidate-files";
const CATEGORIES = new Set(["cv", "certificate", "onboarding", "form_response", "other"]);

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

function cvLink(candidateId: string) {
  return `/api/candidates/${candidateId}/cv`;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("candidate_files")
    .select("*, profiles(name)")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = await createAdminClient();
  const withUrls = await Promise.all((data ?? []).map(async (f) => {
    let signed_url: string | null = null;

    if (f.storage_path?.startsWith("http")) {
      signed_url = f.storage_path;
    } else if (f.storage_path) {
      const { data: urlData } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(f.storage_path, 3600);
      signed_url = urlData?.signedUrl ?? null;
    }

    return { ...f, signed_url };
  }));

  return NextResponse.json({ data: withUrls });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const requestedCategory = (formData.get("category") as string) || "other";
  const category = CATEGORIES.has(requestedCategory) ? requestedCategory : "other";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || "candidate-file");
  const storagePath = `${id}/${category}/${Date.now()}-${safeName}`;

  try {
    const admin = await createAdminClient();
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(bytes), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data, error } = await admin
      .from("candidate_files")
      .insert({
        candidate_id: id,
        file_name: file.name || safeName,
        storage_path: storagePath,
        file_category: category,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600);

    if (category === "cv") {
      await admin
        .from("candidates")
        .update({ cv_drive_url: cvLink(id), cv_filename: file.name || safeName, updated_by: user.id })
        .eq("id", id);
    }

    return NextResponse.json({ data: { ...data, signed_url: urlData?.signedUrl ?? null } });
  } catch (err) {
    console.error("Supabase file upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: `Supabase upload error: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("file_id");
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const admin = await createAdminClient();
  const { data: fileRow } = await admin
    .from("candidate_files")
    .select("candidate_id, storage_path, file_category")
    .eq("id", fileId)
    .single();

  if (fileRow?.storage_path && !fileRow.storage_path.startsWith("http")) {
    await admin.storage.from(BUCKET).remove([fileRow.storage_path]);
  }

  const { error } = await admin.from("candidate_files").delete().eq("id", fileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (fileRow?.file_category === "cv" && fileRow.candidate_id) {
    const { data: latestCv } = await admin
      .from("candidate_files")
      .select("file_name")
      .eq("candidate_id", fileRow.candidate_id)
      .eq("file_category", "cv")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await admin
      .from("candidates")
      .update({
        cv_drive_url: latestCv ? cvLink(fileRow.candidate_id) : null,
        cv_filename: latestCv?.file_name ?? null,
        updated_by: user.id,
      })
      .eq("id", fileRow.candidate_id);
  }

  return NextResponse.json({ ok: true });
}

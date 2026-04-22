import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const BUCKET = "candidate-files";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

function cvLink(candidateId: string) {
  return `/api/candidates/${candidateId}/cv`;
}

// GET /api/candidates/[id]/cv - open the latest CV through a fresh Supabase signed URL.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: fileRow, error } = await admin
    .from("candidate_files")
    .select("storage_path")
    .eq("candidate_id", id)
    .eq("file_category", "cv")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!fileRow?.storage_path) return NextResponse.json({ error: "CV not found" }, { status: 404 });

  if (fileRow.storage_path.startsWith("http")) {
    return NextResponse.redirect(fileRow.storage_path);
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(fileRow.storage_path, 3600);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: signedError?.message ?? "Unable to open CV" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}

// POST /api/candidates/[id]/cv - upload file to Supabase Storage.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Only PDF, Word, or text files are supported" }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 15 MB" }, { status: 400 });
  }

  const { data: cand } = await supabase
    .from("candidates")
    .select("name")
    .eq("id", id)
    .single();

  const candidateName = (cand?.name ?? id).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const ext = file.name.split(".").pop() ?? "pdf";
  const fileName = sanitizeFileName(`${candidateName || "candidate"}_CV.${ext}`);
  const safeOriginalName = sanitizeFileName(file.name || fileName);
  const storagePath = `${id}/cv/${Date.now()}-${safeOriginalName}`;

  try {
    const bytes = await file.arrayBuffer();
    const admin = await createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, Buffer.from(bytes), {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: fileRow, error: fileError } = await admin
      .from("candidate_files")
      .insert({
        candidate_id: id,
        file_name: file.name || fileName,
        storage_path: storagePath,
        file_category: "cv",
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        created_by: user.id,
      })
      .select()
      .single();

    if (fileError) {
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json({ error: fileError.message }, { status: 500 });
    }

    const url = cvLink(id);
    const { error: candidateError } = await admin
      .from("candidates")
      .update({ cv_drive_url: url, cv_filename: file.name || fileName, updated_by: user.id })
      .eq("id", id);

    if (candidateError) return NextResponse.json({ error: candidateError.message }, { status: 500 });

    return NextResponse.json({
      data: { ...fileRow, cv_drive_url: url, file_name: file.name || fileName, storage_path: storagePath },
    });
  } catch (err) {
    console.error("Supabase CV upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: `Supabase upload error: ${msg}` }, { status: 500 });
  }
}

// PATCH /api/candidates/[id]/cv - save a manually pasted URL.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cv_drive_url } = await req.json();
  await supabase
    .from("candidates")
    .update({ cv_drive_url: cv_drive_url ?? null, updated_by: user.id })
    .eq("id", id);

  return NextResponse.json({ data: { cv_drive_url } });
}

// DELETE /api/candidates/[id]/cv - clear CV link.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase
    .from("candidates")
    .update({ cv_drive_url: null, cv_filename: null, updated_by: user.id })
    .eq("id", id);

  return NextResponse.json({ success: true });
}

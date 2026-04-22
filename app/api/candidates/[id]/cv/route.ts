import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { Readable } from "stream";

async function getDriveClient() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("google_drive_settings")
    .select("service_account_json, folder_id")
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return null;

  const credentials = JSON.parse(data.service_account_json);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });
  return { drive, folderId: data.folder_id };
}

// POST /api/candidates/[id]/cv — upload file to Google Drive
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const driveCtx = await getDriveClient();
  if (!driveCtx)
    return NextResponse.json({
      error: "Google Drive not configured. Go to Settings → Integrations to connect.",
    }, { status: 503 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type))
    return NextResponse.json({ error: "Only PDF, Word, or text files are supported" }, { status: 400 });
  if (file.size > 15 * 1024 * 1024)
    return NextResponse.json({ error: "File must be under 15 MB" }, { status: 400 });

  // Fetch candidate name for the file name
  const { data: cand } = await supabase
    .from("candidates").select("name").eq("id", id).single();
  const candidateName = (cand?.name ?? id).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const ext = file.name.split(".").pop() ?? "pdf";
  const fileName = `${candidateName}_CV.${ext}`;

  try {
    const { drive, folderId } = driveCtx;
    const bytes = await file.arrayBuffer();
    const stream = Readable.from(Buffer.from(bytes));

    // Upload to Google Drive (supportsAllDrives required for Shared Drives)
    const uploaded = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: "id, name, webViewLink, webContentLink",
    });

    const fileId = uploaded.data.id!;

    // Make it accessible to anyone with the link
    await drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // Get the public view link
    const meta = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "webViewLink",
    });

    const url = meta.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

    // Save URL to candidate record
    await supabase.from("candidates").update({ cv_drive_url: url }).eq("id", id);

    return NextResponse.json({ data: { cv_drive_url: url, file_name: fileName, file_id: fileId } });
  } catch (err) {
    console.error("Google Drive upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: `Google Drive error: ${msg}` }, { status: 500 });
  }
}

// PATCH /api/candidates/[id]/cv — save a manually pasted URL
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cv_drive_url } = await req.json();
  await supabase.from("candidates").update({ cv_drive_url: cv_drive_url ?? null }).eq("id", id);
  return NextResponse.json({ data: { cv_drive_url } });
}

// DELETE /api/candidates/[id]/cv — clear CV link
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("candidates").update({ cv_drive_url: null }).eq("id", id);
  return NextResponse.json({ success: true });
}

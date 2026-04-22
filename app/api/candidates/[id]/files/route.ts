import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { google } from "googleapis";
import { Readable } from "stream";

type Params = { params: Promise<{ id: string }> };

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

function isDriveId(storagePath: string): boolean {
  // Drive file IDs are alphanumeric, typically 28–44 chars, no slashes
  return !!storagePath && !storagePath.includes("/") && !storagePath.startsWith("http");
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

    if (isDriveId(f.storage_path)) {
      // New: Google Drive file
      signed_url = `https://drive.google.com/file/d/${f.storage_path}/view`;
    } else if (f.storage_path?.startsWith("http")) {
      // Direct URL stored (e.g., legacy or manually saved)
      signed_url = f.storage_path;
    } else if (f.storage_path) {
      // Legacy: Supabase Storage path
      const { data: urlData } = await admin.storage
        .from("candidate-files")
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
  const category = (formData.get("category") as string) || "other";

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });

  // Require Google Drive to be configured
  const driveCtx = await getDriveClient();
  if (!driveCtx) {
    return NextResponse.json({
      error: "Google Drive is not configured. Go to Settings → Integrations to connect.",
    }, { status: 503 });
  }

  const { drive, folderId } = driveCtx;

  // Fetch candidate name for Drive file name
  const { data: cand } = await supabase
    .from("candidates").select("name").eq("id", id).single();
  const candidateName = (cand?.name ?? id).replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const ext = file.name.split(".").pop() ?? "";
  const driveName = `${candidateName}_${category}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  try {
    const bytes = await file.arrayBuffer();
    const stream = Readable.from(Buffer.from(bytes));

    const uploaded = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: driveName,
        parents: [folderId],
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: stream,
      },
      fields: "id, name, webViewLink",
    });

    const driveFileId = uploaded.data.id!;

    // Make file accessible to anyone with the link
    await drive.permissions.create({
      fileId: driveFileId,
      supportsAllDrives: true,
      requestBody: { role: "reader", type: "anyone" },
    });

    // Store Drive file ID as storage_path (compact, lets us reconstruct the URL)
    const { data, error } = await supabase
      .from("candidate_files")
      .insert({
        candidate_id: id,
        file_name: file.name,
        storage_path: driveFileId,  // Drive file ID stored here
        file_category: category,
        file_size: file.size,
        mime_type: file.type || `application/${ext}`,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      // Try to clean up Drive file on DB error
      await drive.files.delete({ fileId: driveFileId }).catch(() => {});
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        ...data,
        signed_url: `https://drive.google.com/file/d/${driveFileId}/view`,
      }
    });
  } catch (err) {
    console.error("Google Drive upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: `Google Drive error: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, _ctx: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("file_id");
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 });

  const { data: fileRow } = await supabase
    .from("candidate_files")
    .select("storage_path")
    .eq("id", fileId)
    .single();

  if (fileRow?.storage_path) {
    if (isDriveId(fileRow.storage_path)) {
      // New: delete from Google Drive
      const driveCtx = await getDriveClient();
      if (driveCtx) {
        await driveCtx.drive.files.delete({ fileId: fileRow.storage_path, supportsAllDrives: true }).catch(() => {});
      }
    } else if (!fileRow.storage_path.startsWith("http")) {
      // Legacy: delete from Supabase Storage
      const admin = await createAdminClient();
      await admin.storage.from("candidate-files").remove([fileRow.storage_path]);
    }
  }

  const { error } = await supabase.from("candidate_files").delete().eq("id", fileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

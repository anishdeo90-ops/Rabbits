import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const effectiveProfile: Profile = (profile as Profile) ?? {
    id: user.id,
    email: user.email ?? "",
    name: user.email ?? "User",
    role: "recruiter",
    avatar_url: undefined,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={effectiveProfile} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

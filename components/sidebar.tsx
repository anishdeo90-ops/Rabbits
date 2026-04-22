"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Settings, LogOut,
  Briefcase, FileText, Activity, ChevronLeft, ChevronRight, ClipboardList,
} from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { href: "/my-activity", icon: Activity,         label: "My Activity",  roles: ["recruiter", "hr_manager", "admin"] },
  { href: "/candidates",  icon: Users,            label: "Candidates" },
  { href: "/jobs",        icon: Briefcase,        label: "Jobs" },
  { href: "/hod-portal",  icon: ClipboardList,    label: "HOD Portal",        roles: ["admin", "hr_manager", "hod"] },
  { href: "/jds",         icon: FileText,         label: "JDs & Forms",       roles: ["admin", "hr_manager"] },
];

interface SidebarProps { profile: Profile }

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const visibleNav = NAV.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(profile.role);
  });

  return (
    <aside className={cn(
      "flex flex-col bg-gray-900 text-white transition-all duration-200 min-h-screen flex-shrink-0",
      collapsed ? "w-16" : "w-56"
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-700">
        <img
          src="/hirerabbits-logo.svg"
          alt="HireRabbits"
          className="w-8 h-8 rounded-lg flex-shrink-0"
        />
        {!collapsed && (
          <div>
            <p className="font-semibold text-sm leading-tight">HireRabbits</p>
            <p className="text-brand-400 text-xs">Hiring OS</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-gray-400 hover:text-white">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {visibleNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-brand-500 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="flex-shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Settings gear + user + logout */}
      <div className="border-t border-gray-700 p-3 space-y-1">
        {/* Settings — gear icon, industry-standard placement */}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            pathname.startsWith("/settings")
              ? "bg-brand-500 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings size={18} className="flex-shrink-0" />
          {!collapsed && "Settings"}
        </Link>

        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-white truncate">{profile.name}</p>
            <p className="text-xs text-gray-400 capitalize">{profile.role.replace("_", " ")}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 w-full transition-colors"
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut size={18} className="flex-shrink-0" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}

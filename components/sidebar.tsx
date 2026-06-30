"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Settings, LogOut,
  Briefcase, FileText, Activity, ChevronLeft, ChevronRight, ClipboardList, HandshakeIcon,
  Menu, X, Bell, User, List, Mail, Workflow, Link2, Brain, Database, CreditCard,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { HireRabbitsLogo } from "@/components/hirerabbits-logo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "Dashboard" },
  { href: "/my-activity", icon: Activity,         label: "My Activity",  roles: ["recruiter", "hr_manager", "admin"] },
  { href: "/candidates",  icon: Users,            label: "Candidates" },
  { href: "/jobs",        icon: Briefcase,        label: "Jobs" },
  { href: "/offers",      icon: HandshakeIcon,    label: "Offers",            roles: ["admin", "hr_manager"] },
  { href: "/hod-portal",  icon: ClipboardList,    label: "HOD Portal",        roles: ["admin", "hr_manager", "hod"] },
  { href: "/jds",         icon: FileText,         label: "JDs & Forms",       roles: ["admin", "hr_manager"] },
];

const SETTINGS_NAV = [
  { href: "/settings#profile", label: "My Profile", icon: User, key: "profile" },
  { href: "/settings#notifications", label: "Notifications", icon: Bell, key: "notifications" },
  { href: "/settings#team", label: "Team & Users", icon: Users, key: "team", adminOnly: true },
  { href: "/settings#pipeline", label: "Pipeline Stages", icon: List, key: "pipeline", adminOnly: true },
  { href: "/settings#masters", label: "Dropdown Masters", icon: List, key: "masters", adminOnly: true },
  { href: "/settings#email_templates", label: "Email Templates", icon: Mail, key: "email_templates", adminOnly: true },
  { href: "/settings#workflows", label: "Workflows", icon: Workflow, key: "workflows" },
  { href: "/settings#integrations", label: "Integrations", icon: Link2, key: "integrations" },
  { href: "/settings#ai", label: "AI & Automation", icon: Brain, key: "ai" },
  { href: "/settings#backup", label: "Backup & Security", icon: Database, key: "backup", adminOnly: true },
  { href: "/settings#billing", label: "Billing & Plan", icon: CreditCard, key: "billing", adminOnly: true },
];

interface SidebarProps { profile: Profile }

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState("profile");
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unread_only=true");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => clearInterval(id);
  }, [fetchUnread]);

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
  const isAdmin = profile.role === "admin" || profile.role === "hr_manager";
  const visibleSettingsNav = SETTINGS_NAV.filter((item) => !item.adminOnly || isAdmin);

  useEffect(() => {
    const syncActiveSettings = () => {
      setActiveSettingsSection(window.location.hash.replace("#", "") || "profile");
    };

    syncActiveSettings();
    window.addEventListener("hashchange", syncActiveSettings);
    return () => window.removeEventListener("hashchange", syncActiveSettings);
  }, [pathname]);

  // Auto-close the mobile drawer after a nav click
  const closeMobile = () => {
    setMobileOpen(false);
    setMobileSettingsOpen(false);
  };

  return (
    <>
      {/* Mobile hamburger — fixed, visible only when drawer is closed on mobile */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={cn(
          "lg:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-white shadow-md border border-gray-200 text-gray-700",
          mobileOpen && "hidden"
        )}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Backdrop — closes drawer on tap */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-gray-900 text-white min-h-screen flex-shrink-0",
          "transition-transform duration-200",
          // Mobile: fixed drawer
          "fixed top-0 left-0 h-full z-50 w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: in-flow, regular sidebar
          "lg:static lg:translate-x-0 lg:h-auto lg:z-auto",
          collapsed ? "lg:w-16" : "lg:w-56"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-700">
          <HireRabbitsLogo className="h-8 w-8 rounded-lg flex-shrink-0" />
          {!collapsed && (
            <div>
              <p className="font-semibold text-sm leading-tight">HireRabbits</p>
              <p className="text-brand-400 text-xs">Hiring OS</p>
            </div>
          )}
          {/* Close button — mobile only */}
          <button
            type="button"
            onClick={closeMobile}
            className="lg:hidden ml-auto text-gray-400 hover:text-white p-1"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          {/* Collapse toggle — desktop only */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:block ml-auto text-gray-400 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
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

        {/* Bottom: Notifications + Settings gear + user + logout */}
        <div className="border-t border-gray-700 p-3 space-y-1">
          <Link
            href="/notifications"
            onClick={closeMobile}
            className={cn(
              "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith("/notifications")
                ? "bg-brand-500 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
            title={collapsed ? "Notifications" : undefined}
          >
            <Bell size={18} className="flex-shrink-0" />
            {!collapsed && "Notifications"}
            {unreadCount > 0 && (
              <span className={cn(
                "min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center",
                collapsed ? "absolute top-1 right-1" : "ml-auto"
              )}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <Link
            href="/settings"
            onClick={closeMobile}
            className={cn(
              "hidden lg:flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith("/settings")
                ? "bg-brand-500 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings size={18} className="flex-shrink-0" />
            {!collapsed && "Settings"}
          </Link>
          <button
            type="button"
            onClick={() => setMobileSettingsOpen((open) => !open)}
            className={cn(
              "lg:hidden flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full",
              pathname.startsWith("/settings")
                ? "bg-brand-500 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            <Settings size={18} className="flex-shrink-0" />
            <span>Settings</span>
            <ChevronRight
              size={14}
              className={cn("ml-auto transition-transform", mobileSettingsOpen && "rotate-90")}
            />
          </button>
          {mobileSettingsOpen && (
            <div className="lg:hidden ml-4 mt-1 space-y-1 border-l border-gray-700 pl-2">
              {visibleSettingsNav.map((item) => {
                const active = pathname.startsWith("/settings") && activeSettingsSection === item.key;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={closeMobile}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      active
                        ? "bg-brand-500/15 text-brand-200"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white"
                    )}
                  >
                    <item.icon size={14} className="flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

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
    </>
  );
}

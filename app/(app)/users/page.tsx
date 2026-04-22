"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, X, Check, UserCheck, UserX } from "lucide-react";
import toast from "react-hot-toast";
import type { Profile, Role } from "@/lib/types";
import { ROLES } from "@/lib/types";

const ROLE_COLORS: Record<Role, string> = {
  admin:      "bg-red-100 text-red-700",
  hr_manager: "bg-purple-100 text-purple-700",
  recruiter:  "bg-blue-100 text-blue-700",
  hod:        "bg-cyan-100 text-cyan-700",
  candidate:  "bg-gray-100 text-gray-600",
};

interface NewUserForm {
  name: string; email: string; password: string;
  role: Role; department: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Partial<Profile> | null>(null);
  const [saving, setSaving] = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({
    name: "", email: "", password: "", role: "recruiter", department: "",
  });

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const json = await res.json();
      setUsers(json.data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Name, email and password are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (res.ok) {
      toast.success("User created & invited");
      setShowAdd(false);
      setNewUser({ name: "", email: "", password: "", role: "recruiter", department: "" });
      loadUsers();
    } else {
      const err = await res.json();
      toast.error(err.error ?? "Failed to create user");
    }
    setSaving(false);
  }

  async function handleUpdate() {
    if (!editing?.id) return;
    setSaving(true);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      toast.success("User updated");
      setEditing(null);
      loadUsers();
    } else {
      toast.error("Update failed");
    }
    setSaving(false);
  }

  async function toggleActive(user: Profile) {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, name: user.name, role: user.role, is_active: !user.is_active }),
    });
    if (res.ok) { loadUsers(); }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage access and roles for all team members</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
        >
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {ROLES.map((r) => (
          <div key={r.value} className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {users.filter((u) => u.role === r.value && u.is_active).length}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{r.label}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-500 text-white">
            <tr>
              <th className="text-left px-5 py-3 font-semibold">Name</th>
              <th className="text-left px-5 py-3 font-semibold">Email</th>
              <th className="text-left px-5 py-3 font-semibold">Role</th>
              <th className="text-left px-5 py-3 font-semibold">Department</th>
              <th className="text-left px-5 py-3 font-semibold">Status</th>
              <th className="text-right px-5 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No users found</td></tr>
            ) : users.map((user, i) => (
              <tr key={user.id} className={`border-t ${i % 2 === 0 ? "" : "bg-gray-50"}`}>
                <td className="px-5 py-3 font-medium text-gray-900">
                  {editing?.id === user.id ? (
                    <input value={editing.name ?? ""}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="border border-brand-400 rounded px-2 py-1 text-sm w-full" />
                  ) : user.name}
                </td>
                <td className="px-5 py-3 text-gray-600">{user.email}</td>
                <td className="px-5 py-3">
                  {editing?.id === user.id ? (
                    <select value={editing.role ?? "recruiter"}
                      onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
                      className="border border-brand-400 rounded px-2 py-1 text-sm">
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                      {ROLES.find((r) => r.value === user.role)?.label ?? user.role}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {editing?.id === user.id ? (
                    <input value={editing.department ?? ""}
                      onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                      className="border border-brand-400 rounded px-2 py-1 text-sm w-full" />
                  ) : (user.department ?? "—")}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {editing?.id === user.id ? (
                      <>
                        <button onClick={handleUpdate} disabled={saving}
                          className="p-1 text-green-600 hover:text-green-800"><Check size={15} /></button>
                        <button onClick={() => setEditing(null)}
                          className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setEditing({ ...user })}
                          className="p-1 text-gray-400 hover:text-brand-600"><Pencil size={14} /></button>
                        <button onClick={() => toggleActive(user)}
                          className="p-1 text-gray-400 hover:text-gray-700"
                          title={user.is_active ? "Deactivate" : "Activate"}>
                          {user.is_active ? <UserX size={15} className="text-red-400" /> : <UserCheck size={15} className="text-green-500" />}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Add New User</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              {[
                { label: "Full Name", key: "name", type: "text" },
                { label: "Email Address", key: "email", type: "email" },
                { label: "Password (temporary)", key: "password", type: "password" },
                { label: "Department (optional)", key: "department", type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(newUser as unknown as Record<string, string>)[key]}
                    onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
                    required={key !== "department"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {ROLES.filter((r) => r.value !== "candidate").map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {newUser.role === "admin" && "Full access — can delete records and manage all settings"}
                  {newUser.role === "hr_manager" && "Can see and edit all records, manage masters"}
                  {newUser.role === "recruiter" && "Can add/edit own candidates; cannot delete"}
                  {newUser.role === "hod" && "Read-only access; can add PI remarks on shortlisted candidates"}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
                  {saving ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

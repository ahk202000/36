"use client";

import { useState, useEffect } from "react";
import { PERMISSION_LABELS, ROLE_DEFAULT_PERMISSIONS, getPermissions, type PermissionKey } from "@/lib/permissions";
import Pagination from "./Pagination";

interface Department {
  id: number;
  name: string;
  description: string | null;
  userCount?: number;
}

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departmentId: number | null;
  departmentName: string | null;
  role: string;
  permissions: Record<string, boolean> | null;
  isActive: boolean;
}

const ROLES = [
  { value: "admin", label: "مدیر کل" },
  { value: "manager", label: "مدیر" },
  { value: "commercial", label: "کارشناس بازرگانی" },
  { value: "planner", label: "برنامه‌ریزی (فقط کارتابل و مشاهده)" },
  { value: "user", label: "کاربر عادی" },
];

export default function UserManagement() {
  const [tab, setTab] = useState<"users" | "departments">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  // صفحه‌بندی
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [deptPage, setDeptPage] = useState(1);
  const [deptPageSize, setDeptPageSize] = useState(20);

  const userTotalPages = Math.max(1, Math.ceil(users.length / userPageSize));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const paginatedUsers = users.slice((safeUserPage - 1) * userPageSize, safeUserPage * userPageSize);

  const deptTotalPages = Math.max(1, Math.ceil(departments.length / deptPageSize));
  const safeDeptPage = Math.min(deptPage, deptTotalPages);
  const paginatedDepartments = departments.slice((safeDeptPage - 1) * deptPageSize, safeDeptPage * deptPageSize);

  // User form state
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    password: "",
    fullName: "",
    email: "",
    phone: "",
    departmentId: "",
    role: "user" as string,
    permissions: {} as Record<string, boolean>,
    isActive: true,
  });

  // Department form state
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, dRes] = await Promise.all([
        fetch("/api/users").then(r => r.json()),
        fetch("/api/departments").then(r => r.json()),
      ]);
      setUsers(uRes);
      setDepartments(dRes);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // --- User Handlers ---
  const openNewUser = () => {
    setEditingUser(null);
    setUserForm({
      username: "",
      password: "",
      fullName: "",
      email: "",
      phone: "",
      departmentId: "",
      role: "user",
      permissions: {},
      isActive: true,
    });
    setShowUserForm(true);
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      password: "",
      fullName: u.fullName,
      email: u.email || "",
      phone: u.phone || "",
      departmentId: u.departmentId?.toString() || "",
      role: u.role,
      permissions: u.permissions || {},
      isActive: u.isActive,
    });
    setShowUserForm(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.username || !userForm.fullName || (!editingUser && !userForm.password)) {
      alert("لطفا فیلدهای اجباری را پر کنید");
      return;
    }

    const payload = {
      username: userForm.username,
      password: userForm.password || undefined,
      fullName: userForm.fullName,
      email: userForm.email || null,
      phone: userForm.phone || null,
      departmentId: userForm.departmentId || null,
      role: userForm.role,
      permissions: Object.keys(userForm.permissions).length > 0 ? userForm.permissions : null,
      isActive: userForm.isActive,
    };

    const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users";
    const method = editingUser ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "خطا در ذخیره");
      return;
    }

    setShowUserForm(false);
    loadData();
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("آیا از حذف این کاربر مطمئن هستید؟")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    loadData();
  };

  const togglePermission = (key: string) => {
    const defaults = ROLE_DEFAULT_PERMISSIONS[userForm.role] || ROLE_DEFAULT_PERMISSIONS["user"];
    const current = getPermissions(userForm.role, userForm.permissions);
    const newValue = !current[key as PermissionKey];
    // Only store override if different from default
    const defaultVal = defaults[key as PermissionKey];
    const newPerms = { ...userForm.permissions };
    if (newValue === defaultVal) {
      delete newPerms[key];
    } else {
      newPerms[key] = newValue;
    }
    setUserForm({ ...userForm, permissions: newPerms });
  };

  const handleRoleChange = (newRole: string) => {
    // Reset custom permissions when role changes
    setUserForm({ ...userForm, role: newRole, permissions: {} });
  };

  // --- Department Handlers ---
  const openNewDept = () => {
    setEditingDept(null);
    setDeptForm({ name: "", description: "" });
    setShowDeptForm(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptForm({ name: d.name, description: d.description || "" });
    setShowDeptForm(true);
  };

  const handleSaveDept = async () => {
    if (!deptForm.name) {
      alert("نام واحد الزامی است");
      return;
    }
    const url = editingDept ? `/api/departments/${editingDept.id}` : "/api/departments";
    const method = editingDept ? "PUT" : "POST";
    
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deptForm),
    });
    setShowDeptForm(false);
    loadData();
  };

  const handleDeleteDept = async (id: number) => {
    if (!confirm("آیا از حذف این واحد مطمئن هستید؟")) return;
    await fetch(`/api/departments/${id}`, { method: "DELETE" });
    loadData();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto" />
      </div>
    );
  }

  const currentPermissions = getPermissions(userForm.role, userForm.permissions);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">مدیریت کاربران و واحدها</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("users")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition ${tab === "users" ? "bg-white shadow text-blue-700" : "text-gray-600 hover:text-gray-800"}`}
        >
          👥 کاربران ({users.length})
        </button>
        <button
          onClick={() => setTab("departments")}
          className={`px-6 py-2 rounded-lg text-sm font-medium transition ${tab === "departments" ? "bg-white shadow text-blue-700" : "text-gray-600 hover:text-gray-800"}`}
        >
          🏢 واحدها ({departments.length})
        </button>
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={openNewUser}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
            >
              + کاربر جدید
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">نام کامل</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">نام کاربری</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">واحد</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">نقش</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">وضعیت</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">مجوزها</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedUsers.map((u) => {
                    const perms = getPermissions(u.role, u.permissions);
                    const activePerms = Object.entries(perms).filter(([, v]) => v).map(([k]) => PERMISSION_LABELS[k as PermissionKey]);
                    return (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{u.fullName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">
                            {u.departmentName || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            u.role === "admin" ? "bg-red-100 text-red-800" :
                            u.role === "manager" ? "bg-purple-100 text-purple-800" :
                            u.role === "commercial" ? "bg-green-100 text-green-800" :
                            "bg-gray-100 text-gray-800"
                          }`}>
                            {ROLES.find(r => r.value === u.role)?.label || u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`w-2 h-2 rounded-full inline-block ml-2 ${u.isActive ? "bg-green-500" : "bg-red-500"}`}></span>
                          <span className="text-xs">{u.isActive ? "فعال" : "غیرفعال"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {activePerms.slice(0, 3).map((p, i) => (
                              <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{p}</span>
                            ))}
                            {activePerms.length > 3 && (
                              <span className="text-xs text-gray-400">+{activePerms.length - 3}</span>
                            )}
                            {activePerms.length === 0 && <span className="text-xs text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEditUser(u)} className="text-blue-600 hover:text-blue-800 text-xs">ویرایش</button>
                            <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 text-xs">حذف</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                currentPage={safeUserPage}
                totalPages={userTotalPages}
                totalItems={users.length}
                pageSize={userPageSize}
                onPageChange={setUserPage}
                onPageSizeChange={(s) => { setUserPageSize(s); setUserPage(1); }}
              />
            </div>
          </div>
        </>
      )}

      {/* Departments Tab */}
      {tab === "departments" && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={openNewDept}
              className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
            >
              + واحد جدید
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedDepartments.map((d) => (
              <div key={d.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <span className="text-purple-600 font-bold">{d.name.charAt(0)}</span>
                  </div>
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                    {d.userCount || 0} کاربر
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-1">{d.name}</h3>
                <p className="text-sm text-gray-500 mb-4 min-h-[20px]">{d.description || "بدون توضیحات"}</p>
                <div className="flex gap-2">
                  <button onClick={() => openEditDept(d)} className="flex-1 bg-blue-50 text-blue-700 py-2 rounded-lg text-sm hover:bg-blue-100 transition">ویرایش</button>
                  <button onClick={() => handleDeleteDept(d.id)} className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg text-sm hover:bg-red-100 transition">حذف</button>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            currentPage={safeDeptPage}
            totalPages={deptTotalPages}
            totalItems={departments.length}
            pageSize={deptPageSize}
            onPageChange={setDeptPage}
            onPageSizeChange={(s) => { setDeptPageSize(s); setDeptPage(1); }}
          />
        </>
      )}

      {/* User Form Modal */}
      {showUserForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl">{editingUser ? "ویرایش کاربر" : "کاربر جدید"}</h3>
                <button onClick={() => setShowUserForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">نام کاربری *</label>
                    <input
                      type="text"
                      value={userForm.username}
                      onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="مثلا: ali.ahmadi"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      رمز عبور {editingUser ? "(خالی بگذارید اگر نمی‌خواهید تغییر کند)" : "*"}
                    </label>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نام کامل *</label>
                  <input
                    type="text"
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ایمیل</label>
                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ltr-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تلفن</label>
                    <input
                      type="text"
                      value={userForm.phone}
                      onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ltr-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">واحد / دپارتمان</label>
                    <select
                      value={userForm.departmentId}
                      onChange={(e) => setUserForm({ ...userForm, departmentId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">بدون واحد</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">نقش</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.isActive}
                      onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">کاربر فعال است</span>
                  </label>
                </div>

                {/* Permissions */}
                <div className="border-t pt-4">
                  <h4 className="font-bold text-sm mb-3">مجوزها (بر حسب نقش + سفارشی‌سازی)</h4>
                  <p className="text-xs text-gray-400 mb-3">
                    نقش <strong>{ROLES.find(r => r.value === userForm.role)?.label}</strong> مجوزهای پیش‌فرض دارد. تیک‌ها را تغییر دهید تا سفارشی کنید.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((key) => {
                      const isChecked = !!currentPermissions[key];
                      const isDefault = ROLE_DEFAULT_PERMISSIONS[userForm.role]?.[key] === isChecked && !userForm.permissions[key] && userForm.permissions[key] !== false;
                      return (
                        <label key={key} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${isChecked ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(key)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">{PERMISSION_LABELS[key]}</span>
                            {isDefault && <span className="text-xs text-gray-400 mr-2">(پیش‌فرض نقش)</span>}
                            {userForm.permissions[key] !== undefined && <span className="text-xs text-orange-600 mr-2">(سفارشی)</span>}
                          </div>
                          <span className={`text-xs ${isChecked ? "text-green-600" : "text-gray-400"}`}>
                            {isChecked ? "✓" : "✕"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6 justify-end">
                <button onClick={() => setShowUserForm(false)} className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition">انصراف</button>
                <button onClick={handleSaveUser} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-medium transition">ذخیره</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Form Modal */}
      {showDeptForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">{editingDept ? "ویرایش واحد" : "واحد جدید"}</h3>
                <button onClick={() => setShowDeptForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">نام واحد *</label>
                  <input
                    type="text"
                    value={deptForm.name}
                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="مثلا: واحد بازرگانی"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">توضیحات</label>
                  <textarea
                    rows={3}
                    value={deptForm.description}
                    onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="توضیح واحد..."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6 justify-end">
                <button onClick={() => setShowDeptForm(false)} className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition">انصراف</button>
                <button onClick={handleSaveDept} className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-medium transition">ذخیره</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

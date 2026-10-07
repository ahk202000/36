"use client";

import { useState, useEffect } from "react";
import LoginPage from "@/components/LoginPage";
import Dashboard from "@/components/Dashboard";

export interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  email?: string | null;
  role: string;
  permissions?: Record<string, boolean> | null;
  departmentId: number | null;
  departmentName: string | null;
}

export default function Home() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // نسخه جدید session — کلید قدیمی را پاک می‌کنیم تا کاربران مجبور به ورود مجدد شوند
    const oldStored = localStorage.getItem("user");
    if (oldStored) {
      try {
        const oldUser = JSON.parse(oldStored);
        // اگر کاربر نقش planner یا departmentName برنامه‌ریزی ندارد، مهاجرت به کلید جدید
        if (oldUser) {
          localStorage.setItem("user_v2", oldStored);
          localStorage.removeItem("user");
        }
      } catch {}
    }
    const stored = localStorage.getItem("user_v2") || localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }
    setLoading(false);
  }, []);

  const handleLogin = (u: UserInfo) => {
    setUser(u);
    localStorage.setItem("user_v2", JSON.stringify(u));
    localStorage.removeItem("user");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user_v2");
    localStorage.removeItem("user");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <Dashboard user={user} onLogout={handleLogout} />;
}

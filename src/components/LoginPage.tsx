"use client";

import { useState, useEffect } from "react";
import type { UserInfo } from "@/app/page";

interface Props {
  onLogin: (user: UserInfo) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "fail">("checking");
  const [retryCount, setRetryCount] = useState(0);

  // Check server health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("/api/health", { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          setServerStatus("ok");
        } else {
          setServerStatus("fail");
        }
      } catch {
        setServerStatus("fail");
      }
    };
    checkHealth();
  }, [retryCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    // Retry logic - try up to 2 times
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        let data;
        try {
          data = await res.json();
        } catch {
          lastError = "پاسخ سرور نامعتبر است";
          continue;
        }
        
        if (!res.ok) {
          // For 401, don't retry
          if (res.status === 401) {
            setError(data.error || "نام کاربری یا رمز عبور اشتباه است");
            setLoading(false);
            return;
          }
          // For 503 (temporary), retry
          if (res.status === 503 && attempt === 0) {
            lastError = data.error || "سرور موقتا در دسترس نیست";
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          setError(data.error || "خطا در ورود");
          setLoading(false);
          return;
        } else {
          onLogin(data.user);
          setLoading(false);
          return;
        }
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (isAbort) {
          lastError = "سرور پاسخگو نیست (timeout) - لطفا دوباره تلاش کنید";
        } else if (err instanceof TypeError && err.message.includes("fetch")) {
          lastError = "خطا در ارتباط با سرور - اتصال اینترنت را بررسی کنید";
        } else {
          lastError = "خطا در ارتباط با سرور";
        }
        
        if (attempt === 0) {
          // Wait and retry
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
      }
    }
    
    setError(lastError + " — دکمه تلاش مجدد را بزنید یا صفحه را رفرش کنید (Ctrl+F5)");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Full-screen background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/images/login-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/80 via-indigo-900/70 to-purple-900/80 backdrop-blur-[2px]" />

      <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-md p-8 border border-white/20">
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-gray-800">سیستم دبیرخانه و صدور پیش فاکتور بهسا</h1>
          <p className="text-gray-500 mt-2">مدیریت نامه‌ها و پیش فاکتورها • کالیبراسیون</p>
          
          {/* Server status */}
          <div className="mt-3 flex items-center justify-center gap-2 text-xs">
            {serverStatus === "checking" && (
              <span className="text-gray-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                بررسی ارتباط با سرور...
              </span>
            )}
            {serverStatus === "ok" && (
              <span className="text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                سرور متصل است ✓
              </span>
            )}
            {serverStatus === "fail" && (
              <span className="text-red-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                سرور در دسترس نیست
                <button
                  onClick={() => { setServerStatus("checking"); setRetryCount(c => c + 1); }}
                  className="mr-2 text-blue-600 underline"
                >
                  تلاش مجدد
                </button>
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">نام کاربری</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="نام کاربری را وارد کنید"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              placeholder="رمز عبور را وارد کنید"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
              <div className="font-medium">⚠️ {error}</div>
              {error.includes("سرور") && (
                <div className="mt-2 text-xs text-red-600">
                  راهکار: 1) صفحه را رفرش کنید (Ctrl+F5) 2) چند ثانیه صبر کنید 3) دوباره تلاش کنید
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                در حال ورود...
              </>
            ) : (
              "ورود به سیستم"
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-gray-200">
          {serverStatus === "fail" && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-800">
              <div className="font-bold mb-1">💡 اگر خطای سرور می‌بینید:</div>
              <ul className="list-disc mr-4 space-y-1">
                <li>صفحه را رفرش کنید (Ctrl+F5)</li>
                <li>چند ثانیه صبر کنید و دوباره تلاش کنید</li>
                <li>از اتصال اینترنت مطمئن شوید</li>
                <li>اگر از لینک قدیمی استفاده می‌کنید، لینک جدید را از همین صفحه استفاده کنید</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

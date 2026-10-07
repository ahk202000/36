"use client";

import { useState, useEffect, type ReactNode } from "react";
import { SendHorizonal } from "lucide-react";
import type { UserInfo } from "@/app/page";
import LettersList from "./LettersList";
import LetterForm from "./LetterForm";
import ProformaList from "./ProformaList";
import ProformaForm from "./ProformaForm";
import ProformaView from "./ProformaView";
import SettingsPanel from "./SettingsPanel";
import CompaniesPanel from "./CompaniesPanel";
import EquipmentPanel from "./EquipmentPanel";
import UserManagement from "./UserManagement";
import CustomerReport from "./CustomerReport";
import ProformaDispatch from "./ProformaDispatch";
import Kartabl from "./Kartabl";
import StatsDashboard from "./StatsDashboard";
import NotificationBell from "./NotificationBell";
import { getPermissions } from "@/lib/permissions";

type View =
  | "dashboard"
  | "kartabl"
  | "letters"
  | "letter-new"
  | "letter-edit"
  | "proformas"
  | "proforma-new"
  | "proforma-edit"
  | "proforma-view"
  | "dispatch"
  | "settings"
  | "companies"
  | "equipment"
  | "users"
  | "reports";

interface Props {
  user: UserInfo;
  onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: Props) {
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedLetterId, setSelectedLetterId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<Array<{ id: number; msg: string }>>([]);
  // مبدأ باز شدن فرم نامه — برای بازگشت صحیح
  const [letterFromKartabl, setLetterFromKartabl] = useState(false);
  // مبدأ باز شدن فرم پیش‌فاکتور جدید (کارتابل / نامه / لیست) — برای بازگشت صحیح
  const [proformaOrigin, setProformaOrigin] = useState<"proformas" | "kartabl" | "letters" | "letter-edit">("proformas");
  // مبدأ باز شدن «مشاهده پیش‌فاکتور» — پس از اتمام کار (تایید/رد/بازگشت)
  // باید دقیقاً به همان جایی برگردیم که از آن آمده‌ایم (مثلاً همان کارتابل)
  const [proformaViewOrigin, setProformaViewOrigin] = useState<"proformas" | "kartabl" | "letter-edit" | "dispatch">("proformas");
  // وقتی از داخل فرم نامه وارد مشاهده پیش‌فاکتور شده‌ایم، شماره نامه را نگه می‌داریم تا به همان نامه برگردیم
  const [letterReturnId, setLetterReturnId] = useState<number | null>(null);

  // باز کردن صفحه مشاهده پیش‌فاکتور با به‌خاطر سپردن مبدأ
  const openProformaView = (id: number, origin: "proformas" | "kartabl" | "letter-edit" | "dispatch", letterId?: number | null) => {
    setSelectedId(id);
    setProformaViewOrigin(origin);
    setLetterReturnId(origin === "letter-edit" ? (letterId ?? null) : null);
    setView("proforma-view");
  };
  // بازگشت از مشاهده/ویرایش پیش‌فاکتور به همان مبدأ (کارتابل در کارتابل می‌ماند)
  const backFromProformaView = () => {
    if (proformaViewOrigin === "kartabl") {
      setView("kartabl");
    } else if (proformaViewOrigin === "dispatch") {
      setView("dispatch");
    } else if (proformaViewOrigin === "letter-edit" && letterReturnId) {
      setSelectedId(letterReturnId);
      setView("letter-edit");
    } else {
      setView("proformas");
    }
  };

  // شروع صدور پیش‌فاکتور از روی نامه (از کارتابل یا داخل نامه)
  const startProformaFromLetter = (letterId: number, origin: "kartabl" | "letters" | "letter-edit") => {
    setSelectedLetterId(letterId);
    setProformaOrigin(origin);
    setView("proforma-new");
  };
  const backFromNewProforma = () => {
    if (proformaOrigin === "letter-edit" && selectedLetterId) {
      setSelectedId(selectedLetterId);
      setView("letter-edit");
    } else if (proformaOrigin === "kartabl") {
      setView("kartabl");
    } else if (proformaOrigin === "letters") {
      setView("letters");
    } else {
      setView("proformas");
    }
  };

  const perms = getPermissions(user.role, user.permissions);
  const isPlanner = user.role === "planner";

  // Toast helper
  useEffect(() => {
    (window as unknown as { showToast: (msg: string) => void }).showToast = (msg: string) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, msg }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    };
  }, []);

  const allMenuItems: Array<{ key: View; label: string; icon: ReactNode; show: boolean; gradient: string }> = [
    { key: "dashboard" as View, label: "داشبورد", icon: "📊", show: true, gradient: "from-indigo-500 to-purple-500" },
    { key: "kartabl" as View, label: "کارتابل من", icon: "📥", show: true, gradient: "from-blue-500 to-cyan-500" },
    { key: "letters" as View, label: "نامه‌های وارده", icon: "📨", show: perms.manageLetters || perms.viewLetters, gradient: "from-emerald-500 to-teal-500" },
    { key: "proformas" as View, label: "پیش فاکتورها", icon: "📋", show: perms.createProforma || perms.approveProforma, gradient: "from-amber-500 to-orange-500" },
    { key: "dispatch" as View, label: "ارسال پیش‌فاکتور", icon: <SendHorizonal className="w-4 h-4" />, show: user.role !== "planner", gradient: "from-green-500 to-emerald-500" },
    { key: "reports" as View, label: "سوابق مشتری", icon: "📈", show: perms.createProforma || perms.manageCompanies || perms.approveProforma || user.role === "user" || (user.departmentName || "").includes("دبیرخانه"), gradient: "from-purple-500 to-pink-500" },
    { key: "companies" as View, label: "شرکت‌ها", icon: "🏢", show: perms.manageCompanies, gradient: "from-pink-500 to-rose-500" },
    { key: "equipment" as View, label: "تجهیزات", icon: "🔧", show: perms.manageEquipment, gradient: "from-cyan-500 to-blue-500" },
    { key: "users" as View, label: "کاربران و واحدها", icon: "👥", show: perms.manageUsers, gradient: "from-violet-500 to-purple-500" },
    { key: "settings" as View, label: "تنظیمات", icon: "⚙️", show: perms.manageSettings, gradient: "from-gray-600 to-gray-800" },
  ];

  const menuItems = allMenuItems.filter((m) => m.show);

  const renderContent = () => {
    switch (view) {
      case "kartabl":
        return (
          <Kartabl
            user={user}
            onViewLetter={(id) => { setSelectedId(id); setLetterFromKartabl(true); setView("letter-edit"); }}
            onViewProforma={(id) => openProformaView(id, "kartabl")}
            onCreateProforma={perms.createProforma ? (letterId) => startProformaFromLetter(letterId, "kartabl") : undefined}
          />
        );
      case "letters":
        return (
          <LettersList
            user={user}
            onNewLetter={() => { setLetterFromKartabl(false); setView("letter-new"); }}
            onEditLetter={(id: number) => { setSelectedId(id); setLetterFromKartabl(false); setView("letter-edit"); }}
            onCreateProforma={(letterId: number) => startProformaFromLetter(letterId, "letters")}
          />
        );
      case "letter-new":
        return (
          <LetterForm
            user={user}
            onBack={() => setView("letters")}
            onSaved={() => setView("letters")}
          />
        );
      case "letter-edit":
        return (
          <LetterForm
            user={user}
            letterId={selectedId}
            onBack={() => setView(letterFromKartabl ? "kartabl" : "letters")}
            onSaved={() => setView(letterFromKartabl ? "kartabl" : "letters")}
            onCreateProforma={perms.createProforma ? (letterId) => startProformaFromLetter(letterId, "letter-edit") : undefined}
            onViewProforma={(id) => openProformaView(id, "letter-edit", selectedId)}
          />
        );
      case "proformas":
        return (
          <ProformaList
            user={user}
            onNewProforma={() => { setSelectedLetterId(null); setProformaOrigin("proformas"); setView("proforma-new"); }}
            onEditProforma={(id: number) => { setSelectedId(id); setProformaViewOrigin("proformas"); setView("proforma-edit"); }}
            onViewProforma={(id: number) => openProformaView(id, "proformas")}
          />
        );
      case "proforma-new":
        return (
          <ProformaForm
            user={user}
            letterId={selectedLetterId}
            onBack={backFromNewProforma}
            onSaved={() => setView("proformas")}
          />
        );
      case "proforma-edit":
        return (
          <ProformaForm
            user={user}
            proformaId={selectedId}
            onBack={backFromProformaView}
            onSaved={backFromProformaView}
          />
        );
      case "proforma-view":
        return (
          <ProformaView
            user={user}
            proformaId={selectedId!}
            onBack={backFromProformaView}
            onEdit={(id: number) => { setSelectedId(id); setView("proforma-edit"); }}
          />
        );
      case "dispatch":
        return (
          <ProformaDispatch
            user={user}
            onViewProforma={(id: number) => openProformaView(id, "dispatch")}
          />
        );
      case "settings":
        return <SettingsPanel user={user} />;
      case "companies":
        return <CompaniesPanel />;
      case "equipment":
        return <EquipmentPanel />;
      case "users":
        return <UserManagement />;
      case "reports":
        return <CustomerReport user={user} />;
      default:
        return <StatsDashboard user={user} setView={(v) => setView(v as View)} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Sidebar - Modern Glass + Gradient */}
      <aside className={`${sidebarOpen ? "w-72" : "w-20"} bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-900 text-white transition-all duration-300 flex flex-col relative overflow-hidden shrink-0`}>
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="relative p-5 border-b border-white/10 flex items-center justify-between">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <span className="text-white font-black text-lg">PF</span>
              </div>
              <div>
                <h2 className="font-black text-sm">پیش‌فاکتور</h2>
                <p className="text-xs text-white/60">سیستم جامع</p>
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto">
              <span className="text-white font-black">PF</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8 bg-white/10 backdrop-blur rounded-lg flex items-center justify-center hover:bg-white/20 transition shrink-0">
            <span className="text-sm">{sidebarOpen ? "‹" : "›"}</span>
          </button>
        </div>

        <div className="relative px-3 py-2">
          {sidebarOpen && <div className="text-xs font-bold text-white/40 px-3 py-2">منو اصلی</div>}
        </div>

        <nav className="relative flex-1 px-3 space-y-1 overflow-auto scrollbar-hide">
          {menuItems.map((item) => {
            const isActive = view === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 relative overflow-hidden group ${
                  isActive
                    ? "bg-white text-slate-900 shadow-lg shadow-black/10"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {isActive && (
                  <div className={`absolute inset-0 bg-gradient-to-r ${item.gradient} opacity-10 rounded-xl`}></div>
                )}
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                  isActive
                    ? `bg-gradient-to-br ${item.gradient} text-white shadow-md`
                    : "bg-white/10 group-hover:bg-white/20"
                }`}>
                  {item.icon}
                </span>
                {sidebarOpen && <span className="relative">{item.label}</span>}
                {isActive && sidebarOpen && <span className="mr-auto w-2 h-2 bg-green-500 rounded-full animate-pulse relative"></span>}
              </button>
            );
          })}
        </nav>

        <div className="relative p-4 border-t border-white/10">
          {sidebarOpen ? (
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 border border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-xl flex items-center justify-center font-black text-slate-900">
                  {user.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{user.fullName}</p>
                  <p className="text-xs text-white/60 truncate">{user.departmentName || "بدون واحد"}</p>
                </div>
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="bg-white/20 px-2 py-1 rounded-full">{user.role}</span>
                <span className="text-white/50">آنلاین</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-400 rounded-xl flex items-center justify-center font-black text-slate-900">
                {user.fullName.charAt(0)}
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className={`w-full mt-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white text-sm py-2.5 rounded-xl font-medium transition shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 ${!sidebarOpen ? "px-2" : ""}`}
          >
            <span>🚪</span> {sidebarOpen && "خروج"}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar - Modern */}
        <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-500">
              <span>داشبورد</span>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-gray-900">
                {menuItems.find(m => m.key === view)?.label || "داشبورد"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              سیستم فعال
            </div>
            
            <NotificationBell
              user={user}
              onViewLetter={(id) => { setSelectedId(id); setLetterFromKartabl(view === "kartabl"); setView("letter-edit"); }}
              onViewProforma={(id) => openProformaView(id, view === "kartabl" ? "kartabl" : view === "dispatch" ? "dispatch" : "proformas")}
            />

            <div className="w-px h-6 bg-gray-200"></div>

            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right">
                <div className="text-sm font-bold text-gray-900">{user.fullName}</div>
                <div className="text-xs text-gray-500">{user.departmentName}</div>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold shadow-md">
                {user.fullName.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 bg-[#f8fafc] overflow-auto">
          <div className="max-w-[1400px] mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-6 left-6 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 slide-in border border-white/10">
            <span className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0">✓</span>
            <span className="text-sm font-medium">{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

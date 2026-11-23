import React, { useState } from "react";
import { Menu, Play, X } from "lucide-react";

export type AppTab = "home" | "simulation" | "compare" | "history";

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onStartSimulation: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onStartSimulation,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: "home", label: "홈" },
    { id: "simulation", label: "동작 시뮬레이션" },
    { id: "compare", label: "기록 비교" },
    { id: "history", label: "분석 기록" },
  ];

  const handleNavClick = (tab: AppTab) => {
    onSelectTab(tab);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick("home")}
          className="text-lg font-extrabold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          SPORTS AI
        </button>

        {/* Zone 2: Clean single-line nav links */}
        <nav
          aria-label="주요 메뉴"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`relative py-5 whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? "text-[#0B1F3A] font-semibold"
                    : "text-slate-600 hover:text-[#0B1F3A]"
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0B1F3A]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartSimulation}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            <span>시뮬레이션 시작</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileOpen}
            className="md:hidden p-2.5 text-slate-700 hover:text-[#0B1F3A] border border-slate-200 rounded-lg cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <nav
          aria-label="모바일 메뉴"
          className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-wrap gap-2"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#0B1F3A] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
};

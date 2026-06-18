import React from "react";

function Header({
  currentTab,
  setCurrentTab,
  sidebarOpen,
  setSidebarOpen,
  darkMode,
  setDarkMode,
  setHistory,
  initialAssistantMsg,
}) {
  const tabs = [
    { id: "chat", label: "Chat", icon: "forum" },
    { id: "knowledge-base", label: "Knowledge Base", icon: "folder_open" },
    { id: "dashboard", label: "Resume Dashboard", icon: "dashboard" },
    { id: "roadmap", label: "Career Roadmap", icon: "route" },
    { id: "quiz", label: "Aptitude Test", icon: "edit_note" },
    { id: "optimizer", label: "Resume Optimizer", icon: "tune" },
    { id: "dsa-workspace", label: "DSA Playground", icon: "code" },
    { id: "mock-interview", label: "Mock Interview", icon: "record_voice_over" },
    { id: "company-hub", label: "Company Hub", icon: "business" },
  ];

  const getHeaderTitle = () => {
    switch (currentTab) {
      case "chat": return "PlacementPal Chat";
      case "knowledge-base": return "Knowledge Base";
      case "dashboard": return "Resume Dashboard";
      case "roadmap": return "Career Roadmap";
      case "quiz": return "Aptitude Test";
      case "optimizer": return "Resume Optimizer";
      case "dsa-workspace": return "DSA Playground";
      case "mock-interview": return "Mock Interview";
      case "company-hub": return "Company Hub";
      default: return "PlacementPal";
    }
  };

  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear the chat conversation?")) {
      setHistory([initialAssistantMsg]);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 h-20 bg-white dark:bg-slate-900 border-b border-outline-variant/30 dark:border-slate-800/80 sticky top-0 z-50 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-transform"
          type="button"
        >
          <span className="material-symbols-outlined text-on-surface dark:text-slate-200">menu</span>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-primary to-violet-600 rounded-lg flex items-center justify-center shadow-md shadow-primary/10 text-white shrink-0 lg:hidden">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" fillOpacity="0.2" />
              <path d="M6 10v6c0 2 2.5 3 6 3s6-1 6-3v-6" />
              <path d="M22 7v7" />
            </svg>
          </div>
          <span className="relative flex h-3 w-3" id="header-status-dot">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary"></span>
          </span>
          <span className="font-semibold text-on-surface/80 dark:text-slate-300 text-sm hidden sm:inline" id="header-title">
            {getHeaderTitle()}
          </span>
        </div>
      </div>

      {/* Tabs Menu for tablet & desktop */}
      <div
        className="hidden md:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto scrollbar-none max-w-[50%] lg:max-w-[60%] select-none gap-0.5"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                  : "text-outline hover:text-on-surface dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="w-10 h-10 flex items-center justify-center text-outline hover:text-on-surface dark:hover:text-slate-200 border border-outline-variant dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
          type="button"
          title="Toggle dark mode"
        >
          <span className="material-symbols-outlined">
            {darkMode ? "light_mode" : "dark_mode"}
          </span>
        </button>
        {currentTab === "chat" && (
          <button
            onClick={handleClearChat}
            className="px-5 py-2 text-on-surface dark:text-slate-200 border border-outline-variant dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all shadow-sm whitespace-nowrap shrink-0"
            type="button"
          >
            Clear chat
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;

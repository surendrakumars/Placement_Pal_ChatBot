import React, { useRef, useState } from "react";
import ResumePasteModal from "./ResumePasteModal";
import { fileToBase64, parseJsonResponse } from "../utils";

function Sidebar({
  currentTab,
  setCurrentTab,
  resumeContext,
  setResumeContext,
  resumeAnalysis,
  setResumeAnalysis,
  setResumeOptimization,
  setHistory,
  sidebarOpen,
  setSidebarOpen,
  fetchResumeAnalysis,
  sendMessage,
}) {
  const fileInputRef = useRef(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const navItems = [
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

  const quickGuides = [
    { label: "30-day prep plan", subtitle: "Master your roadmap", prompt: "I have 30 days for placements. Help me make a realistic prep plan and keep it doable." },
    { label: "Resume review", subtitle: "Polish your profile", prompt: "Can you review my resume like a placement pal and tell me what to improve first?" },
    { label: "HR mock interview", subtitle: "Practice speaking", prompt: "Let's do an HR mock interview. Ask one question at a time and give friendly feedback." },
    { label: "DSA practice", subtitle: "Solve challenges", prompt: "I want to practice DSA for placements. Start with questions that match my level." },
    { label: "Aptitude plan", subtitle: "Logical reasoning", prompt: "Aptitude feels confusing. Help me make it less scary and plan what to practice." },
    { label: "Group discussion", subtitle: "Team communication", prompt: "Help me prepare for a group discussion round like we're practicing together." },
  ];

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);

    try {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please upload a PDF resume");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("PDF must be 5 MB or smaller");
      }

      const b64 = await fileToBase64(file);
      const response = await fetch("/api/upload-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data: b64 }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Upload failed");

      const context = { filename: data.filename, text: data.text };
      setResumeContext(context);
      fetchResumeAnalysis(data.text, data.filename);
      setCurrentTab("dashboard");
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: `Nice, I have your resume (${data.filename}). Ask me to review it, suggest improvements, tailor a prep plan, or run a mock interview based on your profile.` },
      ]);
    } catch (err) {
      alert(`Failed to load resume: ${err.message}`);
      if (
        confirm(
          "Could not upload/extract text from the PDF. It may be scanned, an image, or corrupted.\n\nWould you like to paste your resume text manually instead?"
        )
      ) {
        setPasteModalOpen(true);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSavePaste = (text) => {
    const context = { filename: "pasted-resume.txt", text };
    setResumeContext(context);
    fetchResumeAnalysis(text, "pasted-resume.txt");
    setCurrentTab("dashboard");
    setHistory((prev) => [
      ...prev,
      { role: "assistant", content: "Awesome, I've loaded your pasted resume text. Ask me to review it, suggest improvements, or prep you for placement questions based on it!" },
    ]);
  };

  const handleRemoveResume = () => {
    localStorage.removeItem("resume_analysis");
    if (resumeContext) {
      // Clear checklist items
      for (let key in localStorage) {
        if (key.startsWith(`checklist_item_${resumeContext.filename}_`)) {
          localStorage.removeItem(key);
        }
      }
    }
    setResumeContext(null);
    setResumeAnalysis(null);
    setResumeOptimization(null);
    setCurrentTab("chat");
    setHistory((prev) => [
      ...prev,
      { role: "assistant", content: "Resume removed. Upload a new PDF anytime from the sidebar or attach button." },
    ]);
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <>
      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] w-80 bg-white dark:bg-slate-900 border-r border-outline-variant/50 dark:border-slate-800 transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static transition-transform duration-300 ease-in-out flex flex-col p-6 overflow-y-auto`}
        id="sidebar"
      >
        {/* Title / Logo header */}
        <div className="flex items-center gap-3 mb-10 shrink-0">
          <div className="w-12 h-12 bg-gradient-to-tr from-primary to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 relative overflow-hidden group">
            {/* Shimmer effect */}
            <div className="absolute inset-0 w-[200%] h-[200%] bg-gradient-to-br from-white/25 via-transparent to-transparent -translate-x-[70%] -translate-y-[70%] rotate-45 transition-transform duration-1000 group-hover:translate-x-[25%] group-hover:translate-y-[25%]"></div>
            {/* Graduation Cap logo emblem */}
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" fillOpacity="0.2" />
              <path d="M6 10v6c0 2 2.5 3 6 3s6-1 6-3v-6" />
              <path d="M22 7v7" />
              <circle cx="12" cy="13" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="font-headline-md text-xl font-bold text-on-surface dark:text-slate-100">
              PlacementPal
            </h1>
            <p className="text-outline text-[12px] dark:text-slate-400">
              Your placement prep pal
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 shrink-0">
          <h2 className="text-[11px] font-bold text-outline dark:text-slate-400 uppercase tracking-widest mb-3 px-1">
            Navigation
          </h2>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-slate-50 text-primary dark:bg-slate-800/40 dark:text-slate-200"
                      : "text-outline hover:text-on-surface hover:bg-slate-50 dark:hover:bg-slate-800/40 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Resume upload panel */}
        <div className="mb-8 shrink-0">
          <h2 className="text-[11px] font-bold text-outline dark:text-slate-400 uppercase tracking-widest mb-4 px-1">
            Your Resume
          </h2>
          <input
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf,.pdf"
            className="hidden"
            type="file"
          />

          {!resumeContext ? (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full text-left p-4 rounded-xl border border-dashed border-outline-variant/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/5 transition-all"
                type="button"
              >
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {isUploading ? (
                      <span className="material-symbols-outlined animate-spin">sync</span>
                    ) : (
                      <span className="material-symbols-outlined">upload_file</span>
                    )}
                  </span>
                  <span>
                    <span className="block font-semibold text-on-surface dark:text-slate-200 text-sm">
                      {isUploading ? "Uploading..." : "Upload PDF resume"}
                    </span>
                    <span className="text-xs text-outline dark:text-slate-400">
                      Personalize advice to your profile
                    </span>
                  </span>
                </span>
              </button>
              <button
                onClick={() => setPasteModalOpen(true)}
                className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1 mx-1 focus:outline-none"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">edit_note</span>
                Or paste resume text manually
              </button>
            </>
          ) : (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 dark:border-primary/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-primary uppercase tracking-wide">
                    Resume loaded
                  </p>
                  <p className="text-sm text-on-surface dark:text-slate-200 truncate" title={resumeContext.filename}>
                    {resumeContext.filename}
                  </p>
                </div>
                <button
                  onClick={handleRemoveResume}
                  className="shrink-0 text-outline hover:text-red-600 transition-colors"
                  title="Remove resume"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quickstart Guides */}
        <div>
          <h2 className="text-[11px] font-bold text-outline dark:text-slate-400 uppercase tracking-widest mb-4 px-1">
            Quick Start Guides
          </h2>
          <nav className="grid grid-cols-1 gap-3">
            {quickGuides.map((guide, idx) => (
              <button
                key={idx}
                onClick={() => {
                  sendMessage(guide.prompt);
                  setSidebarOpen(false);
                }}
                className="group w-full text-left p-4 rounded-xl border border-outline-variant/60 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/5 transition-all shadow-sm"
              >
                <span className="block font-semibold text-on-surface dark:text-slate-200 text-sm group-hover:text-primary">
                  {guide.label}
                </span>
                <span className="text-xs text-outline dark:text-slate-400 group-hover:text-primary/70">
                  {guide.subtitle}
                </span>
              </button>
            ))}
          </nav>
        </div>


      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[55] lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Paste Resume Modal */}
      <ResumePasteModal
        isOpen={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        onSave={handleSavePaste}
      />
    </>
  );
}

export default Sidebar;

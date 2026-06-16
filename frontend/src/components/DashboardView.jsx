import React, { useRef, useState, useEffect } from "react";
import { fileToBase64, parseJsonResponse } from "../utils";

function DashboardView({
  resumeContext,
  setResumeContext,
  resumeAnalysis,
  setResumeAnalysis,
  setResumeOptimization,
  setHistory,
  setCurrentTab,
}) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [checkedTasks, setCheckedTasks] = useState({});

  // Sync checklist states
  useEffect(() => {
    if (resumeContext && resumeAnalysis) {
      const items = {};
      const list = resumeAnalysis.action_checklist || [];
      list.forEach((_, idx) => {
        const val = localStorage.getItem(`checklist_item_${resumeContext.filename}_${idx}`);
        items[idx] = val === "true";
      });
      setCheckedTasks(items);
    }
  }, [resumeContext, resumeAnalysis]);

  const toggleTask = (idx) => {
    const newVal = !checkedTasks[idx];
    setCheckedTasks((prev) => ({ ...prev, [idx]: newVal }));
    localStorage.setItem(`checklist_item_${resumeContext.filename}_${idx}`, newVal ? "true" : "false");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

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
      setHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Nice, I have your resume (${data.filename}). Ask me to review it, suggest improvements, tailor a prep plan, or run a mock interview based on your profile.`,
        },
      ]);
    } catch (err) {
      alert(`Failed to load resume: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fetchResumeAnalysis = async (resumeText, filename) => {
    setResumeAnalysis(null);
    try {
      const response = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resumeText }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      setResumeAnalysis(data.analysis);
      localStorage.setItem(
        "resume_analysis",
        JSON.stringify({
          filename,
          text: resumeText,
          analysis: data.analysis,
        })
      );
    } catch (error) {
      alert(`Error analyzing resume: ${error.message}`);
    }
  };

  // If no resume uploaded
  if (!resumeContext) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" id="dashboard-empty-state">
        <input ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,.pdf" className="hidden" type="file" />
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/10">
          <span className="material-symbols-outlined text-[36px]">assessment</span>
        </div>
        <h3 className="text-lg font-bold text-on-surface dark:text-slate-100 mb-2">Resume Dashboard</h3>
        <p className="text-sm text-outline max-w-sm mb-6 leading-relaxed">
          Upload your PDF resume from the sidebar or click below to unlock a comprehensive dashboard detailing score, skills, strengths, weaknesses, and tailored projects.
        </p>
        <button
          onClick={handleUploadClick}
          disabled={isUploading}
          className="px-5 py-2.5 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all flex items-center gap-2 shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
          type="button"
        >
          {isUploading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
              Uploading...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Upload Resume
            </>
          )}
        </button>
      </div>
    );
  }

  // If uploading/analyzing skeleton loader
  if (!resumeAnalysis || isUploading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6" id="dashboard-loading-state">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            </div>
            <div className="h-16 w-16 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
          </div>
          <hr className="border-slate-100 dark:border-slate-800" />
          <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl space-y-3">
            <div className="h-4 w-1/4 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-4">
              <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            </div>
            <div className="p-6 border border-slate-100 dark:border-slate-800 rounded-2xl space-y-4">
              <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-3 w-2/3 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard loaded state
  const score = resumeAnalysis.score || 0;
  const circumference = 175.9;
  const offset = circumference - (score / 100) * circumference;

  let feedback = "Needs Work";
  let strokeColor = "#ef4444";
  let feedbackClass = "text-red-500";
  if (score >= 80) {
    feedback = "Excellent Profile";
    strokeColor = "#10b981";
    feedbackClass = "text-emerald-600 dark:text-emerald-450";
  } else if (score >= 60) {
    feedback = "Good Profile";
    strokeColor = "#2563eb";
    feedbackClass = "text-primary dark:text-blue-400";
  } else if (score >= 40) {
    feedback = "Average Profile";
    strokeColor = "#f59e0b";
    feedbackClass = "text-amber-500";
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8" id="dashboard-loaded-state">
      {/* Score and Resume Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-on-surface dark:text-slate-100" id="dash-filename">
            {resumeContext.filename}
          </h3>
          <p className="text-xs text-outline mt-1" id="dash-summary-subtitle">
            Personalized analysis of your profile
          </p>
        </div>

        {/* Circular Score Gauge */}
        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/85 p-3 rounded-2xl shrink-0 shadow-sm">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="32" cy="32" r="28" stroke="var(--color-outline-variant)" strokeWidth="6" fill="transparent" />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke={strokeColor}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <span className="absolute text-base font-extrabold text-on-surface dark:text-slate-100" id="dash-score-text">
              {score}%
            </span>
          </div>
          <div>
            <span className="block text-xs font-bold text-outline uppercase tracking-wider">Overall Score</span>
            <span className={`text-sm font-bold ${feedbackClass}`} id="dash-score-feedback">
              {feedback}
            </span>
          </div>
        </div>
      </div>

      <hr className="border-slate-100 dark:border-slate-800" />

      {/* Summary Card */}
      <div className="p-6 bg-gradient-to-r from-primary/5 to-slate-50 dark:to-slate-800/20 border border-primary/10 dark:border-primary/20 rounded-2xl shadow-sm">
        <h4 className="text-sm font-bold text-primary dark:text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          PlacementPal Summary
        </h4>
        <p className="text-sm text-on-surface/90 dark:text-slate-250 leading-relaxed" id="dash-summary">
          {resumeAnalysis.summary}
        </p>
      </div>

      {/* Strengths & Improvements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-450 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-500">check_circle</span>
            Key Strengths
          </h4>
          <ul className="space-y-3" id="dash-strengths">
            {(resumeAnalysis.strengths || []).map((str, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-on-surface/85 dark:text-slate-300">
                <span className="material-symbols-outlined text-emerald-500 shrink-0 text-[18px]">check</span>
                <span>{str}</span>
              </li>
            ))}
            {(!resumeAnalysis.strengths || !resumeAnalysis.strengths.length) && (
              <li className="text-xs text-outline italic">No specific strengths listed.</li>
            )}
          </ul>
        </div>

        {/* Improvements */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-amber-700 dark:text-amber-450 uppercase tracking-wide mb-4 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-amber-600">report_problem</span>
            Areas of Improvement
          </h4>
          <ul className="space-y-3" id="dash-improvements">
            {(resumeAnalysis.improvements || []).map((imp, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-on-surface/85 dark:text-slate-300">
                <span className="material-symbols-outlined text-amber-500 shrink-0 text-[18px]">info</span>
                <span>{imp}</span>
              </li>
            ))}
            {(!resumeAnalysis.improvements || !resumeAnalysis.improvements.length) && (
              <li className="text-xs text-outline italic">No specific areas of improvement listed.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Extracted Skills */}
      <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
        <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-outline">construction</span>
          Extracted Skills
        </h4>
        <div className="flex flex-wrap gap-2" id="dash-skills">
          {(resumeAnalysis.skills || []).map((skill, idx) => (
            <span
              key={idx}
              className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-on-surface dark:text-slate-200 text-xs font-semibold rounded-full transition-colors"
            >
              {skill}
            </span>
          ))}
          {(!resumeAnalysis.skills || !resumeAnalysis.skills.length) && (
            <span className="text-xs text-outline italic">No skills identified.</span>
          )}
        </div>
      </div>

      {/* Checklist & Projects grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Action Checklist */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm flex flex-col h-full">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary">playlist_add_check</span>
            Action Checklist
          </h4>
          <p className="text-xs text-outline mb-4">
            Interactive checklist of recommended resume fixes. Work on them step-by-step!
          </p>
          <div className="space-y-3 flex-1 overflow-y-auto chat-container max-h-[300px]" id="dash-checklist">
            {(resumeAnalysis.action_checklist || []).map((item, idx) => {
              const isChecked = !!checkedTasks[idx];
              return (
                <div
                  key={idx}
                  onClick={() => toggleTask(idx)}
                  className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-all cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // Swallowed: div handles click
                    className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 mt-0.5 cursor-pointer"
                  />
                  <span
                    className={`text-sm text-on-surface/85 dark:text-slate-300 flex-1 select-none ${
                      isChecked ? "line-through text-outline dark:text-slate-500" : ""
                    }`}
                  >
                    {item.task}
                  </span>
                </div>
              );
            })}
            {(!resumeAnalysis.action_checklist || !resumeAnalysis.action_checklist.length) && (
              <p className="text-xs text-outline italic">No actions in the checklist.</p>
            )}
          </div>
        </div>

        {/* Suggested Projects */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm flex flex-col h-full">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-secondary">lightbulb</span>
            Suggested Projects
          </h4>
          <p className="text-xs text-outline mb-4">
            Tailored project ideas to expand your portfolio and address gaps in your resume.
          </p>
          <ul className="space-y-4 flex-1 overflow-y-auto chat-container max-h-[300px]" id="dash-projects">
            {(resumeAnalysis.suggested_projects || []).map((proj, idx) => {
              const parts = proj.split(/:\s*(.*)/);
              return (
                <li key={idx} className="flex flex-col gap-0.5">
                  <strong className="text-sm font-semibold text-on-surface dark:text-slate-200">
                    {parts.length >= 2 ? parts[0] : proj}
                  </strong>
                  {parts.length >= 2 && (
                    <span className="text-xs text-outline dark:text-slate-450 leading-relaxed">
                      {parts[1]}
                    </span>
                  )}
                </li>
              );
            })}
            {(!resumeAnalysis.suggested_projects || !resumeAnalysis.suggested_projects.length) && (
              <li className="text-xs text-outline italic">No project suggestions generated.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default DashboardView;

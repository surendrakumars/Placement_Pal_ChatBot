import React, { useRef, useState, useEffect } from "react";
import { fileToBase64, parseJsonResponse, escapeHtml } from "../utils";

function ResumeOptimizerView({
  resumeContext,
  resumeOptimization,
  setResumeOptimization,
}) {
  const fileInputRef = useRef(null);
  const [isUploadingJd, setIsUploadingJd] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [jdText, setJdText] = useState("");
  const [jdPdf, setJdPdf] = useState(null); // { filename: string, text: string }

  const [copiedIndex, setCopiedIndex] = useState(null);
  const [checkedTasks, setCheckedTasks] = useState({});

  // Sync checklist from localStorage
  useEffect(() => {
    if (resumeContext && resumeOptimization) {
      const items = {};
      const list = resumeOptimization.checklist || [];
      list.forEach((_, idx) => {
        const val = localStorage.getItem(`opt_checklist_item_${resumeContext.filename}_${idx}`);
        items[idx] = val === "true";
      });
      setCheckedTasks(items);
    }
  }, [resumeContext, resumeOptimization]);

  const toggleTask = (idx) => {
    const newVal = !checkedTasks[idx];
    setCheckedTasks((prev) => ({ ...prev, [idx]: newVal }));
    localStorage.setItem(`opt_checklist_item_${resumeContext.filename}_${idx}`, newVal ? "true" : "false");
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingJd(true);

    try {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        throw new Error("Please upload a PDF file");
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

      setJdPdf({ filename: data.filename, text: data.text });
      setJdText(""); // Clear text if PDF loaded
    } catch (err) {
      alert(`Failed to extract text from Job Description PDF: ${err.message}`);
      removeJdPdf();
    } finally {
      setIsUploadingJd(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeJdPdf = () => {
    setJdPdf(null);
  };

  const handleOptimize = async () => {
    if (!resumeContext) {
      alert("Please upload your resume in the sidebar or Dashboard first.");
      return;
    }
    const combinedJd = jdPdf
      ? `PDF Job Description (${jdPdf.filename}):\n${jdPdf.text}\n\n${jdText}`
      : jdText.trim();

    if (!combinedJd) {
      alert("Please paste a Job Description or upload a JD PDF first.");
      return;
    }

    setIsOptimizing(true);
    try {
      const response = await fetch("/api/optimize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: resumeContext.text,
          jd: combinedJd,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Optimization request failed");

      setResumeOptimization(data.optimization);
      localStorage.setItem(
        `resume_opt_${resumeContext.filename}`,
        JSON.stringify({
          jd: combinedJd,
          optimization: data.optimization,
        })
      );
    } catch (err) {
      alert(`Error tailoring resume: ${err.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to optimize a new Job Description? This will clear current suggestions.")) {
      if (resumeContext) {
        localStorage.removeItem(`resume_opt_${resumeContext.filename}`);
        for (let key in localStorage) {
          if (key.startsWith(`opt_checklist_item_${resumeContext.filename}_`)) {
            localStorage.removeItem(key);
          }
        }
      }
      setResumeOptimization(null);
      setJdPdf(null);
      setJdText("");
    }
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  // If loading optimization
  if (isOptimizing) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6" id="optimizer-loading-state">
        <div className="max-w-2xl mx-auto text-center py-16 space-y-4 animate-pulse">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-md">
            <span className="material-symbols-outlined text-[32px] animate-spin">sync</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface dark:text-slate-100">Tailoring Your Resume...</h3>
          <p className="text-sm text-outline max-w-sm mx-auto leading-relaxed">
            Our AI is analyzing skill gaps, comparing bullet points, and drafting optimized copy. This may take up to 20 seconds.
          </p>
        </div>
      </div>
    );
  }

  // If optimized results are loaded
  if (resumeOptimization) {
    const score = resumeOptimization.match_score || 0;
    const circumference = 175.9;
    const offset = circumference - (score / 100) * circumference;

    let feedback = "Needs Work";
    let strokeColor = "#ef4444";
    let feedbackClass = "text-red-500";
    if (score >= 80) {
      feedback = "Strong Match";
      strokeColor = "#10b981";
      feedbackClass = "text-emerald-600 dark:text-emerald-450";
    } else if (score >= 60) {
      feedback = "Moderate Match";
      strokeColor = "#2563eb";
      feedbackClass = "text-primary dark:text-blue-400";
    } else if (score >= 40) {
      feedback = "Low Match";
      strokeColor = "#f59e0b";
      feedbackClass = "text-amber-500";
    }

    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-8 optimizer-loaded-state">
        {/* Score & Job Title header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-100" id="opt-job-title">
              ATS Keywords & JD Match
            </h3>
            <p className="text-xs text-outline mt-1">Section-by-section optimizations to beat the screening bots</p>
          </div>

          {/* Score gauge circle */}
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 p-3 rounded-2xl shrink-0 shadow-sm">
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
              <span className="absolute text-base font-extrabold text-on-surface dark:text-slate-100">
                {score}%
              </span>
            </div>
            <div>
              <span className="block text-xs font-bold text-outline uppercase tracking-wider">ATS Match Score</span>
              <span className={`text-sm font-bold ${feedbackClass}`}>{feedback}</span>
            </div>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Professional Summary match text */}
        <div className="p-6 bg-gradient-to-r from-primary/5 to-slate-50 dark:to-slate-850/30 border border-primary/10 dark:border-primary/20 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-primary dark:text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">summarize</span>
            Alignment Summary
          </h4>
          <p className="text-sm text-on-surface/90 dark:text-slate-250 leading-relaxed">
            {resumeOptimization.summary}
          </p>
        </div>

        {/* Missing skills tags */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-outline">report</span>
            Identified Gaps / Missing Keywords
          </h4>
          <div className="flex flex-wrap gap-2">
            {(resumeOptimization.missing_skills || []).map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-semibold rounded-full flex items-center gap-1 hover:bg-rose-100 dark:hover:bg-rose-950/45 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">remove_circle</span>
                <span>{skill}</span>
              </span>
            ))}
            {(!resumeOptimization.missing_skills || !resumeOptimization.missing_skills.length) && (
              <span className="text-xs text-emerald-600 dark:text-emerald-450 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                No critical skill gaps identified! Your resume matches the job description keywords.
              </span>
            )}
          </div>
        </div>

        {/* Modifications Comparative Table */}
        <div className="border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm overflow-hidden">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide px-6 py-4 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-outline">edit_attributes</span>
            Recommended Section Updates
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-outline uppercase tracking-wider bg-slate-50/25 dark:bg-slate-850/10">
                  <th className="p-4 w-1/5">Section</th>
                  <th className="p-4 w-2/5">Original Text</th>
                  <th className="p-4 w-2/5">Suggested Tailoring</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 opt-modifications-table">
                {(resumeOptimization.modifications || []).map((mod, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 align-top font-bold text-on-surface dark:text-slate-150 text-xs md:text-sm font-headline-md">
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-outline dark:text-slate-400">
                        {mod.section}
                      </span>
                    </td>
                    <td className="p-4 align-top text-xs md:text-sm text-outline font-medium">
                      <div className="p-3 bg-red-50/30 dark:bg-red-950/20 border border-red-100/50 dark:border-red-900/30 rounded-xl flex items-start gap-2">
                        <span className="material-symbols-outlined text-red-500 text-[18px] shrink-0 mt-0.5">
                          remove_circle
                        </span>
                        <p className="italic leading-relaxed">{mod.original || "N/A"}</p>
                      </div>
                    </td>
                    <td className="p-4 align-top text-xs md:text-sm text-on-surface dark:text-slate-200 font-semibold">
                      <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-100/50 dark:border-emerald-900/30 rounded-xl space-y-2">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-500 text-[18px] shrink-0 mt-0.5">
                            add_circle
                          </span>
                          <p className="text-emerald-950 dark:text-emerald-400 font-bold leading-relaxed">
                            {mod.suggested}
                          </p>
                        </div>
                        <div className="border-t border-emerald-100/30 dark:border-emerald-900/20 pt-2 flex items-start gap-1.5 text-[11px] text-emerald-800 dark:text-emerald-500 font-medium leading-relaxed">
                          <span className="material-symbols-outlined text-[14px] mt-0.5">help</span>
                          <span>{mod.reason}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!resumeOptimization.modifications || !resumeOptimization.modifications.length) && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-xs text-outline italic">
                      No modification suggestions listed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tailored Bullet points list */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary">content_copy</span>
            Tailored Accomplishment Bullets
          </h4>
          <p className="text-xs text-outline mb-4">
            Copy these resume-ready accomplishment points. Use them to replace dry bullet points under your project/job sections.
          </p>
          <ul className="space-y-4">
            {(resumeOptimization.tailored_bullets || []).map((bullet, idx) => (
              <li
                key={idx}
                className="p-4 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-850 rounded-xl transition-all flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-2 flex-1">
                  <span className="material-symbols-outlined text-emerald-600 shrink-0 text-[18px] mt-0.5">
                    check_circle
                  </span>
                  <span className="text-xs md:text-sm text-on-surface dark:text-slate-200 font-semibold leading-relaxed">
                    {bullet}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(bullet, idx)}
                  type="button"
                  className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 shadow-sm focus:opacity-100 active:scale-95 ${
                    copiedIndex === idx
                      ? "text-emerald-600 border-emerald-250 bg-emerald-50 dark:bg-emerald-950/20"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-outline dark:text-slate-400 hover:text-primary hover:border-primary/30"
                  }`}
                  title="Copy to clipboard"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copiedIndex === idx ? "check" : "content_copy"}
                  </span>
                </button>
              </li>
            ))}
            {(!resumeOptimization.tailored_bullets || !resumeOptimization.tailored_bullets.length) && (
              <li className="text-xs text-outline italic">No bullet points generated.</li>
            )}
          </ul>
        </div>

        {/* Optimization Checklist */}
        <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
          <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary">fact_check</span>
            JD Matching Checklist
          </h4>
          <p className="text-xs text-outline mb-4">Step-by-step checklist to finalize your application updates.</p>
          <div className="space-y-3">
            {(resumeOptimization.checklist || []).map((item, idx) => {
              const isChecked = !!checkedTasks[idx];
              return (
                <div
                  key={idx}
                  onClick={() => toggleTask(idx)}
                  className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl hover:bg-slate-100/75 dark:hover:bg-slate-800/70 transition-all cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // Swallowed: div click toggles
                    className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 mt-0.5 cursor-pointer"
                  />
                  <span
                    className={`text-sm text-on-surface/85 dark:text-slate-350 flex-1 select-none ${
                      isChecked ? "line-through text-outline dark:text-slate-500" : ""
                    }`}
                  >
                    {item.task}
                  </span>
                </div>
              );
            })}
            {(!resumeOptimization.checklist || !resumeOptimization.checklist.length) && (
              <p className="text-xs text-outline italic">No actions in the checklist.</p>
            )}
          </div>
        </div>

        {/* Reset optimizer */}
        <div className="flex items-center justify-end pt-4">
          <button
            onClick={handleReset}
            type="button"
            className="px-5 py-2.5 border border-red-200 hover:border-red-300 bg-red-50/20 dark:bg-red-950/20 text-red-700 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/40 rounded-xl font-semibold text-sm transition-all active:scale-95 shadow-sm"
          >
            Optimize Another Job Description
          </button>
        </div>
      </div>
    );
  }

  // Setup/Configuration State
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" id="optimizer-setup-state">
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/5">
            <span className="material-symbols-outlined text-[28px]">tune</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-100 font-headline-lg">Resume Optimizer</h3>
            <p className="text-xs text-outline">Tailor your accomplishments to match specific job description keywords</p>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        <div className="space-y-6">
          {/* Step 1: loaded resume check */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-outline flex items-center justify-center font-bold text-xs">
                1
              </span>
              Verify Loaded Resume
            </h4>
            {resumeContext ? (
              <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between">
                <span className="text-sm text-on-surface dark:text-slate-200 font-semibold truncate flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">description</span>
                  {resumeContext.filename}
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-450 uppercase tracking-wide">
                  Loaded
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-red-200 bg-red-50/10 flex items-center justify-between">
                <span className="text-sm text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined">warning</span>
                  No resume loaded in profile
                </span>
                <button
                  onClick={() => setCurrentTab("dashboard")}
                  className="px-3 py-1.5 bg-red-650 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95"
                >
                  Upload Resume
                </button>
              </div>
            )}
          </div>

          {/* Step 2: load JD details */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-outline flex items-center justify-center font-bold text-xs">
                2
              </span>
              Provide Target Job Description (JD)
            </h4>
            <p className="text-xs text-outline leading-relaxed">
              Paste the job post description or upload a JD PDF below. We will scan for keywords.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Paste JD Text */}
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                disabled={isUploadingJd || !!jdPdf}
                rows={5}
                placeholder="Paste Job Description requirements, qualifications, and skill list here..."
                className="w-full rounded-xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800/40 text-on-surface dark:text-slate-100 resize-none disabled:opacity-50"
              />

              {/* Upload JD PDF */}
              <div
                onClick={handleUploadClick}
                className="flex flex-col justify-between p-4 rounded-xl border border-dashed border-outline-variant/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all text-center relative cursor-pointer group"
              >
                <input
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="application/pdf,.pdf"
                  className="hidden"
                  type="file"
                />

                <div className="my-auto py-2">
                  <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-[32px] block mb-1">
                    upload_file
                  </span>
                  <span className="block font-semibold text-on-surface dark:text-slate-350 text-xs" id="optimizer-jd-label">
                    Upload PDF Job Description
                  </span>
                  <span className="text-[10px] text-outline">PDF must be 5MB or smaller</span>
                </div>

                {/* Loading state indicator */}
                {isUploadingJd && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 rounded-xl flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary animate-spin text-[20px]">sync</span>
                      <span className="text-xs font-semibold text-primary">Extracting text...</span>
                    </div>
                  </div>
                )}

                {/* PDF Loaded indicator overlay */}
                {jdPdf && (
                  <div className="absolute inset-0 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl flex flex-col justify-center p-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-primary uppercase tracking-wide">JD PDF Loaded</p>
                        <p className="text-xs font-semibold text-on-surface dark:text-slate-200 truncate" id="optimizer-jd-filename">
                          {jdPdf.filename}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeJdPdf();
                        }}
                        className="shrink-0 text-outline hover:text-red-600 transition-colors"
                        title="Remove JD"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trigger button */}
          <button
            onClick={handleOptimize}
            disabled={!resumeContext || (!jdText.trim() && !jdPdf) || isOptimizing}
            className="w-full py-4 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
            Scan & Optimize Resume
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResumeOptimizerView;

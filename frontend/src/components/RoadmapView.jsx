import React, { useState } from "react";
import { parseJsonResponse } from "../utils";

function RoadmapView({ setHistory, setCurrentTab }) {
  const [roleInput, setRoleInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [roadmapData, setRoadmapData] = useState(null); // { roadmap: { role, summary, phases: [] }, image: "base64" }
  const [error, setError] = useState("");
  const [expandedPhases, setExpandedPhases] = useState({});

  const presets = [
    { name: "Frontend Developer", icon: "html" },
    { name: "Backend Developer", icon: "dns" },
    { name: "Fullstack Developer", icon: "layers" },
    { name: "Data Scientist", icon: "query_stats" },
    { name: "DevOps Engineer", icon: "terminal" },
    { name: "Mobile App Developer", icon: "smartphone" },
  ];

  const handleGenerate = async (roleName) => {
    const targetRole = roleName.trim();
    if (!targetRole) return;

    setIsLoading(true);
    setError("");
    setRoadmapData(null);
    setExpandedPhases({});

    try {
      const response = await fetch("/api/generate-roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Failed to generate roadmap");

      setRoadmapData(data);
      // Auto-expand the first phase
      setExpandedPhases({ 0: true });
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleGenerate(roleInput);
  };

  const togglePhase = (idx) => {
    setExpandedPhases((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleDiscussPhase = (phase, role) => {
    const prompt = `Let's discuss Phase ${phase.phase_number}: "${phase.title}" from the ${role} preparation roadmap. I want to build a deep understanding of these topics: ${phase.topics.join(", ")}. Can you guide me through this phase step by step?`;
    setCurrentTab("chat");
    setHistory((prev) => [
      ...prev,
      { role: "user", content: prompt },
    ]);
  };

  const downloadSvg = () => {
    if (!roadmapData || !roadmapData.image) return;
    const link = document.createElement("a");
    link.href = roadmapData.image;
    link.download = `${roadmapData.roadmap.role.toLowerCase().replace(/\s+/g, "_")}_roadmap.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPng = () => {
    if (!roadmapData || !roadmapData.image) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 1200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          const pngUrl = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = `${roadmapData.roadmap.role.toLowerCase().replace(/\s+/g, "_")}_roadmap.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          console.error("Canvas export failed:", err);
          alert("Could not export PNG due to browser security settings. Please download as SVG instead.");
        }
      }
    };
    img.src = roadmapData.image;
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" id="roadmap-view-container">
      {/* View Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/5">
          <span className="material-symbols-outlined text-[28px]">route</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-on-surface dark:text-slate-100 font-headline-lg">
            Career Preparation Roadmap
          </h3>
          <p className="text-xs text-outline">
            Generate clean, visual study paths tailored to your placement and career targets
          </p>
        </div>
      </div>

      <hr className="border-slate-100 dark:border-slate-800" />

      {/* Input panel & Presets */}
      <div className="bg-slate-50/50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined text-outline absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              placeholder="e.g. SDE Intern, Backend Engineer, Data Analyst, Cloud Architect..."
              required
              disabled={isLoading}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm bg-white dark:bg-slate-900 text-on-surface dark:text-slate-100 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !roleInput.trim()}
            className="px-6 py-3.5 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/10 active:scale-[0.98] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">insights</span>
            )}
            Generate Roadmap
          </button>
        </form>

        {/* Presets Grid */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-outline dark:text-slate-400 uppercase tracking-wide">
            Popular Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setRoleInput(preset.name);
                  handleGenerate(preset.name);
                }}
                disabled={isLoading}
                type="button"
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-primary/55 dark:hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 text-xs font-bold text-on-surface/90 dark:text-slate-250 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px] text-primary">{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm font-semibold flex items-center gap-2 animate-fadeIn">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading animation state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4" id="roadmap-loading-state">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[28px]">route</span>
            </div>
          </div>
          <div className="text-center space-y-1">
            <h4 className="font-bold text-sm text-on-surface dark:text-slate-200 animate-pulse">
              Architecting Your Career Journey...
            </h4>
            <p className="text-xs text-outline max-w-xs leading-relaxed">
              Analyzing requirements, structuring prep milestones, and assembling your high-fidelity study roadmap.
            </p>
          </div>
        </div>
      )}

      {/* Generated Roadmap Display */}
      {roadmapData && (
        <div className="space-y-8 animate-fadeIn" id="roadmap-results-state">
          {/* Main Visual Image Block */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wider">
                Visual Roadmap Image
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={downloadPng}
                  type="button"
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-on-surface dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">download</span>
                  Download PNG
                </button>
                <button
                  onClick={downloadSvg}
                  type="button"
                  className="px-4 py-2 border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 text-on-surface dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-[16px] text-primary">image</span>
                  Download SVG
                </button>
              </div>
            </div>

            {/* Rendered SVG source as standard <img> */}
            <div className="bg-slate-950 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md flex justify-center overflow-x-auto">
              <img
                src={roadmapData.image}
                alt={`${roadmapData.roadmap.role} Study Roadmap`}
                className="max-w-full h-auto rounded-xl object-contain"
                style={{ minWidth: "650px", maxWidth: "800px" }}
              />
            </div>
            <p className="text-[10px] text-outline text-center">
              * The roadmap scales infinitely. Right click the image to copy or save locally, or use the download buttons.
            </p>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Interactive Breakdown */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wider">
                Detailed Learning Phases
              </h4>
              <p className="text-xs text-outline mt-0.5">
                {roadmapData.roadmap.summary}
              </p>
            </div>

            <div className="space-y-3">
              {roadmapData.roadmap.phases.map((phase, idx) => {
                const isExpanded = !!expandedPhases[idx];
                return (
                  <div
                    key={idx}
                    className="border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 rounded-xl shadow-sm overflow-hidden"
                  >
                    {/* Header */}
                    <button
                      onClick={() => togglePhase(idx)}
                      type="button"
                      className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {idx + 1}
                        </span>
                        <div>
                          <h5 className="text-sm font-bold text-on-surface dark:text-slate-100">
                            {phase.title}
                          </h5>
                          <span className="text-xs font-semibold text-primary/80">
                            Duration: {phase.duration}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`material-symbols-outlined text-outline transform transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Expandable content */}
                    {isExpanded && (
                      <div className="px-5 pb-5 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4 bg-slate-50/20 dark:bg-slate-900/10">
                        <p className="text-xs text-on-surface/85 dark:text-slate-300 leading-relaxed font-medium">
                          {phase.description}
                        </p>

                        {/* Topics list */}
                        <div className="space-y-2">
                          <p className="text-[11px] font-bold text-primary uppercase tracking-wide">
                            Key Core Topics
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {phase.topics.map((topic, topicIdx) => (
                              <div
                                key={topicIdx}
                                className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800/80 bg-white dark:bg-slate-900 text-xs font-medium text-on-surface/80 dark:text-slate-200"
                              >
                                <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-[10px] font-bold">check</span>
                                </span>
                                <span>{topic}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Skills and Interaction */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                          <div className="flex flex-wrap gap-1.5">
                            {phase.skills.map((skill, skillIdx) => (
                              <span
                                key={skillIdx}
                                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-outline dark:text-slate-350 text-[10px] font-bold"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>

                          <button
                            onClick={() => handleDiscussPhase(phase, roadmapData.roadmap.role)}
                            type="button"
                            className="px-4 py-2 border border-primary/20 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary dark:text-slate-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 self-end sm:self-auto transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[16px]">forum</span>
                            Discuss in Chat
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RoadmapView;

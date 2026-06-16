import React, { useState } from "react";

function CompanyHubView({ setCurrentTab, setHistory }) {
  const [selectedCompany, setSelectedCompany] = useState(null);

  const companyHubData = {
    Amazon: {
      domain: "amazon.com",
      difficulty: "Hard",
      focus: "DSA & Leadership",
      package: "15 - 45 LPA",
      stages: [
        { name: "Online Assessment (OA)", desc: "2 Coding Questions (Medium-Hard) + Work Style Assessment (Leadership Principles)." },
        { name: "Technical Interview Rounds", desc: "2-3 Rounds focusing heavily on Data Structures, Algorithms, System Design, and Amazon Leadership Principles." },
        { name: "Bar Raiser Round", desc: "A final round focusing on cultural fit, problem solving depth, and core behaviors." }
      ],
      aptitudeTopic: "Amazon Online Assessment DSA, Coding Patterns, Probability",
      mockRole: "Software Engineer",
      mockCompany: "Amazon"
    },
    Google: {
      domain: "google.com",
      difficulty: "Hard",
      focus: "DSA & Googlyness",
      package: "20 - 55 LPA",
      stages: [
        { name: "Technical Phone Screen", desc: "1 Coding Question (Medium-Hard) in 45 minutes targeting arrays, trees, or graphs." },
        { name: "Onsite Technical Rounds", desc: "3-4 Rounds focusing on coding style, time/space efficiency, algorithms, and logical correctness." },
        { name: "Googleyness Round", desc: "Situational & behavioral round assessing leadership, diversity, and team communication." }
      ],
      aptitudeTopic: "Google Tech Screen DSA, Graphs, Dynamic Programming",
      mockRole: "Software Engineer",
      mockCompany: "Google"
    },
    TCS: {
      domain: "tcs.com",
      difficulty: "Easy-Medium",
      focus: "Quants & Basic Coding",
      package: "3.6 - 7.5 LPA",
      stages: [
        { name: "TCS NQT Assessment", desc: "Quantitative Aptitude, Logical Reasoning, Verbal Ability, and 2 Basic Coding Questions." },
        { name: "Technical Interview", desc: "Core concepts of DBMS, OOPs, OS, and questions on your resume projects." },
        { name: "HR & MR Round", desc: "Basic situational checks, location preference, and communication evaluation." }
      ],
      aptitudeTopic: "TCS NQT Quantitative Aptitude and Logical Reasoning",
      mockRole: "System Engineer",
      mockCompany: "TCS"
    },
    Infosys: {
      domain: "infosys.com",
      difficulty: "Easy-Medium",
      focus: "Reasoning & DBMS",
      package: "3.6 - 6.2 LPA",
      stages: [
        { name: "Infosys Online Test", desc: "Mathematical Ability, Reasoning Ability, Verbal Ability, and Pseudocode Testing." },
        { name: "Technical Interview", desc: "Resume review, project walk-through, programming language basics (Java/Python), and SQL queries." },
        { name: "HR Interview", desc: "Basic behavioral checks, career goals, and flexibility questions." }
      ],
      aptitudeTopic: "Infosys Aptitude Test Mathematical and Logical Ability",
      mockRole: "Systems Engineer",
      mockCompany: "Infosys"
    },
    Wipro: {
      domain: "wipro.com",
      difficulty: "Easy-Medium",
      focus: "Aptitude & OOPs",
      package: "3.5 - 6.5 LPA",
      stages: [
        { name: "Wipro Elite National Talent Hunt", desc: "Aptitude Test (Quantitative, Logical, Verbal), Written English Test, and 2 Coding Questions." },
        { name: "Technical Interview", desc: "Conceptual coding questions, database queries, and explaining resume projects." },
        { name: "HR Interview", desc: "Introduction, communication checks, shift flexibility, and background verification." }
      ],
      aptitudeTopic: "Wipro Elite NLTH Aptitude and Basic Ratios, Series",
      mockRole: "Project Engineer",
      mockCompany: "Wipro"
    },
    Deloitte: {
      domain: "deloitte.com",
      difficulty: "Medium",
      focus: "Verbal & Case Study",
      package: "4.5 - 9.0 LPA",
      stages: [
        { name: "Aptitude & Cognitive Test", desc: "Numerical reasoning, verbal reasoning, and abstract reasoning questions." },
        { name: "Group Discussion or Case Study", desc: "Solving business situations or debating current tech trends with a team." },
        { name: "Technical & HR Interview", desc: "Targeting project challenges, SQL, Excel, and general consultancy behaviors." }
      ],
      aptitudeTopic: "Deloitte Quantitative and Verbal Aptitude",
      mockRole: "Technology Analyst",
      mockCompany: "Deloitte"
    }
  };

  const handleStartQuiz = (companyName, data) => {
    setCurrentTab("quiz");
    // Pre-fill quiz settings by sending synthetic events or we can let quiz handle it
    // Wait, let's save to localStorage so AptitudeQuizView can load them on mount!
    // That is an elegant, bulletproof state synchronization strategy!
    localStorage.setItem("company_quiz_preload", JSON.stringify({
      topic: data.aptitudeTopic,
      questionCount: 5,
      timerLimit: 60,
      material: `Syllabus guide for ${companyName}: Focus on logical flow and quick math.`
    }));
  };

  const handleStartMock = (companyName, data) => {
    setCurrentTab("mock-interview");
    localStorage.setItem("company_mock_preload", JSON.stringify({
      interviewType: "Technical",
      role: data.mockRole,
      company: data.mockCompany,
      length: 5
    }));
  };

  const handleRequestRoadmap = (companyName) => {
    setCurrentTab("chat");
    setHistory((prev) => [
      ...prev,
      {
        role: "user",
        content: `I want to prepare for the recruitment rounds at ${companyName}. Please generate a customized study schedule and placement preparation roadmap for me.`,
      },
    ]);
  };

  // 1. Detailed Company Panel
  if (selectedCompany) {
    const data = companyHubData[selectedCompany];
    const isHard = data.difficulty === "Hard";

    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6" id="company-detail-panel">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setSelectedCompany(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-outline hover:text-on-surface dark:hover:text-slate-150 transition-colors uppercase"
            id="company-close-detail"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Hub
          </button>
          <span className="text-[10px] font-bold text-outline dark:text-slate-400 uppercase tracking-widest">
            Recruiter Details
          </span>
        </div>

        {/* Company Overview Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 py-2">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-150/80 dark:border-slate-800 flex items-center justify-center shadow-sm shrink-0 overflow-hidden p-2">
              <img
                src={`https://logos.hunter.io/${data.domain}`}
                alt={`${selectedCompany} logo`}
                className="w-full h-full object-contain filter dark:brightness-95"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
            <div>
              <h3 className="text-xl font-bold text-on-surface dark:text-slate-100 font-headline-md" id="company-detail-title">
                {selectedCompany} Selection Process
              </h3>
              <p className="text-xs text-outline dark:text-slate-400 mt-1">Official interview flows and parameters</p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap gap-3 select-none">
            <div className="px-4 py-2 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center min-w-[100px] shadow-sm">
              <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Difficulty</span>
              <strong className={`text-base font-bold ${isHard ? "text-red-650" : "text-emerald-600"}`} id="company-meta-difficulty">
                {data.difficulty}
              </strong>
            </div>
            <div className="px-4 py-2 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl text-center min-w-[100px] shadow-sm">
              <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">CTC Package</span>
              <strong className="text-sm text-on-surface dark:text-slate-200 font-bold block mt-0.5" id="company-meta-package">
                {data.package}
              </strong>
            </div>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Process Stages List */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 space-y-4">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <span className="material-symbols-outlined text-outline">lan</span>
              Recruitment Stages
            </h4>
            <div className="space-y-3" id="company-stages-container">
              {data.stages.map((stage, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/80"
                >
                  <span className="w-7 h-7 bg-primary text-white text-xs font-bold rounded-lg flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <strong className="text-sm text-on-surface dark:text-slate-100 block mb-0.5">{stage.name}</strong>
                    <p className="text-xs text-outline dark:text-slate-400 leading-relaxed">{stage.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quickstart presets */}
          <div className="md:col-span-5 space-y-4">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
              <span className="material-symbols-outlined text-outline">rocket_launch</span>
              Quick Action Roadmaps
            </h4>
            <div className="p-5 border border-slate-150/80 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 space-y-3.5 shadow-sm">
              <p className="text-xs text-outline leading-relaxed mb-4">
                Launch personalized practice modes loaded with {selectedCompany}'s syllabus details and parameters.
              </p>
              <button
                onClick={() => handleStartQuiz(selectedCompany, data)}
                className="w-full py-3 bg-slate-50 dark:bg-slate-850 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 border border-slate-200 dark:border-slate-800 hover:border-primary/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                id="company-action-quiz"
              >
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                Take Targeted Aptitude Test
              </button>
              <button
                onClick={() => handleStartMock(selectedCompany, data)}
                className="w-full py-3 bg-slate-50 dark:bg-slate-850 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/10 border border-slate-200 dark:border-slate-800 hover:border-primary/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                id="company-action-mock"
              >
                <span className="material-symbols-outlined text-[18px]">record_voice_over</span>
                Practice {selectedCompany} Mock Interview
              </button>
              <button
                onClick={() => handleRequestRoadmap(selectedCompany)}
                className="w-full py-3 bg-primary text-white hover:bg-primary/95 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/25"
                id="company-action-roadmap"
              >
                <span className="material-symbols-outlined text-[18px]">map</span>
                Request Custom Prep Schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Default Company Cards Grid
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" id="company-hub-grid">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/5">
          <span className="material-symbols-outlined text-[28px]">business</span>
        </div>
        <div>
          <h3 className="text-xl font-bold text-on-surface dark:text-slate-105 font-headline-lg">Company Placement Hub</h3>
          <p className="text-xs text-outline">Target-specific interview rounds, CTC guides, and selection processes</p>
        </div>
      </div>

      <hr className="border-slate-100 dark:border-slate-800" />

      {/* Cards list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(companyHubData).map(([name, data]) => {
          const isHard = data.difficulty === "Hard";
          return (
            <button
              key={name}
              onClick={() => setSelectedCompany(name)}
              className="company-card group text-left p-5 bg-white dark:bg-slate-900 border border-slate-150/80 dark:border-slate-800/80 hover:border-primary/40 hover:ring-4 hover:ring-primary/5 dark:hover:ring-primary/5 hover:-translate-y-0.5 rounded-2xl transition-all shadow-sm flex flex-col gap-4"
            >
              <div className="flex items-start justify-between gap-3 w-full">
                <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-150/50 dark:border-slate-850 flex items-center justify-center p-2 shrink-0 overflow-hidden select-none">
                  <img
                    src={`https://logos.hunter.io/${data.domain}`}
                    alt={`${name} logo`}
                    className="w-full h-full object-contain filter dark:brightness-95"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                    isHard
                      ? "bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400"
                      : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450"
                  }`}
                >
                  {data.difficulty}
                </span>
              </div>

              <div>
                <h4 className="text-base font-extrabold text-on-surface dark:text-slate-100 group-hover:text-primary transition-colors">
                  {name}
                </h4>
                <p className="text-xs text-outline dark:text-slate-400 font-medium mt-1 leading-relaxed">
                  Focus: <strong className="text-on-surface dark:text-slate-350">{data.focus}</strong>
                </p>
              </div>

              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs w-full select-none">
                <span className="font-semibold text-outline">CTC Package:</span>
                <span className="font-extrabold text-primary dark:text-blue-400">{data.package}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CompanyHubView;

import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ChatView from "./components/ChatView";
import KnowledgeBaseView from "./components/KnowledgeBaseView";
import DashboardView from "./components/DashboardView";
import AptitudeQuizView from "./components/AptitudeQuizView";
import ResumeOptimizerView from "./components/ResumeOptimizerView";
import DSAPlaygroundView from "./components/DSAPlaygroundView";
import MockInterviewView from "./components/MockInterviewView";
import CompanyHubView from "./components/CompanyHubView";
import RoadmapView from "./components/RoadmapView";
import { parseJsonResponse } from "./utils";

function App() {
  const [currentTab, setCurrentTab] = useState("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem("theme");
    return stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  const [resumeContext, setResumeContext] = useState(() => {
    try {
      const saved = localStorage.getItem("resume_analysis");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.filename && parsed?.text) {
          return { filename: parsed.filename, text: parsed.text };
        }
      }
    } catch (e) {
      console.warn("Failed to load saved resume state", e);
    }
    return null;
  });

  const [resumeAnalysis, setResumeAnalysis] = useState(() => {
    try {
      const saved = localStorage.getItem("resume_analysis");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.analysis) {
          return parsed.analysis;
        }
      }
    } catch (e) {}
    return null;
  });

  const [resumeOptimization, setResumeOptimization] = useState(null);

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("chat_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Failed to load chat history from localStorage", e);
    }
    return [
      {
        role: "assistant",
        content: "Hi! I am PlacementPal, your friendly neighborhood placement advisor. Upload your resume or ask me any question to get started!"
      }
    ];
  });

  const [isPending, setIsPending] = useState(false);

  // Sync chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("chat_history", JSON.stringify(history));
    } catch (e) {
      console.warn("Failed to save chat history to localStorage", e);
    }
  }, [history]);

  // Sync dark mode class on html tag
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Load optimized resume from localStorage when resumeContext changes
  useEffect(() => {
    if (resumeContext) {
      try {
        const savedOpt = localStorage.getItem(`resume_opt_${resumeContext.filename}`);
        if (savedOpt) {
          const parsedOpt = JSON.parse(savedOpt);
          setResumeOptimization(parsedOpt?.optimization || null);
        } else {
          setResumeOptimization(null);
        }
      } catch (e) {
        setResumeOptimization(null);
      }
    } else {
      setResumeOptimization(null);
    }
  }, [resumeContext]);

  const fetchResumeAnalysis = async (resumeText, filename) => {
    setResumeAnalysis(null);
    try {
      const response = await fetch("/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resumeText })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      setResumeAnalysis(data.analysis);
      localStorage.setItem("resume_analysis", JSON.stringify({
        filename,
        text: resumeText,
        analysis: data.analysis
      }));
    } catch (error) {
      alert(`Error analyzing resume: ${error.message}`);
    }
  };

  const sendMessage = async (text) => {
    const clean = text.trim();
    if (!clean) return;

    const userMsg = { role: "user", content: clean };
    setHistory((prev) => [...prev, userMsg]);
    setIsPending(true);
    setCurrentTab("chat");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, userMsg],
          resume: resumeContext?.text || null
        })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Request failed");
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, sources: data.sources }
      ]);
    } catch (error) {
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: `I could not generate a response: ${error.message}` }
      ]);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="bg-background text-on-background font-body-lg overflow-hidden flex h-screen w-screen dark:bg-slate-950">
      {/* Sidebar component */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        resumeContext={resumeContext}
        setResumeContext={setResumeContext}
        resumeAnalysis={resumeAnalysis}
        setResumeAnalysis={setResumeAnalysis}
        setResumeOptimization={setResumeOptimization}
        history={history}
        setHistory={setHistory}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        fetchResumeAnalysis={fetchResumeAnalysis}
        sendMessage={sendMessage}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        <Header
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          setHistory={setHistory}
          initialAssistantMsg={history[0]}
        />

        <main className="flex-1 overflow-hidden p-4 lg:p-6 bg-slate-50/50 dark:bg-slate-950">
          <div className="h-full flex flex-col max-w-5xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-outline-variant/40 dark:border-slate-800 overflow-hidden">
            {currentTab === "chat" && (
              <ChatView
                history={history}
                setHistory={setHistory}
                resumeContext={resumeContext}
                setResumeContext={setResumeContext}
                setResumeAnalysis={setResumeAnalysis}
                setCurrentTab={setCurrentTab}
                sendMessage={sendMessage}
                isPending={isPending}
                fetchResumeAnalysis={fetchResumeAnalysis}
              />
            )}
            {currentTab === "knowledge-base" && (
              <KnowledgeBaseView />
            )}
            {currentTab === "dashboard" && (
              <DashboardView
                resumeContext={resumeContext}
                setResumeContext={setResumeContext}
                resumeAnalysis={resumeAnalysis}
                setResumeAnalysis={setResumeAnalysis}
                setResumeOptimization={setResumeOptimization}
                setHistory={setHistory}
                setCurrentTab={setCurrentTab}
              />
            )}
            {currentTab === "roadmap" && (
              <RoadmapView
                setHistory={setHistory}
                setCurrentTab={setCurrentTab}
              />
            )}
            {currentTab === "quiz" && (
              <AptitudeQuizView
                setHistory={setHistory}
                setCurrentTab={setCurrentTab}
              />
            )}
            {currentTab === "optimizer" && (
              <ResumeOptimizerView
                resumeContext={resumeContext}
                resumeOptimization={resumeOptimization}
                setResumeOptimization={setResumeOptimization}
              />
            )}
            {currentTab === "dsa-workspace" && (
              <DSAPlaygroundView />
            )}
            {currentTab === "mock-interview" && (
              <MockInterviewView
                resumeContext={resumeContext}
                setHistory={setHistory}
                setCurrentTab={setCurrentTab}
              />
            )}
            {currentTab === "company-hub" && (
              <CompanyHubView
                setCurrentTab={setCurrentTab}
                setHistory={setHistory}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

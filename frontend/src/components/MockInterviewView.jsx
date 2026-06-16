import React, { useRef, useState, useEffect } from "react";
import { parseJsonResponse } from "../utils";

function MockInterviewView({ resumeContext, setHistory, setCurrentTab }) {
  const recognitionRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Setup states
  const [interviewType, setInterviewType] = useState("Technical");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [length, setLength] = useState(5);

  // Active run states
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [qaPairs, setQaPairs] = useState([]); // Array of { question, answer }
  const [conversation, setConversation] = useState([]); // List of { role: "assistant"|"user", content }
  const [isInterviewActive, setIsInterviewActive] = useState(false);

  // Scorecard evaluation report
  const [evalReport, setEvalReport] = useState(null);

  // Preload configurations from Company Placement Hub
  useEffect(() => {
    try {
      const preloadStr = localStorage.getItem("company_mock_preload");
      if (preloadStr) {
        const preload = JSON.parse(preloadStr);
        if (preload.interviewType) setInterviewType(preload.interviewType);
        if (preload.role) setRole(preload.role);
        if (preload.company) setCompany(preload.company);
        if (preload.length) setLength(preload.length);
        localStorage.removeItem("company_mock_preload");
      }
    } catch (e) {
      console.warn("Failed to load mock interview preload", e);
    }
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setAnswerText((prev) => prev + (prev ? " " : "") + finalTranscript);
        }
      };

      rec.onerror = (e) => {
        console.error("Speech Recognition Error:", e.error);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported on this browser. Try Chrome or Safari.");
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      recognitionRef.current.start();
    }
  };

  // Start interview simulator
  const handleStartInterview = async (e) => {
    e.preventDefault();
    if (!role.trim() || !company.trim()) return;

    setIsLoading(true);
    setEvalReport(null);
    setQuestions([]);
    setCurrentIndex(0);
    setQaPairs([]);
    setAnswerText("");

    const initialConversation = [];
    setConversation(initialConversation);

    try {
      const q = await fetchQuestion(initialConversation);
      setQuestions([q]);
      setConversation([{ role: "assistant", content: q }]);
      setIsInterviewActive(true);
      speakText(q);
    } catch (err) {
      alert(`Failed to start interview: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch next question from server API
  const fetchQuestion = async (currConv) => {
    const response = await fetch("/api/generate-interview-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: interviewType,
        role: role.trim(),
        company: company.trim(),
        messages: currConv,
        resume: resumeContext?.text || null,
      }),
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Failed to generate question");
    return data.question.trim();
  };

  // Submit answer and load next or finalize evaluation
  const handleNext = async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    }

    const answer = answerText.trim();
    if (!answer) {
      alert("Please write or dictate your answer first.");
      return;
    }

    const currentQuestion = questions[currentIndex];
    const updatedPairs = [...qaPairs, { question: currentQuestion, answer }];
    setQaPairs(updatedPairs);

    const updatedConv = [
      ...conversation,
      { role: "user", content: answer }
    ];
    setConversation(updatedConv);

    const nextIndex = currentIndex + 1;
    if (nextIndex < length) {
      setIsLoading(true);
      try {
        const nextQ = await fetchQuestion(updatedConv);
        setQuestions((prev) => [...prev, nextQ]);
        setCurrentIndex(nextIndex);
        setConversation((prev) => [...prev, { role: "assistant", content: nextQ }]);
        setAnswerText("");
        speakText(nextQ);
      } catch (err) {
        alert(`Failed to load next question: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      await finalizeEvaluation(updatedPairs);
    }
  };

  // Evaluate final transcripts
  const finalizeEvaluation = async (pairs) => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsLoading(true);
    setIsInterviewActive(false);

    try {
      const response = await fetch("/api/evaluate-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: interviewType,
          role: role.trim(),
          company: company.trim(),
          qa_pairs: pairs,
          resume: resumeContext?.text || null,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Evaluation failed");

      setEvalReport(data.evaluation);
    } catch (err) {
      alert(`Evaluation failed: ${err.message}`);
      // return back to setup
      setQuestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuit = () => {
    if (confirm("Are you sure you want to quit this interview? All progress will be lost.")) {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setQuestions([]);
      setQaPairs([]);
      setConversation([]);
      setIsInterviewActive(false);
      setEvalReport(null);
    }
  };

  const handleDiscussInChat = () => {
    if (!evalReport) return;
    setCurrentTab("chat");
    setHistory((prev) => [
      ...prev,
      {
        role: "user",
        content: `I just finished a mock interview for "${role}" at "${company}" and got an overall score of ${evalReport.rating}%. Let's discuss the constructive feedback and practice some topics.`,
      },
    ]);
  };

  const handleRestart = () => {
    setQuestions([]);
    setQaPairs([]);
    setConversation([]);
    setIsInterviewActive(false);
    setEvalReport(null);
  };

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6" id="mock-loading-state">
        <div className="max-w-2xl mx-auto text-center py-16 space-y-4 animate-pulse">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-md">
            <span className="material-symbols-outlined text-[32px] animate-spin">sync</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface dark:text-slate-105">Loading Interview round...</h3>
          <p className="text-sm text-outline max-w-sm mx-auto leading-relaxed">
            Our AI interviewer is analyzing your target role, compiling behavioral questions, or scoring your replies.
          </p>
        </div>
      </div>
    );
  }

  // 2. Active run state
  if (isInterviewActive && questions.length > 0) {
    const currentQ = questions[currentIndex];
    const pct = ((currentIndex + 1) / length) * 100;
    const isVoiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    return (
      <div className="flex-1 flex flex-col overflow-hidden" id="mock-active-state">
        {/* Progress Header */}
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-bold text-primary uppercase tracking-wider" id="mock-category-label">
              {interviewType.toUpperCase()} ROUND | {company.toUpperCase()}
            </span>
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200" id="mock-question-counter">
              Question {currentIndex + 1} of {length}
            </h4>
          </div>
        </div>

        {/* Progress horizontal line bar */}
        <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 shrink-0">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
            id="mock-progress-bar"
          ></div>
        </div>

        {/* Dialog and answers */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Question bubble Card */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-150/80 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-base text-on-surface dark:text-slate-200 leading-relaxed font-semibold" id="mock-question-text">
                {currentQ}
              </p>
            </div>

            {/* Answer Field text area */}
            <div className="space-y-3">
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={
                  isRecording
                    ? "Listening... Speak clearly into your microphone."
                    : "Type your professional response here or click the mic button below to dictate your answer..."
                }
                rows={6}
                className="w-full rounded-2xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-4 bg-slate-50/50 dark:bg-slate-800/40 text-on-surface dark:text-slate-100 resize-none font-body-md"
                id="mock-answer-textarea"
              />

              <div className="flex items-center justify-between px-1">
                {isVoiceSupported ? (
                  <button
                    onClick={toggleRecording}
                    type="button"
                    className={`flex items-center gap-2 border px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm ${
                      isRecording
                        ? "bg-red-500 text-white border-red-650"
                        : "bg-white dark:bg-slate-850 text-outline border-slate-200 dark:border-slate-800 hover:text-red-500 hover:border-red-200"
                    }`}
                    id="mock-mic-btn"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${isRecording ? "animate-pulse" : ""}`} id="mock-mic-icon">
                      {isRecording ? "settings_voice" : "mic"}
                    </span>
                    <span id="mock-mic-text">{isRecording ? "Stop Dictating" : "Dictate Answer"}</span>
                  </button>
                ) : (
                  <div />
                )}
                <span className="text-xs text-outline font-mono" id="mock-char-counter">
                  {answerText.length} chars
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={handleQuit}
            type="button"
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-outline dark:text-slate-400 hover:text-red-650 hover:border-red-200 dark:hover:bg-red-950/25 rounded-xl text-sm font-semibold transition-all"
            id="mock-quit-btn"
          >
            Quit Interview
          </button>
          <button
            onClick={handleNext}
            disabled={!answerText.trim()}
            className="px-6 py-2.5 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 shadow-md shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            id="mock-next-btn"
          >
            {currentIndex === length - 1 ? "Finish & Evaluate" : "Next Question"}
          </button>
        </div>
      </div>
    );
  }

  // 3. Scorecard Report Panel
  if (evalReport) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-8" id="mock-report-state">
        <div className="max-w-2xl mx-auto space-y-8 py-4">
          {/* Main scorecard evaluation */}
          <div className="p-8 bg-gradient-to-br from-primary/5 via-slate-50 dark:via-slate-900/30 to-white dark:to-slate-950 border border-primary/10 dark:border-primary/20 rounded-2xl shadow-sm text-center flex flex-col items-center">
            <div
              className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-extrabold shadow-lg shadow-primary/20 mb-4"
              id="mock-eval-rating"
            >
              {evalReport.rating || 0}%
            </div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-100 font-headline-lg" id="mock-eval-headline">
              {evalReport.headline}
            </h3>
            <p className="text-sm text-outline mt-1.5 max-w-md leading-relaxed" id="mock-eval-summary">
              {evalReport.summary}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={handleRestart}
                type="button"
                className="px-5 py-2.5 bg-primary text-white font-semibold text-xs rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/10 active:scale-95 flex items-center gap-1.5"
                id="mock-restart-btn"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Restart Interview
              </button>
              <button
                onClick={handleDiscussInChat}
                type="button"
                className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-on-surface dark:text-slate-200 font-semibold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                id="mock-to-chat-btn"
              >
                <span className="material-symbols-outlined text-[16px]">forum</span>
                Discuss Score in Chat
              </button>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Core breakdown score panels */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl text-center shadow-sm">
              <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Technical</span>
              <strong className="text-lg text-primary font-bold block mt-1" id="mock-score-tech">
                {evalReport.score_tech || 0}/100
              </strong>
            </div>
            <div className="p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl text-center shadow-sm">
              <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Communication</span>
              <strong className="text-lg text-primary font-bold block mt-1" id="mock-score-comm">
                {evalReport.score_comm || 0}/100
              </strong>
            </div>
            <div className="p-4 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl text-center shadow-sm">
              <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Confidence</span>
              <strong className="text-lg text-primary font-bold block mt-1" id="mock-score-conf">
                {evalReport.score_conf || 0}/100
              </strong>
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-450 uppercase tracking-wide mb-4 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                Strengths
              </h4>
              <ul className="space-y-3" id="mock-eval-strengths">
                {(evalReport.strengths || []).map((str, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-on-surface dark:text-slate-350">
                    <span className="material-symbols-outlined text-emerald-500 shrink-0 text-[18px]">check</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm">
              <h4 className="text-xs font-bold text-amber-700 dark:text-amber-450 uppercase tracking-wide mb-4 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-amber-600">report_problem</span>
                Areas for Improvement
              </h4>
              <ul className="space-y-3" id="mock-eval-improvements">
                {(evalReport.improvements || []).map((imp, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-on-surface dark:text-slate-350">
                    <span className="material-symbols-outlined text-amber-500 shrink-0 text-[18px]">info</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Question breakdown list reviews */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wider mb-2">
              Question-by-Question Reviews
            </h4>
            <div className="space-y-4" id="mock-review-container">
              {(evalReport.reviews || []).map((rev, idx) => (
                <div
                  key={idx}
                  className="p-5 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h5 className="text-sm font-bold text-on-surface dark:text-slate-200 leading-relaxed flex-1">
                      <span className="text-primary mr-1 font-mono">Q{idx + 1}:</span> {rev.question}
                    </h5>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shrink-0 bg-primary/10 text-primary">
                      Score: {rev.rating || 0}/100
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-1 leading-relaxed border border-slate-100 dark:border-slate-800/60 text-on-surface dark:text-slate-300">
                    <strong>Your Response:</strong>
                    <p className="italic text-outline dark:text-slate-400 font-medium">{rev.answer}</p>
                  </div>

                  <div className="p-3 bg-emerald-50/20 dark:bg-emerald-950/20 rounded-xl text-xs space-y-1 leading-relaxed border border-emerald-150/20">
                    <strong className="text-emerald-950 dark:text-emerald-400">Ideal Answer Vibe:</strong>
                    <p className="text-emerald-950/80 dark:text-emerald-350 font-medium">{rev.ideal}</p>
                  </div>

                  <div className="text-xs font-medium text-on-surface/90 dark:text-slate-300 leading-relaxed flex items-start gap-1.5 pt-1">
                    <span className="material-symbols-outlined text-primary text-[16px] shrink-0 mt-0.5">help</span>
                    <span>
                      <strong>Interviewer Coach Feedback:</strong> {rev.feedback}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Default Setup View
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" id="mock-setup-state">
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/5">
            <span className="material-symbols-outlined text-[28px]">record_voice_over</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-105 font-headline-lg">
              AI Mock Interview Simulator
            </h3>
            <p className="text-xs text-outline">Simulate professional company-specific interview rounds with AI coaches</p>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        <form onSubmit={handleStartInterview} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="mock-type" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Round Category Type
            </label>
            <select
              id="mock-type"
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-850 dark:text-slate-100"
            >
              <option value="Technical">Technical Programming Round</option>
              <option value="HR">HR & Cultural Fit Round</option>
              <option value="Managerial">Managerial Situational Round</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mock-role" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Target Professional Job Role
            </label>
            <input
              type="text"
              id="mock-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Software Engineering Intern, Associate Consultant"
              required
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mock-company" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Target Recruiter Company
            </label>
            <input
              type="text"
              id="mock-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g., Google, Amazon, TCS, McKinsey"
              required
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mock-length" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Number of Interview Questions
            </label>
            <select
              id="mock-length"
              value={length}
              onChange={(e) => setLength(parseInt(e.target.value))}
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-850 dark:text-slate-100"
            >
              <option value="3">3 Questions (Speed Run)</option>
              <option value="5">5 Questions (Standard Practice)</option>
              <option value="10">10 Questions (Complete Round)</option>
            </select>
          </div>

          {/* Profile context check warning */}
          {resumeContext ? (
            <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-100/40 dark:border-emerald-900/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-450 leading-relaxed font-semibold flex items-center gap-2 select-none">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span>
                Personalized interview mode active: questions will target achievements from{" "}
                <strong>{resumeContext.filename}</strong>.
              </span>
            </div>
          ) : (
            <div className="p-3 bg-amber-50/30 dark:bg-amber-950/20 border border-amber-100/40 dark:border-amber-900/30 rounded-xl text-xs text-amber-800 dark:text-amber-500 leading-relaxed font-semibold flex items-center gap-2 select-none">
              <span className="material-symbols-outlined text-[18px]">info</span>
              <span>
                Generic interview mode: upload a PDF resume in sidebar to personalize interview questions to your achievements.
              </span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[20px]">record_voice_over</span>
            Start AI Mock Interview
          </button>
        </form>
      </div>
    </div>
  );
}

export default MockInterviewView;

import React, { useRef, useState, useEffect } from "react";
import { fileToBase64, parseJsonResponse, escapeHtml } from "../utils";

function AptitudeQuizView({ setHistory, setCurrentTab }) {
  const fileInputRef = useRef(null);
  const [isUploadingNotes, setIsUploadingNotes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [topic, setTopic] = useState("");
  const [notesText, setNotesText] = useState("");
  const [notesPdf, setNotesPdf] = useState(null); // { filename: string, text: string }
  const [questionCount, setQuestionCount] = useState(5);
  const [timerLimit, setTimerLimit] = useState(60);

  // Active quiz states
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionIndex]: "A" | "B" | "C" | "D" | "" }
  const [quizActive, setQuizActive] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);

  // Timer states
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);

  // Toggle explanations in reviews
  const [expandedExplanations, setExpandedExplanations] = useState({});

  // Clean timer on unmount
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  // Preload configurations from Company Placement Hub
  useEffect(() => {
    try {
      const preloadStr = localStorage.getItem("company_quiz_preload");
      if (preloadStr) {
        const preload = JSON.parse(preloadStr);
        if (preload.topic) setTopic(preload.topic);
        if (preload.questionCount) setQuestionCount(preload.questionCount);
        if (preload.timerLimit !== undefined) setTimerLimit(preload.timerLimit);
        if (preload.material) setNotesText(preload.material);
        localStorage.removeItem("company_quiz_preload");
      }
    } catch (e) {
      console.warn("Failed to load quiz preload", e);
    }
  }, []);

  // Timer countdown handler
  useEffect(() => {
    if (quizActive && timerLimit > 0 && !quizFinished) {
      setTimeLeft(timerLimit);
      clearInterval(timerRef.current);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            // Time out: record empty answer and proceed
            setAnswers((oldAnswers) => {
              const updated = { ...oldAnswers };
              if (updated[currentIndex] === undefined) {
                updated[currentIndex] = ""; // Timed out
              }
              return updated;
            });
            handleNextQuestion(true); // pass timeout flag
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerRef.current);
  }, [quizActive, currentIndex, timerLimit, quizFinished]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingNotes(true);

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

      setNotesPdf({ filename: data.filename, text: data.text });
      setNotesText(""); // clear textarea if PDF loaded
    } catch (err) {
      alert(`Failed to extract text from PDF: ${err.message}`);
      removeNotesPdf();
    } finally {
      setIsUploadingNotes(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeNotesPdf = () => {
    setNotesPdf(null);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsLoading(true);
    setQuizFinished(false);

    let combinedMaterial = notesText.trim();
    if (notesPdf) {
      combinedMaterial = `PDF Reference Material (${notesPdf.filename}):\n${notesPdf.text}\n\n${combinedMaterial}`;
    }

    try {
      const response = await fetch("/api/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          material: combinedMaterial || null,
          count: questionCount,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Failed to generate quiz");

      const list = data.quiz.questions || [];
      if (list.length === 0) {
        throw new Error("No questions were generated. Try a different topic.");
      }

      setQuestions(list);
      setCurrentIndex(0);
      setAnswers({});
      setQuizActive(true);
    } catch (err) {
      alert(`Error generating quiz: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = (opt) => {
    if (quizFinished) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: opt }));
  };

  const handleNextQuestion = (isTimeout = false) => {
    clearInterval(timerRef.current);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setQuizFinished(true);
      setQuizActive(false);
    }
  };

  const handleQuit = () => {
    if (confirm("Are you sure you want to quit the current aptitude test? Your progress will be lost.")) {
      clearInterval(timerRef.current);
      setQuestions([]);
      setQuizActive(false);
      setQuizFinished(false);
    }
  };

  const handleDiscussInChat = () => {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correct_answer) {
        correctCount++;
      }
    });
    const wrongCount = questions.length - correctCount;

    setCurrentTab("chat");
    setHistory((prev) => [
      ...prev,
      {
        role: "user",
        content: `I just finished an aptitude test on "${topic}" and got ${wrongCount} questions wrong. Let's discuss where I went wrong and practice those concepts.`,
      },
    ]);
  };

  const handleRestart = () => {
    setQuestions([]);
    setQuizActive(false);
    setQuizFinished(false);
    setCurrentIndex(0);
    setAnswers({});
  };

  const toggleExplanation = (idx) => {
    setExpandedExplanations((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // 1. Loading state
  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6" id="quiz-loading-state">
        <div className="max-w-2xl mx-auto animate-pulse space-y-6 py-8">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
            <div className="space-y-2 flex-1">
              <div className="h-5 w-1/3 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
            </div>
          </div>
          <hr className="border-slate-100 dark:border-slate-800" />
          <div className="h-32 bg-slate-100 dark:bg-slate-800/60 rounded-2xl"></div>
          <div className="space-y-3">
            <div className="h-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800"></div>
            <div className="h-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800"></div>
            <div className="h-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800"></div>
            <div className="h-12 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800"></div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active timed test state
  if (quizActive && questions.length > 0) {
    const q = questions[currentIndex];
    const userSelected = answers[currentIndex] || "";
    const options = q.options || {};
    const hasTimer = timerLimit > 0;

    return (
      <div className="flex-1 flex flex-col overflow-hidden" id="quiz-active-state">
        {/* Quiz Progress and Timer Header */}
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">Aptitude Test</span>
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200" id="quiz-question-counter">
              Question {currentIndex + 1} of {questions.length}
            </h4>
          </div>

          {/* Timer Clock Widget */}
          {hasTimer && (
            <div
              className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 px-3 py-1.5 rounded-xl shrink-0"
              id="quiz-timer-widget"
            >
              <span className="material-symbols-outlined text-[18px] text-primary animate-pulse">timer</span>
              <span className="font-mono text-sm font-bold text-on-surface dark:text-slate-200" id="quiz-timer-text">
                {timeLeft}s
              </span>
            </div>
          )}
        </div>

        {/* Timer Progress Bar */}
        {hasTimer && (
          <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 shrink-0" id="quiz-progress-bar-container">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear"
              style={{ width: `${(timeLeft / timerLimit) * 100}%` }}
            ></div>
          </div>
        )}

        {/* Question & Choices area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Question Card */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm">
              <p className="text-base text-on-surface dark:text-slate-200 leading-relaxed font-semibold whitespace-pre-wrap">
                {q.question}
              </p>
            </div>

            {/* Choices Stack */}
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(options).map(([key, val]) => {
                const isSelected = userSelected === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSelectOption(key)}
                    type="button"
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 active:scale-[0.99] text-on-surface dark:text-slate-200 ${
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/20"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10"
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-outline dark:text-slate-400"
                      }`}
                    >
                      {key}
                    </span>
                    <span className="text-sm font-semibold text-on-surface dark:text-slate-200 leading-relaxed">
                      {val}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Action Panel */}
        <div className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <button
            onClick={handleQuit}
            type="button"
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 text-outline dark:text-slate-400 hover:text-red-650 hover:border-red-200 dark:hover:bg-red-950/25 rounded-xl text-sm font-semibold transition-all"
          >
            Quit Test
          </button>
          <button
            onClick={() => handleNextQuestion(false)}
            disabled={userSelected === ""}
            className="px-6 py-2.5 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 shadow-md shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {currentIndex === questions.length - 1 ? "Finish Test" : "Next Question"}
          </button>
        </div>
      </div>
    );
  }

  // 3. Scorecard state
  if (quizFinished && questions.length > 0) {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correct_answer) {
        correctCount++;
      }
    });
    const totalCount = questions.length;
    const scorePct = Math.round((correctCount / totalCount) * 100);

    let headline = "Needs Practice";
    let summaryText = `You scored ${scorePct}%. Practice makes perfect! Try another quiz or discuss with PlacementPal.`;

    if (scorePct >= 80) {
      headline = "Excellent Performance!";
      summaryText = `You scored ${scorePct}%. Outstanding grasp of mathematical reasoning and question concepts!`;
    } else if (scorePct >= 60) {
      headline = "Good Effort!";
      summaryText = `You scored ${scorePct}%. You have a solid baseline. Review the explanations to cover remaining gaps.`;
    } else if (scorePct >= 40) {
      headline = "Average Score";
      summaryText = `You scored ${scorePct}%. A bit more practice on these topics will boost your performance in placements.`;
    }

    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-8" id="quiz-score-state">
        <div className="max-w-2xl mx-auto space-y-8 py-4">
          {/* Score Header Card */}
          <div className="p-8 bg-gradient-to-br from-primary/5 via-slate-50 dark:via-slate-900/30 to-white dark:to-slate-950 border border-primary/10 dark:border-primary/20 rounded-2xl shadow-sm text-center flex flex-col items-center">
            <div
              className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-2xl font-extrabold shadow-lg shadow-primary/20 mb-4"
              id="quiz-score-circle"
            >
              {correctCount}/{totalCount}
            </div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-105 font-headline-lg">
              {headline}
            </h3>
            <p className="text-sm text-outline mt-1.5 max-w-md leading-relaxed">
              {summaryText}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={handleRestart}
                type="button"
                className="px-5 py-2.5 bg-primary text-white font-semibold text-xs rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/10 active:scale-95 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Try Another Topic
              </button>
              <button
                onClick={handleDiscussInChat}
                type="button"
                className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-on-surface dark:text-slate-200 font-semibold text-xs rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">forum</span>
                Discuss Mistakes in Chat
              </button>
            </div>
          </div>

          <hr className="border-slate-100 dark:border-slate-800" />

          {/* Question Review container list */}
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-on-surface dark:text-slate-200 uppercase tracking-wider mb-2">
              Detailed Question Reviews
            </h4>
            <div className="space-y-4">
              {questions.map((q, idx) => {
                const userChoice = answers[idx];
                const correctChoice = q.correct_answer;
                const isCorrect = userChoice === correctChoice;
                const isExpanded = !!expandedExplanations[idx];

                return (
                  <div
                    key={idx}
                    className="p-5 border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl shadow-sm space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h5 className="text-sm font-bold text-on-surface dark:text-slate-100 leading-relaxed flex-1">
                        <span className="text-primary mr-1">#{idx + 1}</span> {q.question}
                      </h5>
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                          isCorrect
                            ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-450"
                            : "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-450"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {isCorrect ? "check" : "close"}
                        </span>
                        {isCorrect ? "Correct" : userChoice === "" ? "Timed Out" : "Incorrect"}
                      </span>
                    </div>

                    {/* Options status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {Object.entries(q.options || {}).map(([key, val]) => {
                        let optionBorder = "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30";
                        let badgeBg = "bg-slate-100 dark:bg-slate-800 text-outline dark:text-slate-400";

                        if (key === correctChoice) {
                          optionBorder = "border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20";
                          badgeBg = "bg-emerald-500 text-white";
                        } else if (key === userChoice && !isCorrect) {
                          optionBorder = "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/20";
                          badgeBg = "bg-red-500 text-white";
                        }

                        return (
                          <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border ${optionBorder} text-sm`}>
                            <span className={`w-6 h-6 rounded-lg ${badgeBg} flex items-center justify-center font-bold text-xs shrink-0`}>
                              {key}
                            </span>
                            <span className="text-on-surface/85 dark:text-slate-200 flex-1">{val}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation toggle drawer */}
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                      <button
                        onClick={() => toggleExplanation(idx)}
                        type="button"
                        className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors tracking-wide uppercase focus:outline-none"
                      >
                        <span className={`material-symbols-outlined text-[16px] transform transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                          expand_more
                        </span>
                        {isExpanded ? "Hide Explanation & Solution" : "Show Explanation & Solution"}
                      </button>
                      {isExpanded && (
                        <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-on-surface/90 dark:text-slate-200 leading-relaxed border border-slate-100 dark:border-slate-800 font-medium whitespace-pre-wrap">
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Default Setup state
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6" id="quiz-setup-state">
      <div className="max-w-2xl mx-auto space-y-6 py-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/5">
            <span className="material-symbols-outlined text-[28px]">edit_note</span>
          </div>
          <div>
            <h3 className="text-xl font-bold text-on-surface dark:text-slate-100 font-headline-lg">Aptitude MCQ Quiz Mode</h3>
            <p className="text-xs text-outline">Customized timed tests tailored to your placement goals</p>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        <form onSubmit={handleGenerate} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="quiz-topic" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Target Company or Topic
            </label>
            <input
              type="text"
              id="quiz-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., TCS Quantitative, Infosys Logical, Probability, Ratios"
              required
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800/40 text-on-surface dark:text-slate-100"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Reference Material (Optional)
            </label>
            <p className="text-[11px] text-outline">
              Paste study notes or upload a PDF syllabus/notes. We will use them to build the test.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Paste study notes */}
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                disabled={isUploadingNotes || !!notesPdf}
                rows={5}
                placeholder="Paste study notes or reference questions here..."
                className="w-full rounded-xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800/40 text-on-surface dark:text-slate-100 resize-none disabled:opacity-50"
              />

              {/* Upload syllabus PDF */}
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
                  <span className="block font-semibold text-on-surface dark:text-slate-350 text-xs">
                    Upload PDF Syllabus/Notes
                  </span>
                  <span className="text-[10px] text-outline">PDF must be 5MB or smaller</span>
                </div>

                {/* Loading notes text */}
                {isUploadingNotes && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 rounded-xl flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary animate-spin text-[20px]">sync</span>
                      <span className="text-xs font-semibold text-primary">Extracting...</span>
                    </div>
                  </div>
                )}

                {/* PDF Loaded notes */}
                {notesPdf && (
                  <div className="absolute inset-0 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-xl flex flex-col justify-center p-3 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-primary uppercase tracking-wide">PDF Material Loaded</p>
                        <p className="text-xs font-semibold text-on-surface dark:text-slate-200 truncate">
                          {notesPdf.filename}
                        </p>
                        <p className="text-[10px] text-outline mt-0.5">{notesPdf.text.length} chars extracted</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotesPdf();
                        }}
                        className="shrink-0 text-outline hover:text-red-650 transition-colors"
                        title="Remove PDF"
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

          <div className="space-y-1.5">
            <label htmlFor="quiz-question-count" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Number of Questions
            </label>
            <select
              id="quiz-question-count"
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-700 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="5">5 Questions</option>
              <option value="10">10 Questions</option>
              <option value="15">15 Questions</option>
              <option value="20">20 Questions</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="quiz-timer" className="block text-sm font-bold text-on-surface dark:text-slate-250">
              Time Limit per Question
            </label>
            <select
              id="quiz-timer"
              value={timerLimit}
              onChange={(e) => setTimerLimit(parseInt(e.target.value))}
              className="w-full rounded-xl border-outline-variant/60 dark:border-slate-700 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-3.5 bg-slate-50/50 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="30">30 Seconds</option>
              <option value="60">60 Seconds (Recommended)</option>
              <option value="90">90 Seconds</option>
              <option value="0">No Timer (Practice Mode)</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[20px]">play_circle</span>
            Generate & Start Aptitude Quiz
          </button>
        </form>
      </div>
    </div>
  );
}

export default AptitudeQuizView;

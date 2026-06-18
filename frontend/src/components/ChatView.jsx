import React, { useRef, useEffect, useState } from "react";
import { fileToBase64, parseJsonResponse, markdownToHtml } from "../utils";

function ChatView({
  history,
  setHistory,
  resumeContext,
  setResumeContext,
  setResumeAnalysis,
  setCurrentTab,
  sendMessage,
  isPending,
}) {
  const [inputValue, setInputValue] = useState("");
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [history, isPending]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isPending) return;
    sendMessage(text);
    setInputValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
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

      // Trigger analysis
      fetchResumeAnalysis(data.text, data.filename);
      setCurrentTab("dashboard");

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
      console.error("Failed to analyze resume on upload", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" id="chat-view-panel">
      {/* Scrollable messages area */}
      <section
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto chat-container p-6 space-y-6 scrollbar-none"
        id="chat"
      >
        <div className="space-y-6" id="messages">
          {history.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[85%] ${isUser ? "ml-auto items-end" : "mr-auto items-start"}`}
              >
                <span
                  className={`font-label-md text-outline text-[11px] font-bold uppercase tracking-wide mb-1.5 ${
                    isUser ? "mr-1" : "ml-1"
                  }`}
                >
                  {isUser ? "You" : "PlacementPal"}
                </span>
                <div
                  className={`p-4 rounded-2xl shadow-sm ${
                    isUser
                      ? "bg-msg-user text-white rounded-tr-none shadow-lg shadow-primary/20"
                      : "bg-msg-assistant border border-msg-assistant-border text-on-surface rounded-tl-none"
                  }`}
                >
                  {isUser ? (
                    <p className="font-chat-bubble text-[15px] leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  ) : (
                    <>
                      <div
                        className="assistant-content font-chat-bubble text-[15px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(msg.content) }}
                      />
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px] text-outline font-semibold">
                          <span className="material-symbols-outlined text-[14px]">menu_book</span>
                          <span>Sources:</span>
                          {msg.sources.map((src, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-primary"
                              title={src.score ? `Relevance: ${(src.score * 100).toFixed(0)}%` : ""}
                            >
                              {src.filename}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing skeleton loader */}
          {isPending && (
            <div className="flex flex-col max-w-[85%] mr-auto items-start">
              <span className="font-label-md text-outline ml-1 text-[11px] font-bold uppercase tracking-wide mb-1.5">
                PlacementPal
              </span>
              <div className="bg-msg-assistant border border-msg-assistant-border p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce"></span>
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Input controls footer */}
      <section className="bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4 lg:p-6 shrink-0">
        {resumeContext && (
          <div className="mb-3 flex items-center gap-2 px-1" id="resume-chip">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <span className="material-symbols-outlined text-[16px]">description</span>
              <span id="resume-chip-name">{resumeContext.filename}</span>
            </span>
            <span className="text-xs text-outline">Responses will use your resume</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-3 bg-slate-50 dark:bg-slate-800 border border-outline-variant/60 dark:border-slate-700/80 rounded-2xl p-2 focus-within:border-primary/50 focus-within:bg-white focus-within:dark:bg-slate-900 focus-within:ring-4 focus-within:ring-primary/5 transition-all"
          id="form"
        >
          <input
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf,.pdf"
            type="file"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-10 h-10 shrink-0 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/5 transition-all rounded-xl"
            id="attach-resume"
            title="Upload PDF resume"
            type="button"
          >
            {isUploading ? (
              <span className="material-symbols-outlined animate-spin">sync</span>
            ) : (
              <span className="material-symbols-outlined">attach_file</span>
            )}
          </button>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none focus:ring-0 font-body-md text-on-surface dark:text-slate-100 px-2 placeholder:text-outline/60 resize-none min-h-[40px] max-h-[170px] py-2"
            id="input"
            placeholder="Tell me what's stressing you about placements, or ask about resume, DSA, aptitude, interviews..."
            required
            rows={1}
            disabled={isPending}
          />
          <button
            disabled={!inputValue.trim() || isPending}
            className="send w-10 h-10 shrink-0 bg-primary text-on-primary flex items-center justify-center rounded-xl shadow-lg shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            type="submit"
          >
            <span className="material-symbols-outlined send-icon" style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
          </button>
        </form>
      </section>
    </div>
  );
}

export default ChatView;

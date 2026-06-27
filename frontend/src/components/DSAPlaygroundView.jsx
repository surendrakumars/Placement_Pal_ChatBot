import React, { useRef, useState, useEffect } from "react";
import { parseJsonResponse } from "../utils";

function DSAPlaygroundView() {
  const codeTextareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [stdin, setStdin] = useState("");
  const [activeRightTab, setActiveRightTab] = useState("console"); // "console" | "files"

  // Saved files and loading
  const [savedFiles, setSavedFiles] = useState([]);
  const [saveFilename, setSaveFilename] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);

  // Terminal state logs
  const [terminalOutput, setTerminalOutput] = useState([
    { type: "info", content: "Console cleared. Ready." }
  ]);

  // AI Review report
  const [reviewReport, setReviewReport] = useState(null);

  const dsaTemplates = {
    python: `# Python 3 compiler workspace
import sys

def main():
    # Read all input from standard input (stdin)
    # input_data = sys.stdin.read()
    print("Hello, World!")

if __name__ == "__main__":
    main()`,
    cpp: `// C++ compiler workspace
#include <iostream>
using namespace std;

int main() {
    // Read input from stdin if needed
    cout << "Hello, World!" << endl;
    return 0;
}`,
    java: `// Java compiler workspace
import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) {
        // Read input from stdin if needed
        Scanner sc = new Scanner(System.in);
        System.out.println("Hello, World!");
    }
}`,
    javascript: `// JavaScript (Node.js) compiler workspace
const fs = require('fs');

function main() {
    // Read input from stdin if needed
    // const input = fs.readFileSync(0, 'utf-8');
    console.log("Hello, World!");
}

main();`
  };

  // Sync templates and cached code
  useEffect(() => {
    const cached = localStorage.getItem(`dsa_playground_code_${language}`);
    if (cached) {
      setCode(cached);
    } else {
      setCode(dsaTemplates[language] || "");
    }
    setReviewReport(null);
  }, [language]);

  // Sync saved files list when changing to files tab
  useEffect(() => {
    if (activeRightTab === "files") {
      fetchSavedFiles();
    }
  }, [activeRightTab]);

  const fetchSavedFiles = async () => {
    try {
      const response = await fetch("/api/list-saved-codes", { method: "POST" });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Failed to fetch files");
      setSavedFiles(data.files || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCodeChange = (val) => {
    setCode(val);
    localStorage.setItem(`dsa_playground_code_${language}`, val);
  };

  const handleResetCode = () => {
    if (confirm("Are you sure you want to reset your code to the default template?")) {
      const template = dsaTemplates[language] || "";
      setCode(template);
      localStorage.removeItem(`dsa_playground_code_${language}`);
    }
  };

  const handleScroll = () => {
    if (lineNumbersRef.current && codeTextareaRef.current) {
      lineNumbersRef.current.scrollTop = codeTextareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const updatedCode = val.substring(0, start) + "    " + val.substring(end);
      handleCodeChange(updatedCode);
      // Wait for state update to push cursor forward
      setTimeout(() => {
        if (codeTextareaRef.current) {
          codeTextareaRef.current.selectionStart = codeTextareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  // Run code compiler
  const handleRunCode = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      alert("Please write some code before executing.");
      return;
    }

    setIsRunning(true);
    setTerminalOutput((prev) => [...prev, { type: "info", content: `Running ${language} code...` }]);
    setActiveRightTab("console");

    try {
      const response = await fetch("/api/run-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code: trimmedCode, stdin }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Execution failed");

      const result = data.run;
      const outputs = [];

      if (result.compile_status === "error") {
        outputs.push({ type: "error", content: `Compilation Error:\n${result.compile_error}` });
      } else {
        if (result.stdout) {
          outputs.push({ type: "stdout", content: result.stdout });
        }
        if (result.stderr) {
          outputs.push({ type: "stderr", content: result.stderr });
        }
        outputs.push({
          type: "info",
          content: `Program exited with code ${result.exit_code} (Time: ${result.exec_time})\nDev Tip: ${result.explanation}`,
        });
      }

      setTerminalOutput((prev) => [...prev, ...outputs]);
    } catch (err) {
      setTerminalOutput((prev) => [
        ...prev,
        { type: "error", content: `Failed to compile/run code: ${err.message}` },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Submit code for AI analysis review
  const handleReviewCode = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      alert("Please write some code before submitting.");
      return;
    }

    setIsReviewing(true);
    setReviewReport(null);

    try {
      const response = await fetch("/api/analyze-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: "Generic Code Practice",
          language,
          code: trimmedCode,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      setReviewReport(data.analysis);
    } catch (err) {
      alert(`Error reviewing code: ${err.message}`);
    } finally {
      setIsReviewing(false);
    }
  };

  // Save Code to server file
  const handleSaveCode = async (e) => {
    e.preventDefault();
    const filename = saveFilename.trim();
    if (!filename) {
      alert("Please enter a filename to save (e.g. solution.py)");
      return;
    }
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      alert("Cannot save empty code.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/save-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, code: trimmedCode }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Save failed");

      setSaveFilename("");
      fetchSavedFiles();
      alert(data.message || "File saved successfully!");
    } catch (err) {
      alert(`Failed to save code: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Load Saved Code
  const handleLoadCode = async (filename) => {
    try {
      const response = await fetch("/api/load-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Load failed");

      // Inferred language
      let inferred = "python";
      const ext = filename.split(".").pop().toLowerCase();
      if (ext === "py") inferred = "python";
      else if (ext === "cpp" || ext === "cc" || ext === "h") inferred = "cpp";
      else if (ext === "java") inferred = "java";
      else if (ext === "js") inferred = "javascript";

      setLanguage(inferred);
      setCode(data.code);
      localStorage.setItem(`dsa_playground_code_${inferred}`, data.code);
      alert(`Loaded "${filename}" successfully!`);
    } catch (err) {
      alert(`Failed to load file: ${err.message}`);
    }
  };

  // Download Code File
  const handleDownloadCode = async (filename) => {
    try {
      const response = await fetch("/api/load-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Load failed");

      const blob = new Blob([data.code], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Failed to download file: ${err.message}`);
    }
  };

  // Delete Code File
  const handleDeleteCode = async (filename) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

    try {
      const response = await fetch("/api/delete-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Delete failed");

      fetchSavedFiles();
    } catch (err) {
      alert(`Failed to delete file: ${err.message}`);
    }
  };

  const handleCopySolution = (solText) => {
    navigator.clipboard.writeText(solText);
    alert("Copied solution code to clipboard!");
  };

  const clearTerminal = () => {
    setTerminalOutput([{ type: "info", content: "Console cleared. Ready." }]);
  };

  const linesCount = code.split("\n").length;
  const lineNumbers = [];
  for (let i = 1; i <= Math.max(linesCount, 20); i++) {
    lineNumbers.push(i);
  }

  const editorFilename = `solution.${
    language === "cpp" ? "cpp" : language === "java" ? "java" : language === "javascript" ? "js" : "py"
  }`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" id="dsa-workspace-panel">
      {/* Upper Split Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Side: Code Editor Workspace */}
        <section className="lg:col-span-7 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 overflow-hidden h-full">
          {/* Editor Controls Header */}
          <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 text-xs py-1.5 px-3 bg-white dark:bg-slate-900 text-on-surface dark:text-slate-200 font-semibold"
              >
                <option value="python">Python 3</option>
                <option value="cpp">C++ (GCC)</option>
                <option value="java">Java 17</option>
                <option value="javascript">JavaScript (Node)</option>
              </select>
              <button
                onClick={handleResetCode}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-outline hover:text-red-500 hover:border-red-200 active:scale-95 transition-all shadow-sm"
                title="Reset template"
              >
                <span className="material-symbols-outlined text-[16px] block">restart_alt</span>
              </button>
            </div>
            <span className="text-xs font-mono text-outline dark:text-slate-400 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">code</span>
              {editorFilename}
            </span>
          </div>

          {/* Code Textarea Core */}
          <div className="flex-1 flex overflow-hidden relative font-mono text-sm bg-slate-50/30 dark:bg-slate-950/40">
            {/* Gutter Line Numbers */}
            <div
              ref={lineNumbersRef}
              className="w-12 select-none text-right pr-3 pl-1 py-4 border-r border-slate-150/40 dark:border-slate-800/40 text-outline/50 dark:text-slate-650 leading-relaxed overflow-hidden bg-slate-100/30 dark:bg-slate-950/20"
              style={{ scrollbarWidth: "none" }}
            >
              {lineNumbers.map((num) => (
                <div key={num}>{num}</div>
              ))}
            </div>

            {/* Editing Field */}
            <textarea
              ref={codeTextareaRef}
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              spellCheck="false"
              className="flex-1 h-full py-4 px-4 bg-transparent border-none focus:ring-0 text-on-surface dark:text-slate-100 resize-none overflow-y-auto leading-relaxed select-text"
              placeholder="Write your algorithmic solution here..."
              style={{ tabSize: 4 }}
            />
          </div>

          {/* Action buttons bar */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
            <button
              onClick={handleReviewCode}
              disabled={isReviewing}
              className="px-4 py-2 text-primary dark:text-blue-400 border border-primary/20 hover:border-primary/50 bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1 disabled:opacity-50"
            >
              {isReviewing ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                  Analyzing Logic...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">psychology</span>
                  AI Code Review
                </>
              )}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunCode}
                disabled={isRunning}
                className="px-5 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    Executing...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    Run Code
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Right Side: Tab Console Logs & File System */}
        <section className="lg:col-span-5 flex flex-col overflow-hidden h-full">
          {/* Tab buttons */}
          <div className="px-4 bg-slate-50/50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 select-none">
            <div className="flex border-b border-transparent gap-3">
              <button
                onClick={() => setActiveRightTab("console")}
                className={`py-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1 ${
                  activeRightTab === "console"
                    ? "border-primary text-primary"
                    : "border-transparent text-outline hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                Console & Stdin
              </button>
              <button
                onClick={() => setActiveRightTab("files")}
                className={`py-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1 ${
                  activeRightTab === "files"
                    ? "border-primary text-primary"
                    : "border-transparent text-outline hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">folder_open</span>
                Saved Codes
              </button>
            </div>
            {activeRightTab === "console" && (
              <button onClick={clearTerminal} className="text-[10px] font-bold text-primary uppercase tracking-wide">
                Clear Output
              </button>
            )}
          </div>

          {/* Console logs body */}
          {activeRightTab === "console" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Input field */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <label className="block text-xs font-bold text-on-surface dark:text-slate-350 uppercase tracking-wide mb-1.5">
                  Standard Input (stdin)
                </label>
                <textarea
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  rows={3}
                  placeholder="Provide standard inputs for code runs here (optional)..."
                  className="w-full rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-xs p-3 bg-slate-50/50 dark:bg-slate-950/40 text-on-surface dark:text-slate-100 resize-none font-mono"
                />
              </div>

              {/* Terminal Logs Output */}
              <div className="flex-1 p-4 bg-slate-950 text-slate-100 font-mono text-xs overflow-y-auto leading-relaxed select-text flex flex-col gap-2 chat-container">
                {terminalOutput.map((log, idx) => {
                  let colorClass = "text-slate-300";
                  if (log.type === "error") colorClass = "text-red-400";
                  else if (log.type === "stderr") colorClass = "text-amber-400";
                  else if (log.type === "info") colorClass = "text-blue-400";
                  else if (log.type === "stdout") colorClass = "text-emerald-400";

                  return (
                    <pre key={idx} className={`whitespace-pre-wrap ${colorClass}`}>
                      {log.content}
                    </pre>
                  );
                })}
              </div>
            </div>
          )}

          {/* Saved Files Panel */}
          {activeRightTab === "files" && (
            <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
              <form onSubmit={handleSaveCode} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={saveFilename}
                  onChange={(e) => setSaveFilename(e.target.value)}
                  placeholder="Filename (e.g. solution.py)"
                  required
                  className="flex-1 rounded-xl border-outline-variant/60 dark:border-slate-800 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-xs px-3 py-2 bg-slate-50/50 dark:bg-slate-800 dark:text-slate-100 font-mono"
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/95 flex items-center gap-1 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <span className="material-symbols-outlined text-[14px]">save</span>
                  Save
                </button>
              </form>

              {/* Saved list */}
              <div className="flex-1 overflow-y-auto chat-container divide-y divide-slate-100 dark:divide-slate-800">
                {savedFiles.map((file, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <strong className="block text-on-surface dark:text-slate-200 font-mono truncate">
                        {file.filename}
                      </strong>
                      <span className="text-[10px] text-outline">
                        {(file.size / 1024).toFixed(2)} KB | Modified: {new Date(file.modified).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 select-none">
                      <button
                        onClick={() => handleLoadCode(file.filename)}
                        className="p-1 text-primary hover:bg-primary/5 rounded"
                        title="Edit Code"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleDownloadCode(file.filename)}
                        className="p-1 text-secondary hover:bg-secondary/5 rounded"
                        title="Download Code"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </button>
                      <button
                        onClick={() => handleDeleteCode(file.filename)}
                        className="p-1 text-red-650 hover:bg-red-50 rounded"
                        title="Delete Code"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
                {savedFiles.length === 0 && (
                  <div className="text-center text-outline italic py-8 text-xs">No saved files found on server.</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Bottom AI Review Results */}
      {reviewReport && (
        <section className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 p-6 shrink-0 relative overflow-y-auto max-h-[300px] select-text">
          <button
            onClick={() => setReviewReport(null)}
            className="absolute top-4 right-4 text-outline hover:text-on-surface dark:hover:text-slate-200 transition-colors"
            title="Close review panel"
          >
            <span className="material-symbols-outlined">close</span>
          </button>

          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-primary dark:text-blue-400 uppercase tracking-wide mb-1">
                  AI DSA Review Result
                </h4>
                <p
                  className={`text-base font-extrabold ${
                    reviewReport.correct === "true" || reviewReport.correct === true
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-650"
                  }`}
                >
                  {reviewReport.correct === "true" || reviewReport.correct === true
                    ? "Logic is Correct"
                    : "Logic Needs Work"}
                </p>
              </div>

              {/* Complexities */}
              <div className="flex gap-3">
                <div className="px-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-center min-w-[100px] shadow-sm">
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Time</span>
                  <strong className="text-sm text-on-surface dark:text-slate-100 font-mono">
                    {reviewReport.time_complexity}
                  </strong>
                </div>
                <div className="px-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl text-center min-w-[100px] shadow-sm">
                  <span className="block text-[10px] text-outline font-bold uppercase tracking-wider">Space</span>
                  <strong className="text-sm text-on-surface dark:text-slate-100 font-mono">
                    {reviewReport.space_complexity}
                  </strong>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Feedback */}
              <div className="space-y-2 text-xs">
                <h5 className="font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">analytics</span>
                  AI Feedback Summary
                </h5>
                <p className="text-on-surface/85 dark:text-slate-300 leading-relaxed font-medium">
                  {reviewReport.feedback}
                </p>

                <h5 className="font-bold text-on-surface dark:text-slate-200 uppercase tracking-wide flex items-center gap-1 pt-3">
                  <span className="material-symbols-outlined text-[16px] text-secondary">checklist_rtl</span>
                  Checked Edge Cases
                </h5>
                <ul className="space-y-1.5 list-disc list-inside text-outline dark:text-slate-450 font-medium">
                  {(reviewReport.edge_cases || []).map((edge, idx) => (
                    <li key={idx}>{edge}</li>
                  ))}
                  {(!reviewReport.edge_cases || !reviewReport.edge_cases.length) && (
                    <li>Reviewed common bounds and overflows.</li>
                  )}
                </ul>
              </div>

              {/* Solution code */}
              <div className="flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-850 border-b border-slate-250/50 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold text-outline dark:text-slate-400 uppercase tracking-wider">
                    Optimized AI Solution
                  </span>
                  <button
                    onClick={() => handleCopySolution(reviewReport.optimized_code)}
                    type="button"
                    className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-outline hover:text-primary rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    Copy Code
                  </button>
                </div>
                <pre className="flex-1 p-4 bg-slate-900 text-slate-100 font-mono text-xs overflow-auto max-h-[160px] whitespace-pre chat-container select-text">
                  <code>{reviewReport.optimized_code}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default DSAPlaygroundView;

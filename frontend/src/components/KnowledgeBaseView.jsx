import React, { useEffect, useState, useRef } from "react";
import { fileToBase64, parseJsonResponse } from "../utils";

function KnowledgeBaseView() {
  const [files, setFiles] = useState([]);
  const [config, setConfig] = useState({ enabled: true, strategy: "bm25", top_k: 3 });
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef(null);

  // Fetch file list and RAG config
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/rag/list");
      const data = await parseJsonResponse(response);
      if (response.ok) {
        setFiles(data.files || []);
        if (data.config) {
          setConfig(data.config);
        }
      } else {
        console.error("Failed to load knowledge base files", data.error);
      }
    } catch (err) {
      console.error("Error loading knowledge base data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update RAG settings on change
  const handleConfigChange = async (key, val) => {
    const updatedConfig = { ...config, [key]: val };
    setConfig(updatedConfig);
    try {
      const response = await fetch("/api/rag/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        console.error("Failed to save RAG config", data.error);
      }
    } catch (err) {
      console.error("Error saving RAG config", err);
    }
  };

  // Upload file handler
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setIsUploading(true);

    try {
      const validTypes = ["application/pdf", "text/plain", "text/markdown"];
      const ext = file.name.split(".").pop().toLowerCase();
      if (!validTypes.includes(file.type) && !["txt", "md", "pdf"].includes(ext)) {
        throw new Error("Only PDF, TXT, or MD files are supported");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 8 MB.");
      }

      const b64 = await fileToBase64(file);
      const response = await fetch("/api/rag/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, data: b64 }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Refresh files list
      await fetchData();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete file handler
  const handleDeleteFile = async (filename) => {
    if (!confirm(`Are you sure you want to remove ${filename} from the knowledge base?`)) {
      return;
    }

    try {
      const response = await fetch("/api/rag/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await parseJsonResponse(response);
      if (response.ok && data.success) {
        setFiles((prev) => prev.filter((f) => f.filename !== filename));
      } else {
        alert(data.error || "Delete failed");
      }
    } catch (err) {
      alert(`Error deleting file: ${err.message}`);
    }
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format date
  const formatDate = (ms) => {
    if (!ms) return "-";
    const date = new Date(ms);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden h-full" id="knowledge-base-panel">
      {/* Settings Panel */}
      <section className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 p-6 flex flex-col gap-6 shrink-0 bg-slate-50/50 dark:bg-slate-900/30 overflow-y-auto">
        <div>
          <h3 className="text-lg font-bold text-on-surface dark:text-slate-100 mb-1">RAG Settings</h3>
          <p className="text-xs text-outline dark:text-slate-400">Configure how PlacementPal retrieves information.</p>
        </div>

        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-on-surface dark:text-slate-200">Enable RAG</span>
            <span className="text-xs text-outline dark:text-slate-400">Augment chat with documents</span>
          </div>
          <button
            onClick={() => handleConfigChange("enabled", !config.enabled)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
              config.enabled ? "bg-primary" : "bg-slate-300 dark:bg-slate-700"
            }`}
            type="button"
            title="Toggle RAG"
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                config.enabled ? "translate-x-6" : "translate-x-0"
              }`}
            ></div>
          </button>
        </div>

        {config.enabled && (
          <>
            {/* Strategy Select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-outline dark:text-slate-400 uppercase tracking-wider">
                Retrieval Engine
              </label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleConfigChange("strategy", "bm25")}
                  className={`flex items-start gap-3 p-3 text-left rounded-xl border transition-all ${
                    config.strategy === "bm25"
                      ? "bg-primary/5 border-primary text-primary"
                      : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-on-surface dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700"
                  }`}
                  type="button"
                >
                  <span className="material-symbols-outlined shrink-0 text-[20px] mt-0.5">search</span>
                  <div>
                    <span className="block text-xs font-bold">Lexical Search (BM25)</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">
                      Fast, lightweight keyword matching. Works perfectly offline.
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => handleConfigChange("strategy", "embeddings")}
                  className={`flex items-start gap-3 p-3 text-left rounded-xl border transition-all ${
                    config.strategy === "embeddings"
                      ? "bg-primary/5 border-primary text-primary"
                      : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-on-surface dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700"
                  }`}
                  type="button"
                >
                  <span className="material-symbols-outlined shrink-0 text-[20px] mt-0.5">psychology</span>
                  <div>
                    <span className="block text-xs font-bold">AI Semantic Embeddings</span>
                    <span className="block text-[10px] opacity-75 mt-0.5">
                      Semantic vector similarity. Requires configured embeddings API.
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Top K Chunks */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-outline dark:text-slate-400 uppercase tracking-wider">
                  Retrieval Count (Top K)
                </label>
                <span className="font-semibold text-primary">{config.top_k} Chunks</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                value={config.top_k}
                onChange={(e) => handleConfigChange("top_k", parseInt(e.target.value))}
                className="w-full accent-primary bg-slate-200 dark:bg-slate-700 rounded-lg h-2"
                title="Number of chunks to retrieve"
              />
              <span className="text-[10px] text-outline dark:text-slate-400">
                Number of matching text blocks to feed the assistant. Larger counts provide more context but consume more LLM tokens.
              </span>
            </div>
          </>
        )}
      </section>

      {/* Main Files Panel */}
      <section className="flex-1 flex flex-col overflow-hidden p-6 bg-white dark:bg-slate-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-on-surface dark:text-slate-100">Document Corpus</h2>
            <p className="text-sm text-outline dark:text-slate-400">
              Upload notes, syllabus sheets, or coding preparation documents for the chatbot to search.
            </p>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.txt,.md"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/95 text-on-primary font-semibold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-98 disabled:opacity-50"
              type="button"
            >
              {isUploading ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                  <span>Uploading & Chunking...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">upload_file</span>
                  <span>Upload Reference File</span>
                </>
              )}
            </button>
          </div>
        </div>

        {uploadError && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 shrink-0">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{uploadError}</span>
          </div>
        )}

        {/* Files list / Table */}
        <div className="flex-1 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 py-20 text-outline">
              <span className="material-symbols-outlined animate-spin text-[32px]">sync</span>
              <span className="text-sm">Loading corpus...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20 px-6 text-center text-outline">
              <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <span className="material-symbols-outlined text-[32px]">folder_off</span>
              </div>
              <div className="max-w-md">
                <h4 className="text-on-surface dark:text-slate-200 font-semibold text-base mb-1">
                  Your Knowledge Base is Empty
                </h4>
                <p className="text-xs text-outline dark:text-slate-400 leading-relaxed mb-4">
                  Upload placement papers, company interview logs, aptitude syllabus packets, or resume references. PlacementPal will chunk them and retrieve contents during chat.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:border-primary/50 text-on-surface dark:text-slate-300 hover:text-primary rounded-xl text-xs font-semibold transition-all"
                  type="button"
                >
                  Choose a PDF or TXT to start
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                  <th className="p-4 text-xs font-bold text-outline dark:text-slate-400 uppercase">File Name</th>
                  <th className="p-4 text-xs font-bold text-outline dark:text-slate-400 uppercase">Size</th>
                  <th className="p-4 text-xs font-bold text-outline dark:text-slate-400 uppercase">Text Blocks</th>
                  <th className="p-4 text-xs font-bold text-outline dark:text-slate-400 uppercase">Modified Date</th>
                  <th className="p-4 text-xs font-bold text-outline dark:text-slate-400 uppercase text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {files.map((file, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-all">
                    <td className="p-4 font-semibold text-on-surface dark:text-slate-200 text-sm flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">
                        {file.filename.endsWith(".pdf") ? "picture_as_pdf" : "description"}
                      </span>
                      <span className="truncate max-w-[220px] md:max-w-[320px]" title={file.filename}>
                        {file.filename}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-xs">{formatSize(file.size)}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-on-surface dark:text-slate-300 font-semibold text-[10px]">
                        {file.chunk_count} Chunks
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-xs">{formatDate(file.modified)}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleDeleteFile(file.filename)}
                        className="text-outline hover:text-red-600 transition-colors w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 mx-auto"
                        title="Delete file"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

export default KnowledgeBaseView;

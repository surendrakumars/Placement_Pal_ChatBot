import React, { useState } from "react";

function ResumePasteModal({ isOpen, onClose, onSave }) {
  const [text, setText] = useState("");

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      alert("Please paste some text first");
      return;
    }
    onSave(trimmed);
    setText("");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-outline-variant/30 dark:border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-headline-md text-lg font-bold text-on-surface dark:text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            Paste Resume Text Manually
          </h3>
          <button onClick={onClose} className="text-outline hover:text-on-surface dark:hover:text-slate-100 transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="text-xs text-outline mb-4 leading-relaxed">
          Copy all text from your resume document (Word, PDF, txt) and paste it below. PlacementPal will analyze it to personalize recommendations.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 min-h-[300px] rounded-xl border-outline-variant/60 dark:border-slate-700/80 focus:border-primary/50 focus:ring-4 focus:ring-primary/5 text-sm p-4 bg-slate-50/50 dark:bg-slate-800/40 text-on-surface dark:text-slate-100 resize-none font-body-md"
          placeholder="Paste your resume content here..."
        />
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 border border-outline-variant/60 dark:border-slate-700 text-outline hover:text-on-surface dark:text-slate-350 rounded-xl text-sm font-semibold transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            type="button"
            className="px-5 py-2.5 bg-primary text-white font-semibold text-sm rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/20 active:scale-95"
          >
            Load Paste Data
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResumePasteModal;

import React, { useState } from 'react';
import { SendHorizontal } from 'lucide-react';

const ChatInput = ({ onSendMessage, disabled }) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800 transition-colors duration-200">
      <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto flex items-end gap-2">
        <div className="relative flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
          <textarea
            className="w-full bg-transparent border-0 outline-none resize-none max-h-32 min-h-[56px] py-4 px-4 text-slate-700 dark:text-slate-100 text-[15px] placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-relaxed disabled:opacity-50"
            placeholder={disabled ? "Please wait or select a valid role..." : "Ask the SAP Assistant anything..."}
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
        </div>
        
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="shrink-0 w-[56px] h-[56px] flex items-center justify-center rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:shadow-none transition-all active:scale-95"
        >
          <SendHorizontal className="w-6 h-6" />
        </button>
      </form>
      <div className="text-center mt-2">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">SAP AI Assistant can make mistakes. Verify critical business data.</p>
      </div>
    </div>
  );
};

export default ChatInput;
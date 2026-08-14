import React, { useState, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import SettingsModal from './SettingsModal';
import { Bot, UserCircle, Settings, Trash2, Sun, Moon } from 'lucide-react';

const ChatLayout = ({ messages, isThinking, onSendMessage, onClearChat, theme, onToggleTheme }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 items-center py-8 px-4 transition-colors duration-200">
      <div className="w-full max-w-4xl h-full flex flex-col bg-white/70 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-3xl overflow-hidden">
        
        {/* Header */}
        <header className="bg-white/80 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 dark:text-slate-100 text-lg leading-none">Enterprise SAP Assistant</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Connected to SAP ECC 6.0 & RAG
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle Button */}
            <button 
              onClick={onToggleTheme}
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-slate-600" />
              )}
            </button>

            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center overflow-hidden">
              <UserCircle className="w-6 h-6 text-slate-500 dark:text-slate-400" />
            </div>

            {messages.length > 0 && (
              <button 
                onClick={onClearChat}
                className="p-1.5 text-rose-400 hover:text-rose-600 dark:hover:text-rose-400 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                title="Clear Chat"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-4">
              <Bot className="w-16 h-16 opacity-20" />
              <p className="text-sm font-medium">Start a conversation with the SAP Assistant</p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <ChatMessage key={index} message={msg} />
            ))
          )}
          
          {isThinking && (
            <div className="flex items-end gap-2 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="relative px-4 py-3 rounded-2xl shadow-sm text-[15px] leading-relaxed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none flex gap-1 items-center py-4">
                <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* Input Area */}
        <div className="shrink-0">
          <ChatInput onSendMessage={onSendMessage} disabled={isThinking} />
        </div>

      </div>
      
      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default ChatLayout;
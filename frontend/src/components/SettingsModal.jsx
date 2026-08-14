import React, { useState, useEffect } from 'react';
import { X, Save, Database, Key } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState({
    mcp_sap_config_json: '',
    mcp_rag_config_json: '',
    openrouter_api_key: '',
    assistant_persona: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetch('http://127.0.0.1:8000/api/config')
        .then(res => res.json())
        .then(data => setConfig({
          mcp_sap_config_json: data.mcp_sap_config_json || '',
          mcp_rag_config_json: data.mcp_rag_config_json || '',
          openrouter_api_key: data.openrouter_api_key || '',
          assistant_persona: data.assistant_persona || ''
        }))
        .catch(err => console.error("Failed to load config", err));
    }
  }, [isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const res = await fetch('http://127.0.0.1:8000/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setSaveStatus('success');
        setTimeout(() => onClose(), 1000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
    }
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            Settings
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <Database className="w-4 h-4 text-blue-500" />
                MCP SAP Configuration (JSON)
              </label>
              <textarea 
                value={config.mcp_sap_config_json}
                onChange={e => setConfig({...config, mcp_sap_config_json: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono resize-y min-h-[120px]"
                placeholder='{\n  "mcpServers": {\n    "sap-leader-remote": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <Database className="w-4 h-4 text-emerald-500" />
                MCP RAG Configuration (JSON)
              </label>
              <textarea 
                value={config.mcp_rag_config_json}
                onChange={e => setConfig({...config, mcp_rag_config_json: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono resize-y min-h-[120px]"
                placeholder='{\n  "mcpServers": {\n    "manufacturing-rag": {\n      "type": "http",\n      "url": "..."\n    }\n  }\n}'
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <Key className="w-4 h-4 text-purple-500" />
                OpenRouter API Key
              </label>
              <input 
                type="password" 
                value={config.openrouter_api_key}
                onChange={e => setConfig({...config, openrouter_api_key: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="sk-or-v1-..."
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <span className="text-xl">🎭</span>
                Assistant Persona
              </label>
              <textarea 
                value={config.assistant_persona}
                onChange={e => setConfig({...config, assistant_persona: e.target.value})}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y min-h-[80px]"
                placeholder="Contoh: Balas pesan dengan format teknikal singkat, jangan bertele-tele."
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-sm font-medium">
            {saveStatus === 'success' && <span className="text-emerald-600 dark:text-emerald-400">Saved successfully!</span>}
            {saveStatus === 'error' && <span className="text-rose-600 dark:text-rose-400">Failed to save.</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold shadow-sm shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-70"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
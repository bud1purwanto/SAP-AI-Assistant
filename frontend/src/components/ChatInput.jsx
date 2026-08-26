import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, FileType, Image, Loader2, Mic, MicOff, Paperclip, Send, Square, X } from 'lucide-react';

import { uploadAttachment } from '../lib/api';
import { ALASAN, useVoiceInput } from '../hooks/useVoiceInput';
import { useLanguage } from '../hooks/useLanguage';

const MAX_ATTACHMENTS = 5;

const ACCEPTED = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  '.pdf', '.docx', '.xlsx', '.csv', '.txt', '.md', '.json',
].join(',');

const iconFor = (item) => {
  if (item.kind === 'image') return <Image className="w-3.5 h-3.5" aria-hidden="true" />;
  if (item.content_type?.includes('spreadsheet') || item.filename?.endsWith('.csv')) {
    return <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />;
  }
  if (item.content_type?.includes('wordprocessing')) {
    return <FileType className="w-3.5 h-3.5" aria-hidden="true" />;
  }
  return <FileText className="w-3.5 h-3.5" aria-hidden="true" />;
};

const formatSize = (bytes) => (bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const ChatInput = ({ onSendMessage, isLoading }) => {
  const { t, language } = useLanguage();
  const [input, setInput] = useState('');
  const teksSebelumBicaraRef = useRef('');
  const [pesanSuara, setPesanSuara] = useState('');

  const suara = useVoiceInput({
    onTeks: (teks) => {
      const dasar = teksSebelumBicaraRef.current;
      setInput(dasar ? `${dasar.trimEnd()} ${teks}` : teks);
    },
  });

  const tekanMikrofon = () => {
    if (suara.dukungan === ALASAN.TIDAK_DIDUKUNG) {
      setPesanSuara(t('input.voiceNotSupported'));
      return;
    }
    if (suara.dukungan === ALASAN.BUTUH_HTTPS) {
      setPesanSuara(t('input.voiceHttpsRequired'));
      return;
    }
    setPesanSuara('');
    if (suara.mendengar) {
      suara.berhenti();
    } else {
      teksSebelumBicaraRef.current = input;
      suara.mulai();
    }
  };
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const addFiles = async (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    setUploadError('');
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setUploadError(t('input.maxAttachments', { max: MAX_ATTACHMENTS }));
      return;
    }
    if (incoming.length > room) {
      setUploadError(t('input.onlyFirstAttached', { room, max: MAX_ATTACHMENTS }));
    }

    for (const file of incoming.slice(0, room)) {
      setUploading((n) => n + 1);
      try {
        const stored = await uploadAttachment(file);
        setAttachments((prev) => [...prev, stored]);
      } catch (err) {
        setUploadError(`${file.name}: ${err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAttachment = (uploadId) => {
    setAttachments((prev) => prev.filter((a) => a.upload_id !== uploadId));
    setUploadError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading || uploading > 0) return;
    if (!input.trim() && attachments.length === 0) return;

    const defaultMsg = language === 'en' ? 'Please review the attached files.' : 'Tolong periksa lampiran berikut.';
    onSendMessage(input.trim() || defaultMsg, attachments);
    setInput('');
    setAttachments([]);
    setUploadError('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const busy = isLoading || uploading > 0;

  return (
    <div
      className="composer-container max-w-4xl mx-auto w-full px-2 sm:px-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <form
        onSubmit={handleSubmit}
        className={`composer-form relative rounded-2xl sm:rounded-3xl border bg-surface-raised/95 backdrop-blur-md p-1.5 sm:p-2 shadow-lg transition-all ${
          isDragging
            ? 'border-accent ring-2 ring-accent/30 bg-accent-soft/30'
            : 'border-line hover:border-slate-300 dark:hover:border-slate-700/80'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl sm:rounded-3xl bg-accent-soft/80 backdrop-blur-xs border-2 border-dashed border-accent text-accent font-semibold text-xs sm:text-sm">
            {t('input.dragDrop')}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 px-2 pt-1 pb-2">
            {attachments.map((item) => (
              <span
                key={item.upload_id}
                className="group flex items-center gap-1.5 sm:gap-2 pl-2 sm:pl-2.5 pr-1 sm:pr-1.5 py-1 bg-surface-sunken border border-line rounded-lg sm:rounded-xl text-[11px] sm:text-xs text-content max-w-[200px] sm:max-w-xs"
              >
                <span className="text-content-muted shrink-0">{iconFor(item)}</span>
                <span className="truncate font-medium">{item.filename}</span>
                <span className="text-[10px] text-content-subtle shrink-0 font-mono">({formatSize(item.size_bytes)})</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(item.upload_id)}
                  className="p-0.5 rounded-md sm:rounded-lg text-content-subtle hover:text-danger hover:bg-surface-hover cursor-pointer"
                  aria-label={`Remove attachment ${item.filename}`}
                >
                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-surface-sunken border border-line rounded-lg sm:rounded-xl text-[11px] sm:text-xs text-content-muted">
                <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" aria-hidden="true" />
                Uploading {uploading} file(s)…
              </span>
            )}
          </div>
        )}

        {uploadError && (
          <p role="alert" className="px-2.5 pb-1 text-[11px] sm:text-xs text-danger">{uploadError}</p>
        )}

        {suara.mendengar && (
          <p className="flex items-center gap-1.5 px-2.5 pb-1 text-[11px] sm:text-xs text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
            {t('input.listening')}
          </p>
        )}

        {(pesanSuara || suara.galat) && !suara.mendengar && (
          <p role="alert" className="px-2.5 pb-1 text-[11px] sm:text-xs text-warning">
            {pesanSuara || suara.galat}
          </p>
        )}

        <div className="flex items-end gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 sm:p-2.5 mb-0.5 rounded-xl sm:rounded-2xl text-content-muted hover:text-accent hover:bg-surface-hover transition-colors shrink-0 cursor-pointer"
            aria-label={t('input.attach')}
            title={t('input.attach')}
          >
            <Paperclip className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={tekanMikrofon}
            className={`p-2 sm:p-2.5 mb-0.5 rounded-xl sm:rounded-2xl transition-colors shrink-0 cursor-pointer ${
              suara.mendengar
                ? 'bg-danger/15 text-danger'
                : 'text-content-muted hover:text-accent hover:bg-surface-hover'
            }`}
            aria-label={suara.mendengar ? t('input.stop') : t('input.voice')}
            title={suara.mendengar ? t('input.stop') : t('input.voice')}
          >
            {suara.mendengar
              ? <Square className="w-4 h-4 fill-current" aria-hidden="true" />
              : suara.dukungan === ALASAN.SIAP
                ? <Mic className="w-4 h-4" aria-hidden="true" />
                : <MicOff className="w-4 h-4" aria-hidden="true" />}
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={t('input.placeholder')}
            aria-label={t('input.placeholder')}
            className="no-focus-outline flex-1 max-h-[120px] sm:max-h-[180px] py-2 sm:py-2.5 px-1.5 sm:px-2 bg-transparent text-content placeholder:text-content-subtle placeholder:text-xs sm:placeholder:text-sm text-sm sm:text-[15px] border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none leading-snug sm:leading-relaxed"
            disabled={isLoading}
          />

          <div className="flex items-center gap-1 sm:gap-1.5 pb-0.5">
            <button
              type="submit"
              disabled={busy || (!input.trim() && attachments.length === 0)}
              className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                !busy && (input.trim() || attachments.length > 0)
                  ? 'bg-accent text-accent-fg shadow-md hover:brightness-110 active:scale-95'
                  : 'bg-surface-sunken text-content-subtle cursor-not-allowed'
              }`}
              title={t('input.send')}
              aria-label={t('input.send')}
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="composer-hint px-2 sm:px-3 pt-0.5 sm:pt-1 text-[10px] sm:text-xs text-content-subtle hidden sm:block">
          <span>
            {t('input.shiftEnterHint')}
          </span>
        </div>
      </form>

      {/* AI Disclaimer Footer */}
      <p className="composer-disclaimer text-center text-[9px] sm:text-[10px] text-content-subtle mt-1 mb-0 px-2 select-none leading-tight tracking-normal">
        {language === 'en'
          ? 'SAP AI Assistant may make mistakes. Please verify important data in SAP GUI.'
          : 'SAP AI Assistant dapat membuat kesalahan. Selalu verifikasi data penting di SAP GUI.'}
      </p>
    </div>
  );
};

export default ChatInput;

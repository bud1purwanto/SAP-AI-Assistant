import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, FileType, Image, Loader2, Paperclip, Send, X } from 'lucide-react';

import { uploadAttachment } from '../lib/api';

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
  const [input, setInput] = useState('');
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
      setUploadError(`Maksimal ${MAX_ATTACHMENTS} lampiran per pesan.`);
      return;
    }
    if (incoming.length > room) {
      setUploadError(`Hanya ${room} berkas pertama yang dilampirkan (maksimal ${MAX_ATTACHMENTS}).`);
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
    // Lampiran saja tanpa teks tetap sah — gambar sering sudah menjelaskan sendiri.
    if (!input.trim() && attachments.length === 0) return;

    onSendMessage(input.trim() || 'Tolong periksa lampiran berikut.', attachments);
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

  // Tempel gambar langsung dari papan klip (mis. hasil screenshot).
  const handlePaste = (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  // dragenter/dragleave menyala berkali-kali saat kursor melewati anak elemen,
  // sehingga kedalamannya dihitung agar sorotan tidak berkedip.
  const onDragEnter = (e) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) setIsDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    addFiles(e.dataTransfer?.files);
  };

  const busy = isLoading || uploading > 0;

  return (
    <div className="pwa-chat-input-bar px-3 sm:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-surface/95 backdrop-blur-md border-t border-line shrink-0">
      <form
        onSubmit={handleSubmit}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative bg-surface-raised rounded-2xl sm:rounded-3xl border transition-all duration-200 p-1.5 sm:p-2 max-w-3xl mx-auto focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent shadow-xs hover:shadow-sm ${
          isDragging ? 'border-accent ring-2 ring-accent/30 bg-accent-soft/20' : 'border-line'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 rounded-2xl sm:rounded-3xl flex items-center justify-center bg-accent-soft/90 pointer-events-none z-10">
            <span className="text-xs sm:text-sm font-semibold text-accent-soft-fg">Lepaskan berkas untuk melampirkan</span>
          </div>
        )}

        {/* Lampiran terpilih */}
        {(attachments.length > 0 || uploading > 0) && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 px-1.5 sm:px-2 pt-1 pb-1.5 sm:pb-2">
            {attachments.map((item) => (
              <span
                key={item.upload_id}
                className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-1 sm:pl-2.5 sm:pr-1.5 py-1 sm:py-1.5 bg-surface-sunken border border-line rounded-lg sm:rounded-xl text-[11px] sm:text-xs"
              >
                <span className="text-content-muted">{iconFor(item)}</span>
                <span className="max-w-[8rem] sm:max-w-[12rem] truncate text-content font-medium">{item.filename}</span>
                <span className="text-content-subtle text-[10px] sm:text-xs">{formatSize(item.size)}</span>
                {item.note && <span className="text-warning" title={item.note}>!</span>}
                <button
                  type="button"
                  onClick={() => removeAttachment(item.upload_id)}
                  className="p-0.5 rounded-md sm:rounded-lg text-content-subtle hover:text-danger hover:bg-surface-hover"
                  aria-label={`Hapus lampiran ${item.filename}`}
                >
                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            {uploading > 0 && (
              <span className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-2.5 sm:py-1.5 bg-surface-sunken border border-line rounded-lg sm:rounded-xl text-[11px] sm:text-xs text-content-muted">
                <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" aria-hidden="true" />
                Mengunggah {uploading} berkas…
              </span>
            )}
          </div>
        )}

        {uploadError && (
          <p role="alert" className="px-2.5 pb-1 text-[11px] sm:text-xs text-danger">{uploadError}</p>
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
            className="p-2 sm:p-2.5 mb-0.5 rounded-xl sm:rounded-2xl text-content-muted hover:text-accent hover:bg-surface-hover transition-colors shrink-0"
            aria-label="Lampirkan gambar atau dokumen"
            title="Lampirkan gambar atau dokumen"
          >
            <Paperclip className="w-4 h-4" aria-hidden="true" />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Tanyakan sesuatu tentang SAP…"
            aria-label="Tulis pertanyaan Anda"
            className="no-focus-outline flex-1 max-h-[120px] sm:max-h-[180px] py-2 sm:py-2.5 px-1.5 sm:px-2 bg-transparent text-content placeholder:text-content-subtle placeholder:text-xs sm:placeholder:text-sm text-sm sm:text-[15px] border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none leading-snug sm:leading-relaxed"
            disabled={isLoading}
          />

          <div className="flex items-center gap-1 sm:gap-1.5 pb-0.5">
            <button
              type="submit"
              disabled={busy || (!input.trim() && attachments.length === 0)}
              className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all ${
                !busy && (input.trim() || attachments.length > 0)
                  ? 'bg-accent text-accent-fg shadow-md hover:brightness-110 active:scale-95'
                  : 'bg-surface-sunken text-content-subtle cursor-not-allowed'
              }`}
              title="Kirim pesan (Enter)"
              aria-label="Kirim pesan"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-2 sm:px-3 pt-0.5 sm:pt-1 text-[10px] sm:text-xs text-content-subtle hidden sm:block">
          <span>
            Enter untuk mengirim • Shift + Enter baris baru • seret berkas ke sini atau tempel gambar
          </span>
        </div>
      </form>

      {/* AI Disclaimer Footer */}
      <p className="text-center text-[9.5px] sm:text-[10.5px] text-content-subtle mt-1.5 mb-0 px-2 select-none leading-tight tracking-normal">
        SAP AI Assistant dapat membuat kesalahan. Selalu verifikasi data penting di SAP GUI.
      </p>
    </div>
  );
};

export default ChatInput;

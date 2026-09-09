import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  FileType,
  HelpCircle,
  Image,
  Loader2,
  Mail,
  Mic,
  MicOff,
  Paperclip,
  Send,
  Server,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';

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

import ModeSelector from './ModeSelector';

const formatSize = (bytes) => (bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const SLASH_COMMANDS = [
  {
    cmd: '/help',
    title: '/help',
    desc: 'Panduan lengkap seluruh pintasan perintah & fitur sistem',
    descEn: 'Complete slash commands & system features guide',
    icon: HelpCircle,
    badge: 'Bantuan',
    insertOnly: false,
  },
  {
    cmd: '/sop',
    title: '/sop <topik>',
    desc: 'Cari panduan teknis & prosedur dari dokumen SOP internal',
    descEn: 'Search guidelines & procedures from internal SOP docs',
    icon: FileText,
    badge: 'SOP RAG',
    insertOnly: true,
  },
  {
    cmd: '/email',
    title: '/email <instruksi>',
    desc: 'Susun draf email bisnis & laporan resmi perusahaan',
    descEn: 'Draft business emails & official company reports',
    icon: Mail,
    badge: 'Email',
    insertOnly: true,
  },
  {
    cmd: '/export',
    title: '/export <excel/csv>',
    desc: 'Ekspor data tabel terakhir ke file Excel / CSV unduhan',
    descEn: 'Export last data table to downloadable Excel / CSV',
    icon: Download,
    badge: 'Ekspor',
    insertOnly: true,
  },
  {
    cmd: '/summary',
    title: '/summary',
    desc: 'Rangkum diskusi chat menjadi memo eksekutif 3 poin',
    descEn: 'Summarize chat discussion into 3-point executive memo',
    icon: Sparkles,
    badge: 'Rangkuman',
    insertOnly: false,
  },
  {
    cmd: '/skills',
    title: '/skills',
    desc: 'Katalog modul SOP keahlian teknis domain aktif',
    descEn: 'Catalog of active domain SOP skill modules',
    icon: BookOpen,
    badge: 'Katalog',
    insertOnly: false,
  },
  {
    cmd: '/quota',
    title: '/quota',
    desc: 'Cek pemakaian token harian, batas kuota & peran akun',
    descEn: 'Check daily token usage, limit & account roles',
    icon: UserCheck,
    badge: 'Akun',
    insertOnly: false,
  },
  {
    cmd: '/servers',
    title: '/servers',
    desc: 'Status live konektivitas gateway SAP, SQL & MCP',
    descEn: 'Live status of SAP, SQL & MCP gateways',
    icon: Server,
    badge: 'Gateway',
    insertOnly: false,
  },
  {
    cmd: '/modes',
    title: '/modes',
    desc: 'Daftar mode penalaran AI & batas iterasi langkah',
    descEn: 'List AI reasoning modes & step limits',
    icon: Sliders,
    badge: 'Mode',
    insertOnly: false,
  },
  {
    cmd: '/schedule',
    title: '/schedule',
    desc: 'Buka penjadwalan otomatis SAP & digest harian',
    descEn: 'Open automated SAP scheduling & daily digest',
    icon: Calendar,
    badge: 'Jadwal',
    insertOnly: false,
  },
  {
    cmd: '/clear',
    title: '/clear',
    desc: 'Bersihkan percakapan aktif / mulai sesi baru',
    descEn: 'Clear active chat / start fresh session',
    icon: Trash2,
    badge: 'Sesi',
    insertOnly: false,
  },
];

const ROTATING_PLACEHOLDERS_ID = [
  'Tanyakan sesuatu tentang SAP…',
  'Coba ketik / untuk melihat daftar pintasan perintah…',
  'Coba: /sop cara penanganan material reject…',
  'Coba: /email buatkan draf laporan ke supervisor…',
  'Coba: /export excel untuk mengunduh tabel data…',
  'Coba: /summary untuk membuat rangkuman eksekutif…',
  'Coba: /quota untuk mengecek sisa batas token hari ini…',
];

const ROTATING_PLACEHOLDERS_EN = [
  'Ask something about SAP…',
  'Try typing / to view available slash commands…',
  'Try: /sop material reject handling procedure…',
  'Try: /email draft a formal report to supervisor…',
  'Try: /export excel to download current data table…',
  'Try: /summary to generate 3-point executive memo…',
  'Try: /quota to check remaining daily token budget…',
];

const ChatInput = ({
  onSendMessage,
  isLoading,
  modes = [],
  selectedMode = '',
  onSelectMode,
  suggestions = null,
  onClearChat,
  onOpenScheduledTasks,
}) => {
  const { t, language } = useLanguage();
  const [input, setInput] = useState('');
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState(false);
  const teksSebelumBicaraRef = useRef('');
  const [pesanSuara, setPesanSuara] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const isSlashActive = input.startsWith('/') && !input.includes(' ') && !dismissedSlash;
  const slashQuery = isSlashActive ? input.slice(1).toLowerCase().trim() : '';

  const filteredCommands = useMemo(() => {
    if (!isSlashActive) return [];
    if (!slashQuery) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((item) =>
      item.cmd.toLowerCase().includes(slashQuery) ||
      item.desc.toLowerCase().includes(slashQuery) ||
      item.badge.toLowerCase().includes(slashQuery)
    );
  }, [isSlashActive, slashQuery]);

  useEffect(() => {
    setActiveSlashIndex(0);
  }, [slashQuery]);

  const selectSlashCommand = (item) => {
    if (!item) return;
    if (item.cmd === '/schedule') {
      setInput('');
      setDismissedSlash(false);
      if (onOpenScheduledTasks) {
        onOpenScheduledTasks();
      } else {
        onSendMessage('/schedule', attachments);
      }
      return;
    }

    if (item.cmd === '/clear') {
      setInput('');
      setDismissedSlash(false);
      if (onClearChat) {
        onClearChat();
      } else {
        onSendMessage('/clear', attachments);
      }
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return;
    }

    if (item.insertOnly) {
      const newText = `${item.cmd} `;
      setInput(newText);
      setDismissedSlash(true);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newText.length, newText.length);
        }
      }, 50);
      return;
    }

    onSendMessage(item.cmd, attachments);
    setInput('');
    setDismissedSlash(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const activePlaceholdersList = useMemo(() => {
    const defaultList = language === 'en' ? ROTATING_PLACEHOLDERS_EN : ROTATING_PLACEHOLDERS_ID;
    if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
      const dynamicList = suggestions
        .map((s) => {
          const q = s.query || s.title;
          if (!q) return null;
          const cleanQ = q.length > 55 ? `${q.slice(0, 52)}…` : q;
          return language === 'en' ? `Try: ${cleanQ}` : `Coba: ${cleanQ}`;
        })
        .filter(Boolean);
      return [
        language === 'en' ? 'Ask something about SAP…' : 'Tanyakan sesuatu tentang SAP…',
        ...dynamicList,
        ...defaultList.slice(1),
      ];
    }
    return defaultList;
  }, [suggestions, language]);

  useEffect(() => {
    if (input.trim()) return;

    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % activePlaceholdersList.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [input, activePlaceholdersList]);

  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activePlaceholder = activePlaceholdersList[placeholderIndex % activePlaceholdersList.length];

  const displayedPlaceholder = useMemo(() => {
    if (!activePlaceholder) return '';
    // Pada layar ponsel/PWA, potong teks maksimal ~38 karakter dengan elipsis '…'
    // agar selalu muat rapi dalam 1 baris tanpa bertumpuk atau terpotong toolbar.
    const maxLen = isMobile ? 38 : 65;
    if (activePlaceholder.length > maxLen) {
      return `${activePlaceholder.slice(0, maxLen - 1).trimEnd()}…`;
    }
    return activePlaceholder;
  }, [activePlaceholder, isMobile]);

  const suara = useVoiceInput({
    language,
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

  // Saat selesai loading jawaban (isLoading berubah jadi false), kembalikan fokus ke textarea
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

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
    setDismissedSlash(false);
    setAttachments([]);
    setUploadError('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const handleKeyDown = (e) => {
    if (isSlashActive && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSlashIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(filteredCommands[activeSlashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedSlash(true);
        return;
      }
    }

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
      className="composer-container pwa-chat-input-bar max-w-4xl mx-auto w-full px-2 sm:px-4 relative"
      style={{
        paddingBottom: isMobile ? 'max(0.25rem, calc(var(--sab, env(safe-area-inset-bottom, 0px)) * 0.25))' : '0.625rem',
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Slash Command Autocomplete Popover */}
      {isSlashActive && filteredCommands.length > 0 && (
        <div
          role="listbox"
          aria-label="Slash commands"
          className="mb-2 w-full rounded-2xl border border-line bg-surface-raised/98 backdrop-blur-xl p-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-content-subtle flex items-center justify-between border-b border-line/60 mb-1">
            <span className="flex items-center gap-1.5 font-sans">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              {language === 'en' ? 'Slash Commands' : 'Pintasan Perintah'}
            </span>
            <span className="text-[10px] text-content-muted font-normal normal-case">
              {isMobile ? 'Ketuk untuk menjalankan' : '↑↓ Navigasi • Enter Pilih • Esc Tutup'}
            </span>
          </div>
          <div className="space-y-0.5 max-h-56 overflow-y-auto">
            {filteredCommands.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === activeSlashIndex;
              return (
                <button
                  key={item.cmd}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectSlashCommand(item);
                  }}
                  onMouseEnter={() => setActiveSlashIndex(idx)}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-accent text-white shadow-xs'
                      : 'hover:bg-surface-hover text-content'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-surface-soft text-content-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs sm:text-sm font-semibold font-mono ${isSelected ? 'text-white' : 'text-content'}`}>
                          {item.cmd}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-surface-soft text-content-subtle'
                          }`}
                        >
                          {item.badge}
                        </span>
                      </div>
                      <p className={`text-[11px] sm:text-xs truncate ${isSelected ? 'text-white/90' : 'text-content-muted'}`}>
                        {language === 'en' ? item.descEn : item.desc}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] shrink-0 font-mono hidden sm:inline ${isSelected ? 'text-white/80' : 'text-content-subtle'}`}>
                    ↵
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {/* Textarea: Full width di HP (order-1), Tengah flex-1 di Desktop (order-2) */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              if (dismissedSlash && !val.startsWith('/')) {
                setDismissedSlash(false);
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={displayedPlaceholder}
            aria-label={activePlaceholder}
            className="order-1 sm:order-2 no-focus-outline flex-1 w-full sm:w-auto max-h-[120px] sm:max-h-[180px] py-1.5 sm:py-2 px-2 sm:px-2 bg-transparent text-content placeholder:text-content-subtle placeholder:text-xs sm:placeholder:text-sm placeholder:truncate placeholder:whitespace-nowrap placeholder:overflow-hidden placeholder:text-ellipsis text-sm sm:text-[15px] border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none leading-snug sm:leading-relaxed"
            disabled={isLoading}
          />

          {/* Toolbar Actions: Baris bawah di HP (order-2), Sisi kiri di Desktop (order-1) */}
          <div className="order-2 sm:order-1 flex items-center justify-between sm:justify-start gap-1 sm:gap-1.5 w-full sm:w-auto">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl sm:rounded-2xl text-content-muted hover:text-accent hover:bg-surface-hover flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                aria-label={t('input.attach')}
                title={t('input.attach')}
              >
                <Paperclip className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={tekanMikrofon}
                className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl sm:rounded-2xl flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
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

              {modes && modes.length > 0 && (
                <div className="shrink-0 flex items-center">
                  <ModeSelector
                    modes={modes}
                    selectedMode={selectedMode}
                    onSelectMode={onSelectMode}
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>

            {/* Tombol Send khusus HP di sisi kanan toolbar */}
            <div className="sm:hidden flex items-center">
              <button
                type="submit"
                disabled={busy || (!input.trim() && attachments.length === 0)}
                className={`h-8 w-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
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

          {/* Tombol Send khusus Desktop (Order 3) */}
          <div className="order-3 hidden sm:flex items-center gap-1 sm:gap-1.5">
            <button
              type="submit"
              disabled={busy || (!input.trim() && attachments.length === 0)}
              className={`h-9 w-9 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
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

        <div className="composer-hint text-center px-2 sm:px-3 pt-0.5 sm:pt-1 text-[10px] sm:text-xs text-content-subtle hidden sm:block">
          <span>
            {t('input.shiftEnterHint')}
          </span>
        </div>
      </form>

      {/* AI Disclaimer Footer */}
      <p className="composer-disclaimer text-center text-[9px] sm:text-[10px] text-content-subtle mt-1 mb-0 px-2 select-none leading-tight tracking-normal">
        {language === 'en'
          ? 'Enterprise AI Assistant may make mistakes. Please verify important data in the source system.'
          : 'Enterprise AI Assistant dapat membuat kesalahan. Selalu verifikasi data penting di sistem terkait.'}
      </p>
    </div>
  );
};

export default ChatInput;

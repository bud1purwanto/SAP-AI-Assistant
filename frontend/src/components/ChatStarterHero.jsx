import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

export default function ChatStarterHero({ user, onSelectPrompt }) {
  const { language } = useLanguage();

  const firstName = user?.full_name
    ? String(user.full_name).trim().split(' ')[0]
    : user?.username && user.username !== 'Guest'
    ? user.username
    : (language === 'en' ? 'Friend' : 'Rekan');

  const starterCards = [
    {
      icon: '📦',
      badge: 'SAP ERP',
      title: language === 'en' ? 'Check Material Stock' : 'Cek Stok Material',
      desc: language === 'en'
        ? 'View remaining stock levels in the main plant'
        : 'Periksa sisa kuantitas stok di plant utama',
      prompt: language === 'en'
        ? 'What is the current material stock in the main plant?'
        : 'Berapa sisa stok material di Plant utama saat ini?',
    },
    {
      icon: '📑',
      badge: 'SOP & RAG',
      title: language === 'en' ? 'Purchase Order SOP' : 'Prosedur Purchase Order',
      desc: language === 'en'
        ? 'Flow of PO submission and approval process'
        : 'Alur pengajuan PO dan proses persetujuannya',
      prompt: language === 'en'
        ? 'What is the workflow for Purchase Order (PO) and its approval process?'
        : 'Bagaimana alur pembuatan Purchase Order (PO) dan proses approvalnya?',
    },
    {
      icon: '📊',
      badge: 'SQL Data',
      title: language === 'en' ? 'Transaction Analytics' : 'Analisis Data Transaksi',
      desc: language === 'en'
        ? 'Summary of recent transactional analytics'
        : 'Ringkasan data transaksi dan performa penjualan',
      prompt: language === 'en'
        ? 'Show a summary of recent sales transaction data'
        : 'Tampilkan ringkasan data transaksi penjualan terbaru',
    },
    {
      icon: '📬',
      badge: 'Email Gateway',
      title: language === 'en' ? 'Search Email Notices' : 'Cari Email Notifikasi',
      desc: language === 'en'
        ? 'Track incoming emails regarding vendor confirmations'
        : 'Lacak surel masuk terkait konfirmasi vendor',
      prompt: language === 'en'
        ? 'Find incoming emails regarding the latest vendor delivery confirmation'
        : 'Cari email masuk terkait konfirmasi pengiriman vendor terbaru',
    },
  ];

  return (
    <div className="py-4 sm:py-6 px-1 sm:px-4 flex flex-col items-center justify-center text-center animate-fadeIn max-w-2xl mx-auto w-full select-none">
      
      {/* 1. Robot Mascot Avatar Widget (Konsisten dengan Nuansa Ref 1 Nous Chat Bot) */}
      <div className="relative mb-3 sm:mb-4 group">
        <div className="absolute -inset-2 bg-gradient-to-r from-blue-400/20 to-indigo-400/20 rounded-full blur-md opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 bg-white dark:bg-slate-900 rounded-[22px] sm:rounded-[26px] shadow-sm border border-blue-100 dark:border-slate-700 flex flex-col items-center justify-center p-2 transition-transform hover:scale-105">
          {/* Online Dot */}
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 absolute -top-0.5 -right-0.5 shadow-2xs" title="Online" />
          
          {/* Visor Display */}
          <div className="w-10 h-7 sm:w-11 sm:h-7.5 bg-[#141C2E] rounded-xl flex items-center justify-center gap-2 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]" />
            <span className="w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]" />
          </div>
          <div className="w-4 h-0.5 bg-slate-300 dark:bg-slate-600 rounded-full mt-1 opacity-70" />
        </div>
      </div>

      {/* 2. Sapaan Ramah & Keterangan */}
      <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-white font-display tracking-tight leading-tight">
        {language === 'en' ? `Hello, ${firstName}!` : `Halo, ${firstName}!`}
      </h2>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-snug">
        {language === 'en'
          ? 'Choose a quick example below, or ask anything directly:'
          : 'Pilih salah satu contoh di bawah atau tanyakan langsung apa saja:'}
      </p>

      {/* 3. Grid 2 Kolom Quick Starter Cards (Mobile & Desktop) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 mt-5 sm:mt-6 w-full text-left">
        {starterCards.map((card, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => onSelectPrompt && onSelectPrompt(card.prompt)}
            className="flex flex-col justify-between p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md hover:bg-blue-50/30 dark:hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer group text-left min-w-0"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg sm:text-xl">{card.icon}</span>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-600 tracking-tight">
                  {card.badge}
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-1">
                {card.title}
              </h4>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug line-clamp-2">
                {card.desc}
              </p>
            </div>
            
            <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-[10px] font-semibold text-blue-600 dark:text-blue-400 opacity-80 group-hover:opacity-100">
              <span>{language === 'en' ? 'Ask now' : 'Tanyakan'}</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        ))}
      </div>

    </div>
  );
}


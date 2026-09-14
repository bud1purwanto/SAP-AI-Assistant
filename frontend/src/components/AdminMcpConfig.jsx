import React from 'react';
import { 
  Server, 
  ExternalLink, 
  ShieldCheck, 
  Info,
  Layers,
  ArrowRight,
  Database,
  BookOpen
} from 'lucide-react';

/**
 * AdminMcpConfig - Decommissioned local configuration view.
 * 
 * All MCP upstream servers, credentials, and access control policies are now
 * managed centrally through the Dashboard MCP Gateway. Direct local registration
 * and editing have been deprecated in favor of unified identity and governance.
 */
export default function AdminMcpConfig({ language = 'id' }) {
  const isEn = language === 'en';

  return (
    <div className="space-y-6 animate-fadeIn max-w-4xl">
      {/* HEADER SECTION */}
      <div className="pb-4 border-b border-line/80">
        <h3 className="text-base sm:text-lg font-bold text-content font-display tracking-tight flex items-center gap-2">
          <Server className="w-5 h-5 text-accent" />
          {isEn ? 'MCP Gateway Configuration' : 'Konfigurasi Gateway MCP'}
        </h3>
        <p className="text-xs text-content-muted mt-1">
          {isEn
            ? 'MCP server management is now centralized in the Unified MCP Gateway.'
            : 'Pengelolaan server MCP kini tersentralisasi di Unified MCP Gateway.'}
        </p>
      </div>

      {/* CENTRALIZED MIGRATION NOTICE CARD */}
      <div className="p-6 rounded-2xl border border-accent/30 bg-accent/5 backdrop-blur-xs relative overflow-hidden shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent border border-accent/25 flex items-center justify-center shrink-0 shadow-2xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent border border-accent/30">
                {isEn ? 'Centralized Identity' : 'Identitas Terpusat'}
              </span>
              <span className="text-xs font-semibold text-content-muted">
                Unified Gateway Architecture
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-bold text-content">
              {isEn
                ? 'MCP Servers are now managed via Dashboard'
                : 'Server MCP kini dikelola melalui Dashboard'}
            </h4>
            <p className="text-xs sm:text-sm text-content-muted leading-relaxed">
              {isEn
                ? 'Local MCP server registration, manual endpoint routing, and static bearer tokens in SAP Assistant have been decommissioned. All MCP requests are routed through the central Dashboard MCP Gateway, which enforces unified authentication, role bundles, and audit logging.'
                : 'Pendaftaran server MCP lokal, routing endpoint manual, dan token statis pada SAP Assistant telah dinonaktifkan. Semua permintaan MCP kini diteruskan melalui Dashboard MCP Gateway yang menerapkan autentikasi terpusat, role bundle, dan pencatatan audit.'}
            </p>
            
            <div className="pt-3">
              <a
                href="/admin/mcp"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-accent-contrast rounded-xl text-xs font-bold shadow-sm shadow-accent/20 transition-all cursor-pointer active:scale-95"
              >
                <span>{isEn ? 'Open Dashboard MCP Settings' : 'Buka Pengaturan MCP Dashboard'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ARCHITECTURE HIGHLIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-line bg-surface flex flex-col justify-between space-y-3">
          <div className="flex items-center gap-2 text-content font-semibold text-xs">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span>{isEn ? 'Unified Gateway' : 'Gateway Terpadu'}</span>
          </div>
          <p className="text-[11px] text-content-muted leading-normal">
            {isEn
              ? 'Single endpoint routing for SAP ERP, RAG Knowledge, and SQL connectors with zero local server duplication.'
              : 'Satu titik masuk terpadu untuk SAP ERP, RAG Knowledge, dan SQL tanpa duplikasi konfigurasi server lokal.'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-line bg-surface flex flex-col justify-between space-y-3">
          <div className="flex items-center gap-2 text-content font-semibold text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>{isEn ? 'Zero Shared Secrets' : 'Tanpa Shared Secrets'}</span>
          </div>
          <p className="text-[11px] text-content-muted leading-normal">
            {isEn
              ? 'Elimination of static fallback tokens. Authenticated via user OIDC tokens and backend service headers.'
              : 'Menghilangkan token statis bawaan. Autentikasi menggunakan token OIDC pengguna dan header layanan backend.'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-line bg-surface flex flex-col justify-between space-y-3">
          <div className="flex items-center gap-2 text-content font-semibold text-xs">
            <Info className="w-4 h-4 text-amber-500" />
            <span>{isEn ? 'Role-Based Auditing' : 'Audit Berbasis Role'}</span>
          </div>
          <p className="text-[11px] text-content-muted leading-normal">
            {isEn
              ? 'Every tool invocation is tracked, access-controlled, and audited at the gateway layer.'
              : 'Setiap pemanggilan tools dicatat, divalidasi izin aksesnya, dan diaudit di lapisan gateway.'}
          </p>
        </div>
      </div>
    </div>
  );
}

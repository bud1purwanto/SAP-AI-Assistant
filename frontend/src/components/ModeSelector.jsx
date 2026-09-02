import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Lock,
  Search,
  Sliders,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

export const renderModeIcon = (iconName, className = 'w-3.5 h-3.5') => {
  const k = (iconName || '').toLowerCase().trim();
  switch (k) {
    case 'gauge':
    case 'medium':
      return <Gauge className={className} aria-hidden="true" />;
    case 'brain':
    case 'expert':
      return <Brain className={className} aria-hidden="true" />;
    case 'sparkles':
      return <Sparkles className={className} aria-hidden="true" />;
    case 'cpu':
      return <Cpu className={className} aria-hidden="true" />;
    case 'bot':
      return <Bot className={className} aria-hidden="true" />;
    case 'sliders':
      return <Sliders className={className} aria-hidden="true" />;
    case 'wrench':
      return <Wrench className={className} aria-hidden="true" />;
    case 'search':
      return <Search className={className} aria-hidden="true" />;
    case 'zap':
    case 'fast':
    default:
      return <Zap className={className} aria-hidden="true" />;
  }
};

const ModeSelector = ({
  modes = [],
  selectedMode = '',
  onSelectMode,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!modes || modes.length === 0) return null;

  const currentMode =
    modes.find((m) => m.code === selectedMode) ||
    modes.find((m) => m.is_default && m.available) ||
    modes[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        className={`group h-8 sm:h-9 flex items-center gap-1.5 px-2.5 rounded-xl sm:rounded-2xl text-xs font-medium transition-all cursor-pointer border ${
          isOpen
            ? 'bg-surface-hover border-accent/40 text-accent ring-2 ring-accent/20'
            : 'bg-surface-raised/80 hover:bg-surface-hover border-line text-content-muted hover:text-content'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={t('mode.selectorAria')}
        title={t('mode.title')}
      >
        <span className="text-accent shrink-0 flex items-center justify-center">
          {renderModeIcon(currentMode?.icon, 'w-3.5 h-3.5')}
        </span>
        <span className="font-semibold truncate max-w-[90px] sm:max-w-[120px] text-xs">
          {currentMode?.name || 'Mode'}
        </span>
        {isOpen ? (
          <ChevronUp className="w-3 h-3 text-content-subtle shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3 h-3 text-content-subtle shrink-0" aria-hidden="true" />
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 sm:w-80 rounded-2xl bg-surface-raised/95 backdrop-blur-md border border-line shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
          role="menu"
        >
          <div className="px-2.5 py-1.5 border-b border-line mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-content-subtle">
              {t('mode.title')}
            </span>
            <span className="text-[10px] text-content-subtle font-mono">
              {modes.filter((m) => m.available).length}/{modes.length} {t('mode.active')}
            </span>
          </div>

          <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar p-0.5">
            {modes.map((mode) => {
              const isSelected = selectedMode === mode.code;
              const isAvailable = Boolean(mode.available);

              return (
                <button
                  key={mode.code || mode.id}
                  type="button"
                  onClick={() => {
                    if (isAvailable && onSelectMode) {
                      onSelectMode(mode.code);
                      setIsOpen(false);
                    }
                  }}
                  disabled={!isAvailable}
                  className={`w-full text-left flex items-start gap-2.5 p-2 rounded-xl transition-all ${
                    isAvailable
                      ? isSelected
                        ? 'bg-accent-soft/40 border border-accent/30 text-content'
                        : 'hover:bg-surface-hover text-content cursor-pointer border border-transparent'
                      : 'opacity-50 cursor-not-allowed bg-surface-sunken/40 text-content-subtle border border-transparent'
                  }`}
                  role="menuitem"
                  title={!isAvailable ? t('mode.notAllowedRole') : mode.description || ''}
                >
                  <div
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                      isSelected && isAvailable
                        ? 'bg-accent text-accent-fg'
                        : isAvailable
                        ? 'bg-surface-sunken text-accent'
                        : 'bg-surface-sunken text-content-subtle'
                    }`}
                  >
                    {renderModeIcon(mode.icon, 'w-4 h-4')}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs sm:text-sm text-content truncate">
                        {mode.name}
                      </span>
                      {mode.is_default && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-surface-sunken border border-line text-content-subtle shrink-0">
                          {t('mode.default')}
                        </span>
                      )}
                    </div>
                    {mode.description && (
                      <p className="text-[11px] text-content-muted leading-tight mt-0.5 line-clamp-2">
                        {mode.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center self-center pl-1">
                    {!isAvailable ? (
                      <span className="p-1 rounded-md text-content-subtle" title={t('mode.notAllowedRole')}>
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    ) : isSelected ? (
                      <Check className="w-4 h-4 text-accent" aria-hidden="true" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModeSelector;

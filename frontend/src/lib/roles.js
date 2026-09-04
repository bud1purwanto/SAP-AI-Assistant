import React from 'react';
import {
  ShieldCheck,
  Code2,
  Terminal,
  Database,
  Globe,
  Cpu,
  Layers,
  User,
  Users,
  Shield,
  Key,
  Lock,
  Sparkles,
  Wrench,
  Activity,
} from 'lucide-react';

/**
 * Pemetaan warna statis untuk kompatibilitas Tailwind JIT build.
 * Jangan membuat string dinamis seperti `bg-${color}-500` karena compiler
 * Vite/Tailwind tidak akan menyertakannya di bundle akhir.
 */
export const ROLE_COLOR_MAP = {
  purple: {
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    dot: 'bg-purple-400',
  },
  indigo: {
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
  },
  emerald: {
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  amber: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  cyan: {
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
  },
  rose: {
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  teal: {
    bg: 'bg-teal-500/15',
    text: 'text-teal-400',
    border: 'border-teal-500/30',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    dot: 'bg-teal-400',
  },
  sky: {
    bg: 'bg-sky-500/15',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400',
  },
  blue: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  orange: {
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    dot: 'bg-orange-400',
  },
  violet: {
    bg: 'bg-violet-500/15',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    dot: 'bg-violet-400',
  },
  zinc: {
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    dot: 'bg-zinc-400',
  },
};

export const ROLE_COLOR_OPTIONS = [
  { value: 'purple', label: 'Purple' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'emerald', label: 'Emerald' },
  { value: 'amber', label: 'Amber' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'rose', label: 'Rose' },
  { value: 'teal', label: 'Teal' },
  { value: 'sky', label: 'Sky' },
  { value: 'blue', label: 'Blue' },
  { value: 'orange', label: 'Orange' },
  { value: 'violet', label: 'Violet' },
  { value: 'zinc', label: 'Zinc' },
];

export const ROLE_ICON_MAP = {
  'shield-check': ShieldCheck,
  'code-2': Code2,
  'terminal': Terminal,
  'database': Database,
  'globe': Globe,
  'cpu': Cpu,
  'layers': Layers,
  'user': User,
  'users': Users,
  'shield': Shield,
  'key': Key,
  'lock': Lock,
  'sparkles': Sparkles,
  'wrench': Wrench,
  'activity': Activity,
};

export const ROLE_ICON_OPTIONS = [
  { value: 'users', label: 'Users', icon: Users },
  { value: 'user', label: 'User', icon: User },
  { value: 'shield-check', label: 'Shield Check', icon: ShieldCheck },
  { value: 'shield', label: 'Shield', icon: Shield },
  { value: 'code-2', label: 'Code', icon: Code2 },
  { value: 'terminal', label: 'Terminal', icon: Terminal },
  { value: 'database', label: 'Database', icon: Database },
  { value: 'globe', label: 'Globe', icon: Globe },
  { value: 'cpu', label: 'CPU', icon: Cpu },
  { value: 'layers', label: 'Layers', icon: Layers },
  { value: 'key', label: 'Key', icon: Key },
  { value: 'lock', label: 'Lock', icon: Lock },
  { value: 'sparkles', label: 'Sparkles', icon: Sparkles },
  { value: 'wrench', label: 'Wrench', icon: Wrench },
  { value: 'activity', label: 'Activity', icon: Activity },
];

/**
 * Mengambil class badge Tailwind yang aman untuk suatu warna.
 */
export function getRoleBadgeStyle(colorName) {
  const c = (colorName || 'zinc').toLowerCase();
  return ROLE_COLOR_MAP[c]?.badge || ROLE_COLOR_MAP.zinc.badge;
}

/**
 * Mengambil Icon Component untuk nama icon.
 */
export function getRoleIconComponent(iconName) {
  const name = (iconName || 'users').toLowerCase();
  return ROLE_ICON_MAP[name] || Users;
}

/**
 * Format string peran menjadi label yang rapi jika label tidak ada.
 */
export function formatRoleLabel(code) {
  if (!code) return '';
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


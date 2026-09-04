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

export const ROLE_COLOR_LABELS = {
  purple: { en: 'Purple', id: 'Ungu' },
  indigo: { en: 'Indigo', id: 'Nila' },
  emerald: { en: 'Emerald', id: 'Jamrud (Emerald)' },
  amber: { en: 'Amber', id: 'Kuning Amber' },
  cyan: { en: 'Cyan', id: 'Sian (Cyan)' },
  rose: { en: 'Rose', id: 'Merah Mawar' },
  teal: { en: 'Teal', id: 'Hijau Laut (Teal)' },
  sky: { en: 'Sky Blue', id: 'Biru Langit' },
  blue: { en: 'Blue', id: 'Biru' },
  orange: { en: 'Orange', id: 'Jingga' },
  violet: { en: 'Violet', id: 'Violet' },
  zinc: { en: 'Zinc', id: 'Abu-Abu (Zinc)' },
};

export const ROLE_ICON_LABELS = {
  'users': { en: 'Users (Group)', id: 'Pengguna (Grup)' },
  'user': { en: 'User (Single)', id: 'Pengguna (Tunggal)' },
  'shield-check': { en: 'Shield Check', id: 'Perisai Centang' },
  'shield': { en: 'Shield', id: 'Perisai' },
  'code-2': { en: 'Code', id: 'Kode Program' },
  'terminal': { en: 'Terminal', id: 'Terminal' },
  'database': { en: 'Database', id: 'Basis Data' },
  'globe': { en: 'Globe', id: 'Globe / Web' },
  'cpu': { en: 'CPU', id: 'Prosesor (CPU)' },
  'layers': { en: 'Layers', id: 'Lapisan (Layers)' },
  'key': { en: 'Key', id: 'Kunci (Key)' },
  'lock': { en: 'Lock', id: 'Gembok (Lock)' },
  'sparkles': { en: 'Sparkles', id: 'Kilau AI' },
  'wrench': { en: 'Wrench', id: 'Kunci Pas (Alat)' },
  'activity': { en: 'Activity', id: 'Aktivitas' },
};

export function getRoleColorLabel(color, isEn = false) {
  return ROLE_COLOR_LABELS[color]?.[isEn ? 'en' : 'id'] || color;
}

export function getRoleIconLabel(icon, isEn = false) {
  return ROLE_ICON_LABELS[icon]?.[isEn ? 'en' : 'id'] || icon;
}

export const DEFAULT_ROLE_COLORS = {
  superadmin: 'purple',
  admin: 'purple',
  abaper: 'indigo',
  functional: 'emerald',
  backend: 'amber',
  frontend: 'cyan',
  basis: 'rose',
  data_analyst: 'teal',
  user: 'zinc',
  guest: 'zinc',
};

/**
 * Mengambil class badge Tailwind yang aman untuk suatu warna atau kode peran.
 */
export function getRoleBadgeStyle(colorOrRole) {
  const raw = Array.isArray(colorOrRole) ? colorOrRole[0] : colorOrRole;
  const key = (raw || 'zinc').toLowerCase();
  if (ROLE_COLOR_MAP[key]) {
    return ROLE_COLOR_MAP[key].badge;
  }
  const mappedColor = DEFAULT_ROLE_COLORS[key] || 'zinc';
  return ROLE_COLOR_MAP[mappedColor]?.badge || ROLE_COLOR_MAP.zinc.badge;
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

/**
 * Mengambil inisial pengguna untuk tampilan avatar.
 * Mengutamakan 2 huruf dari kata pertama & kedua dari full_name,
 * atau 2 huruf pertama dari username jika full_name tidak ada.
 */
export function getUserInitials(user) {
  const name = (user?.full_name || user?.username || '').trim();
  if (!name) return 'U';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}


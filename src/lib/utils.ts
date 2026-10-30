import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import { fr } from 'date-fns/locale';

export function formatMessageTime(iso: string): string {
  return format(new Date(iso), 'HH:mm', { locale: fr });
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return 'Hier';
  if (isThisYear(d)) return format(d, 'EEEE d MMMM', { locale: fr });
  return format(d, 'EEEE d MMMM yyyy', { locale: fr });
}

export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return 'Jamais connecté';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "vu à l'instant";
  if (minutes < 60) return `vu il y a ${minutes} min`;
  if (isToday(d)) return `vu aujourd'hui à ${format(d, 'HH:mm', { locale: fr })}`;
  if (isYesterday(d)) return `vu hier à ${format(d, 'HH:mm', { locale: fr })}`;
  if (isThisYear(d)) return `vu le ${format(d, "d MMMM 'à' HH:mm", { locale: fr })}`;
  return `vu le ${format(d, "d MMMM yyyy", { locale: fr })}`;
}

export function formatFullDate(iso: string): string {
  return format(new Date(iso), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
}

export function dayKey(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd');
}

const COLORS: Record<string, { from: string; to: string; text: string }> = {
  emerald: { from: '#1f6a4a', to: '#0d3324', text: '#b8f0d2' },
  gold: { from: '#8f6f2c', to: '#4a3a10', text: '#f5e0a0' },
  ruby: { from: '#7a2a35', to: '#3d1017', text: '#ffc4cd' },
  sapphire: { from: '#274a75', to: '#101f3a', text: '#b8d8ff' },
  amethyst: { from: '#54356f', to: '#271035', text: '#e3c4ff' },
  bronze: { from: '#6e4a26', to: '#2e1d0c', text: '#f0cfa8' },
};
export const COLOR_KEYS = Object.keys(COLORS);

export function colorFor(key: string | undefined): { from: string; to: string; text: string } {
  return COLORS[key ?? 'emerald'] ?? COLORS.emerald;
}

export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function generatePassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*?';
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  let pw = pick(upper) + pick(lower) + pick(digits) + pick(special);
  for (let i = 0; i < 8; i++) pw += pick(all);
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

export function validateIdentifier(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,23}$/.test(s))
    return '3 à 24 caractères : minuscules, chiffres, « . », « _ » ou « - » (commence par une lettre ou un chiffre).';
  if (s === 'safidy') return 'Cet identifiant est réservé au compte administrateur.';
  return null;
}

export function validatePassword(v: string): string | null {
  if (v.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[a-zA-ZÀ-ÿ]/.test(v) || !/[0-9]/.test(v))
    return 'Il faut au moins une lettre et un chiffre.';
  return null;
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// src/lib/helpers.ts — pure helpers, no imports, no side effects

export function formatDate(input: string | Date): string {
  if (Number.isNaN(new Date(input).getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(input));
}

// Relationship/honorific tokens (e.g. "Ganga A/P Raman", "Ahmad Bin Ismail")
// aren't part of anyone's given/family name, so they'd otherwise corrupt the
// "last two words" initials heuristic below — dropped before taking initials.
const NAME_RELATION_TOKENS = new Set(['a/p', 'a/l', 'bin', 'binti', 'bt', 'bte']);

// Short label for a staff member in tight spaces (roster chips): the display
// name if set, otherwise initials of the last two words of full_name — e.g.
// "Tan Chi Ming" -> "CM", so the initials stay a family/given-name pair
// rather than drifting to a middle name for people with 3+ name parts.
export function staffLabel(s: { display_name?: string | null; full_name: string }): string {
  const d = s.display_name?.trim();
  if (d) return d;
  const trimmed = s.full_name.trim();
  const w = trimmed.split(/\s+/).filter((x) => !NAME_RELATION_TOKENS.has(x.toLowerCase()));
  if (w.length === 0) return trimmed[0]?.toUpperCase() ?? '';
  return (w.length >= 2 ? w.slice(-2) : w).map((x) => x[0]?.toUpperCase() ?? '').join('');
}

export function toKLDateISO(input: string | Date): string {
  if (Number.isNaN(new Date(input).getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input));
}

export function filterToday<T extends { date: string }>(items: T[], todayISO: string): T[] {
  return items.filter((item) => item.date === todayISO);
}

export function countKudosByRecipient(kudos: { to_user_id: string }[]): Record<string, number> {
  return kudos.reduce<Record<string, number>>((acc, k) => {
    acc[k.to_user_id] = (acc[k.to_user_id] ?? 0) + 1;
    return acc;
  }, {});
}

export function countKudosForUser(kudos: { to_user_id: string }[], userId: string): number {
  return kudos.filter((k) => k.to_user_id === userId).length;
}

// Shifts a YYYY-MM-DD string by N days without going through local-timezone
// Date parsing (which would risk off-by-one day shifts near midnight).
export function shiftDateISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function formatDateShort(input: string | Date): string {
  if (Number.isNaN(new Date(input).getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
  }).format(new Date(input));
}

// Returns the Monday (YYYY-MM-DD) of the week containing dateISO.
export function getWeekStartISO(dateISO: string): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return shiftDateISO(dateISO, diff);
}

const BOARD_PRIORITY_ORDER: Record<'low' | 'normal' | 'high', number> = { high: 0, normal: 1, low: 2 };
const BOARD_STATUS_ORDER: Record<'open' | 'done', number> = { open: 0, done: 1 };

export function formatLeaveDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}

export function formatTimeKL(input: string | Date): string {
  if (Number.isNaN(new Date(input).getTime())) return '';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(input));
}

// Recovers the storage path from a previously-stored public or signed
// Supabase Storage URL (e.g. .../object/public/{bucket}/{path} or
// .../object/sign/{bucket}/{path}?token=...), so a fresh signed URL can be
// requested for it after a bucket moves from public to private.
export function extractStoragePath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const rest = url.slice(index + marker.length);
  const queryIndex = rest.indexOf('?');
  return queryIndex === -1 ? rest : rest.slice(0, queryIndex);
}

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
}

// Builds a standard WIFI:// join string per the WIFI: QR spec, escaping
// \ ; , : " inside ssid/password so symbols in real-world passwords survive.
export function buildWifiQrValue(ssid: string, password: string, authType: 'WPA' | 'WEP' | 'nopass' = 'WPA'): string {
  function escape(value: string): string {
    return value.replace(/[\\;,:"]/g, '\\$&');
  }
  return `WIFI:T:${authType};S:${escape(ssid)};P:${escape(password)};;`;
}

export function sortBoardItems<
  T extends { priority: 'low' | 'normal' | 'high'; status: 'open' | 'done'; created_at: string }
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (BOARD_PRIORITY_ORDER[a.priority] !== BOARD_PRIORITY_ORDER[b.priority]) {
      return BOARD_PRIORITY_ORDER[a.priority] - BOARD_PRIORITY_ORDER[b.priority];
    }
    if (BOARD_STATUS_ORDER[a.status] !== BOARD_STATUS_ORDER[b.status]) {
      return BOARD_STATUS_ORDER[a.status] - BOARD_STATUS_ORDER[b.status];
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

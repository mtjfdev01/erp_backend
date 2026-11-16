/** Shared formatting helpers for DMS report dashboards. */

export function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function formatPkrCompact(amount: number): string {
  const n = toNumber(amount);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    const s = Math.abs(m) >= 10 ? m.toFixed(1) : m.toFixed(1);
    return `PKR ${s.replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    const k = n / 1_000;
    const s = Math.abs(k) >= 10 ? k.toFixed(0) : k.toFixed(1);
    return `PKR ${s.replace(/\.0$/, "")}K`;
  }
  return `PKR ${Math.round(n).toLocaleString("en-US")}`;
}

export function formatRsCompact(amount: number): string {
  return formatPkrCompact(amount).replace(/^PKR /, "Rs ");
}

export function formatCount(n: number): string {
  return Math.round(toNumber(n)).toLocaleString("en-US");
}

export function pctChange(current: number, previous: number): {
  text: string;
  trend: "up" | "down" | "neutral";
} {
  if (!previous || previous === 0) {
    if (!current) return { text: "—", trend: "neutral" };
    return { text: "▲ new", trend: "up" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  if (pct > 0.05) return { text: `▲ ${rounded}%`, trend: "up" };
  if (pct < -0.05) return { text: `▼ ${Math.abs(Number(rounded))}%`, trend: "down" };
  return { text: "flat", trend: "neutral" };
}

export function ptsChange(current: number, previous: number): {
  text: string;
  trend: "up" | "down" | "neutral";
} {
  const diff = current - previous;
  const rounded = Math.abs(diff) >= 10 ? diff.toFixed(0) : diff.toFixed(1);
  if (diff > 0.05) return { text: `▲ ${rounded} pts`, trend: "down" };
  if (diff < -0.05)
    return { text: `▼ ${Math.abs(Number(rounded))} pts`, trend: "up" };
  return { text: "flat", trend: "neutral" };
}

export function monthBounds(periodYm?: string): {
  start: string;
  end: string;
  label: string;
  prevStart: string;
  prevEnd: string;
  prevLabel: string;
  year: number;
  monthIndex: number;
} {
  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth(); // 0-based

  if (periodYm && /^\d{4}-\d{2}$/.test(periodYm)) {
    const [y, m] = periodYm.split("-").map(Number);
    if (y && m >= 1 && m <= 12) {
      year = y;
      monthIndex = m - 1;
    }
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  /** Local calendar date — avoid toISOString() UTC day-shift (e.g. PKT). */
  const fmt = (y: number, m0: number, day: number) =>
    `${y}-${pad(m0 + 1)}-${pad(day)}`;

  const endDay = new Date(year, monthIndex + 1, 0).getDate();
  const prevYear = monthIndex === 0 ? year - 1 : year;
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevEndDay = new Date(prevYear, prevMonthIndex + 1, 0).getDate();

  const labelOf = (y: number, m0: number) =>
    new Date(y, m0, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

  return {
    start: fmt(year, monthIndex, 1),
    end: fmt(year, monthIndex, endDay),
    label: labelOf(year, monthIndex),
    prevStart: fmt(prevYear, prevMonthIndex, 1),
    prevEnd: fmt(prevYear, prevMonthIndex, prevEndDay),
    prevLabel: labelOf(prevYear, prevMonthIndex).split(" ")[0].slice(0, 3),
    year,
    monthIndex,
  };
}

export const COMPLETED_DONATION_STATUSES = [
  "completed",
  "success",
  "paid",
  "verified",
  "deposited",
];

export const PENDING_DONATION_STATUSES = ["pending"];

export const FAILED_DONATION_STATUSES = ["failed"];

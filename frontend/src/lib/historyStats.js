// Aggregation helpers for the item history/heatmap view. Pure functions,
// no React — kept separate so ItemEditor.jsx doesn't grow further and the
// math is easy to test/reason about in isolation.

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_HEATMAP_DAYS = 365;

const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// "3 days ago" / "2 months ago" / "just now" relative to now.
export function formatRelativeTime(iso, now = new Date()) {
  if (!iso) return "-";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "-";

  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;

  const diffDays = Math.round(diffH / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;

  const diffYears = Math.round(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

export function formatDate(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso).replace("T", "  ");
  return date.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// Rounds a day-span into something readable ("every 4 days", "over 8 months").
function formatDaySpan(days) {
  if (days < 1) return "daily";
  if (days < 30) return `every ${Math.round(days)} days`;
  const months = days / 30;
  if (months < 12) return `every ${Math.round(months)} months`;
  const years = months / 12;
  return `every ${Math.round(years * 10) / 10} years`;
}

/**
 * Aggregates raw history entries ({ playedAt }) into everything the
 * History tab needs: summary tiles, a day-bucketed heatmap grid, and an
 * hour-of-day distribution. Returns null for an empty history.
 */
export function aggregateHistory(history, now = new Date()) {
  if (!history || history.length === 0) return null;

  const timestamps = history
    .map((e) => new Date(e.playedAt))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (timestamps.length === 0) return null;

  const first = timestamps[0];
  const last = timestamps[timestamps.length - 1];

  const countsByDay = new Map();
  const countsByHour = new Array(24).fill(0);
  for (const d of timestamps) {
    const key = toDateKey(d);
    countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    countsByHour[d.getHours()] += 1;
  }

  const spanDays = Math.max(1, (last.getTime() - first.getTime()) / DAY_MS);
  const avgIntervalDays = timestamps.length > 1 ? spanDays / (timestamps.length - 1) : spanDays;

  const tiles = {
    total: timestamps.length,
    lastPlayed: formatRelativeTime(last.toISOString(), now),
    firstPlayed: formatDate(first.toISOString()),
    firstPlayedSpan: spanDays >= 30 ? formatDaySpan(spanDays).replace("every ", "over ") : null,
    avgInterval: timestamps.length > 1 ? formatDaySpan(avgIntervalDays) : "-",
  };

  // Heatmap grid: at least the last 12 months, extended back further if
  // the history is older. Aligned to full weeks, Monday-start.
  const rangeStart = new Date(Math.min(first.getTime(), now.getTime() - MIN_HEATMAP_DAYS * DAY_MS));
  rangeStart.setHours(0, 0, 0, 0);
  const dow = (rangeStart.getDay() + 6) % 7; // 0 = Monday
  rangeStart.setDate(rangeStart.getDate() - dow);

  const rangeEnd = new Date(now);
  rangeEnd.setHours(0, 0, 0, 0);

  const weeks = [];
  let week = [];
  let maxCount = 0;
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
    const key = toDateKey(d);
    const count = countsByDay.get(key) || 0;
    if (count > maxCount) maxCount = count;
    week.push({ date: new Date(d), key, count });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const hourDistribution = countsByHour.map((count, hour) => ({ hour, count }));

  return { tiles, weeks, maxCount, hourDistribution };
}

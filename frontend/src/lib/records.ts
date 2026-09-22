import type { Analytics } from "./api";

export type ChatRecord = {
  label: string;
  /** The big headline value, e.g. "47" */
  value: string;
  /** Unit next to the value, e.g. "days" */
  unit: string;
  /** Small supporting line, e.g. "18 Jun to 3 Aug 2025" */
  sub?: string;
  /** Which icon the dashboard should render for this record */
  icon: "flame" | "calendar" | "trending" | "type";
};

/** "DD/MM/YYYY" (the parser's date-key format) → epoch days */
function toEpochDays(dateKey: string): number | null {
  const parts = dateKey.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  return Math.floor(new Date(y, m - 1, d).getTime() / 86400000);
}

function prettifyDate(dateKey: string): string {
  const parts = dateKey.split("/");
  if (parts.length !== 3) return dateKey;
  const [d, m, y] = parts;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthIndex = Number(m) - 1;
  return `${Number(d)} ${monthNames[monthIndex] ?? m} ${y}`;
}

function prettifyMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthIndex = Number(m) - 1;
  return `${monthNames[monthIndex] ?? m} ${y}`;
}

/**
 * Personal records computed purely from existing analytics, streaks,
 * biggest days, busiest months. No AI, no backend calls: every input is
 * already in the Analytics payload, so these work identically for guests
 * and signed-in users.
 */
export function computeRecords(analytics: Analytics): ChatRecord[] {
  const records: ChatRecord[] = [];

  // Longest streak of consecutive days with at least one message
  const epochDays = Object.keys(analytics.activity.messagesByDate)
    .map(toEpochDays)
    .filter((day): day is number => day !== null)
    .sort((a, b) => a - b);

  if (epochDays.length > 0) {
    let bestStart = epochDays[0];
    let bestLength = 1;
    let currentStart = epochDays[0];
    let currentLength = 1;

    for (let i = 1; i < epochDays.length; i++) {
      if (epochDays[i] === epochDays[i - 1]) continue; // same day, no-op
      if (epochDays[i] === epochDays[i - 1] + 1) {
        currentLength += 1;
      } else {
        currentStart = epochDays[i];
        currentLength = 1;
      }
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    }

    const streakEnd = bestStart + bestLength - 1;
    // Epoch days → DD/MM/YYYY via UTC parts (immune to timezone shifts)
    const fmt = (days: number) => {
      const date = new Date(days * 86400000);
      const dd = String(date.getUTCDate()).padStart(2, "0");
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      return prettifyDate(`${dd}/${mm}/${date.getUTCFullYear()}`);
    };
    records.push({
      label: "Longest daily streak",
      value: String(bestLength),
      unit: bestLength === 1 ? "day" : "days",
      sub: bestLength > 1 ? `${fmt(bestStart)} → ${fmt(streakEnd)}` : fmt(bestStart),
      icon: "flame",
    });
  }

  // Biggest single day
  const dayEntries = Object.entries(analytics.activity.messagesByDate);
  if (dayEntries.length > 0) {
    const [bestDay, bestCount] = dayEntries.reduce(([bd, bc], [day, count]) =>
      count > bc ? [day, count] : [bd, bc]
    );
    records.push({
      label: "Biggest single day",
      value: bestCount.toLocaleString(),
      unit: "messages",
      sub: prettifyDate(bestDay),
      icon: "calendar",
    });
  }

  // Busiest month
  const busiest = [...(analytics.monthlyTrends || [])].sort(
    (a, b) => b.count - a.count
  )[0];
  if (busiest) {
    records.push({
      label: "Busiest month",
      value: busiest.count.toLocaleString(),
      unit: "messages",
      sub: prettifyMonth(busiest.month),
      icon: "trending",
    });
  }

  // Total words (nice round record)
  const totalWords = analytics.overview.totalWords;
  if (totalWords) {
    records.push({
      label: "Words exchanged",
      value: totalWords.toLocaleString(),
      unit: "words",
      icon: "type",
    });
  }

  return records;
}

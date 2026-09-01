// Date range and pixel-math helpers for the Gantt timeline.
// All dates are treated as local, midnight-aligned calendar days (no time-of-day).

export const RANGE_START = new Date(2026, 7, 1); // Aug 1, 2026
export const RANGE_END = new Date(2027, 4, 31); // May 31, 2027
export const DAY_WIDTH = 24; // px per day at default zoom

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysBetween(a, b) {
  const ms = startOfDay(b) - startOfDay(a);
  return Math.round(ms / 86400000);
}

export function clampToRange(date) {
  if (date < RANGE_START) return new Date(RANGE_START);
  if (date > RANGE_END) return new Date(RANGE_END);
  return date;
}

export function dateToX(date) {
  return daysBetween(RANGE_START, date) * DAY_WIDTH;
}

export function xToDate(x, dayWidth = DAY_WIDTH) {
  const dayOffset = Math.round(x / dayWidth);
  return addDays(RANGE_START, dayOffset);
}

export function totalDays() {
  return daysBetween(RANGE_START, RANGE_END) + 1;
}

export function totalWidth() {
  return totalDays() * DAY_WIDTH;
}

export function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISO(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatShort(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthsInRange() {
  const months = [];
  let cursor = new Date(RANGE_START.getFullYear(), RANGE_START.getMonth(), 1);
  while (cursor <= RANGE_END) {
    const monthStart = cursor < RANGE_START ? RANGE_START : cursor;
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const monthEnd = nextMonth > RANGE_END ? RANGE_END : addDays(nextMonth, -1);
    months.push({
      label: `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`,
      start: monthStart,
      end: monthEnd,
      dayCount: daysBetween(monthStart, monthEnd) + 1,
    });
    cursor = nextMonth;
  }
  return months;
}

export function getWeekStarts() {
  const weeks = [];
  let cursor = new Date(RANGE_START);
  // Align to the Monday on/before RANGE_START for consistent weekly gridlines.
  const dow = cursor.getDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  cursor = addDays(cursor, -backToMonday);
  while (cursor <= RANGE_END) {
    if (cursor >= RANGE_START) weeks.push(new Date(cursor));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function isToday(date) {
  const today = startOfDay(new Date());
  return startOfDay(date).getTime() === today.getTime();
}

export function todayInRange() {
  const today = startOfDay(new Date());
  return today >= RANGE_START && today <= RANGE_END;
}

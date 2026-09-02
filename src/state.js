// Pure, storage-agnostic helpers over the {members, groups, tasks, timeEntries} shape.
// Firestore (src/store.js) is the source of truth; these just read/validate that shape.

export const MEMBER_COLORS = ['#4C6EF5', '#F76707', '#12B886', '#E64980', '#FAB005', '#7048E8', '#15AABF', '#82C91E'];
export const STATUS_VALUES = ['not-started', 'in-progress', 'done', 'blocked'];

export function getTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId) || null;
}

export function getMember(state, email) {
  return state.members.find((m) => m.id === email) || null;
}

export function isAdmin(state, email) {
  const m = getMember(state, email);
  return !!m && m.role === 'admin';
}

export function dependsOnTransitively(state, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  const task = getTask(state, fromId);
  if (!task) return false;
  return (task.dependencyIds || []).some((depId) => dependsOnTransitively(state, depId, targetId, seen));
}

export function totalCost(state) {
  return (state.timeEntries || []).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
}

export function totalHours(state) {
  return (state.timeEntries || []).reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
}

export function costByMember(state) {
  const totals = new Map();
  for (const e of state.timeEntries || []) {
    const cur = totals.get(e.memberEmail) || { hours: 0, cost: 0 };
    cur.hours += Number(e.hours) || 0;
    cur.cost += Number(e.cost) || 0;
    totals.set(e.memberEmail, cur);
  }
  return totals;
}

// Pure, storage-agnostic helpers over the {assignees, groups, tasks} shape.
// Firestore (src/store.js) is the source of truth; these just read/validate that shape.

export const ASSIGNEE_COLORS = ['#4C6EF5', '#F76707', '#12B886', '#E64980', '#FAB005'];
export const STATUS_VALUES = ['not-started', 'in-progress', 'done', 'blocked'];

export function getTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId) || null;
}

export function getAssignee(state, assigneeId) {
  return state.assignees.find((a) => a.id === assigneeId) || null;
}

export function dependsOnTransitively(state, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  const task = getTask(state, fromId);
  if (!task) return false;
  return (task.dependencyIds || []).some((depId) => dependsOnTransitively(state, depId, targetId, seen));
}

// In-memory Gantt state: shape, defaults, and mutation helpers.
// The whole object is what gets read from / written to gantt-data.json.

import { formatISO, addDays, RANGE_START } from './dates.js';

export const SCHEMA_VERSION = 1;

export const ASSIGNEE_COLORS = ['#4C6EF5', '#F76707', '#12B886', '#E64980', '#FAB005'];

export const STATUS_VALUES = ['not-started', 'in-progress', 'done', 'blocked'];

function uid(prefix) {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    .replace(/-/g, '')
    .slice(0, 10);
  return `${prefix}_${rand}`;
}

export function createDefaultState() {
  const g1 = uid('g');
  const t1 = uid('t');
  const t2 = uid('t');
  const start1 = RANGE_START;
  const end1 = addDays(start1, 9);
  const start2 = addDays(end1, 1);
  const end2 = addDays(start2, 13);

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { lastEditedBy: '', lastEditedAt: '' },
    assignees: [
      { id: 'p1', name: 'Person 1', color: ASSIGNEE_COLORS[0] },
      { id: 'p2', name: 'Person 2', color: ASSIGNEE_COLORS[1] },
      { id: 'p3', name: 'Person 3', color: ASSIGNEE_COLORS[2] },
      { id: 'p4', name: 'Person 4', color: ASSIGNEE_COLORS[3] },
      { id: 'p5', name: 'Person 5', color: ASSIGNEE_COLORS[4] },
    ],
    groups: [
      { id: g1, name: 'Phase 1 — Kickoff', collapsed: false, order: 0 },
    ],
    tasks: [
      {
        id: t1, groupId: g1, name: 'Project kickoff meeting',
        start: formatISO(start1), end: formatISO(end1),
        assigneeIds: ['p1'], dependencyIds: [], status: 'not-started', order: 0,
      },
      {
        id: t2, groupId: g1, name: 'Requirements gathering',
        start: formatISO(start2), end: formatISO(end2),
        assigneeIds: ['p2', 'p3'], dependencyIds: [t1], status: 'not-started', order: 1,
      },
    ],
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

// --- Groups ---

export function addGroup(state, name) {
  const order = state.groups.length ? Math.max(...state.groups.map((g) => g.order)) + 1 : 0;
  const group = { id: uid('g'), name: name || 'New Group', collapsed: false, order };
  state.groups.push(group);
  return group;
}

export function removeGroup(state, groupId) {
  state.groups = state.groups.filter((g) => g.id !== groupId);
  const removedTaskIds = new Set(state.tasks.filter((t) => t.groupId === groupId).map((t) => t.id));
  state.tasks = state.tasks.filter((t) => t.groupId !== groupId);
  state.tasks.forEach((t) => {
    t.dependencyIds = t.dependencyIds.filter((id) => !removedTaskIds.has(id));
  });
}

export function toggleGroupCollapsed(state, groupId) {
  const g = state.groups.find((g) => g.id === groupId);
  if (g) g.collapsed = !g.collapsed;
}

export function renameGroup(state, groupId, name) {
  const g = state.groups.find((g) => g.id === groupId);
  if (g) g.name = name;
}

// --- Tasks ---

export function addTask(state, groupId, overrides = {}) {
  const tasksInGroup = state.tasks.filter((t) => t.groupId === groupId);
  const order = tasksInGroup.length ? Math.max(...tasksInGroup.map((t) => t.order)) + 1 : 0;
  const start = overrides.start || formatISO(RANGE_START);
  const end = overrides.end || formatISO(addDays(RANGE_START, 4));
  const task = {
    id: uid('t'),
    groupId,
    name: overrides.name || 'New Task',
    start,
    end,
    assigneeIds: overrides.assigneeIds || [],
    dependencyIds: overrides.dependencyIds || [],
    status: overrides.status || 'not-started',
    order,
  };
  state.tasks.push(task);
  return task;
}

export function removeTask(state, taskId) {
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  state.tasks.forEach((t) => {
    t.dependencyIds = t.dependencyIds.filter((id) => id !== taskId);
  });
}

export function updateTask(state, taskId, patch) {
  const t = state.tasks.find((t) => t.id === taskId);
  if (!t) return null;
  Object.assign(t, patch);
  if (t.start > t.end) {
    // keep bar valid: never let start pass end
    if ('start' in patch) t.end = t.start;
    else t.start = t.end;
  }
  return t;
}

export function getTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId) || null;
}

// --- Dependencies ---

function dependsOnTransitively(state, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  const task = getTask(state, fromId);
  if (!task) return false;
  return task.dependencyIds.some((depId) => dependsOnTransitively(state, depId, targetId, seen));
}

// Returns null on success, or an error message string if the link is invalid.
export function addDependency(state, taskId, dependsOnId) {
  if (taskId === dependsOnId) return "A task can't depend on itself.";
  const task = getTask(state, taskId);
  if (!task) return 'Task not found.';
  if (task.dependencyIds.includes(dependsOnId)) return null; // already linked, no-op
  // Adding taskId -> dependsOnId creates a cycle if dependsOnId already
  // (transitively) depends on taskId.
  if (dependsOnTransitively(state, dependsOnId, taskId)) {
    return 'That would create a circular dependency.';
  }
  task.dependencyIds.push(dependsOnId);
  return null;
}

export function removeDependency(state, taskId, dependsOnId) {
  const task = getTask(state, taskId);
  if (!task) return;
  task.dependencyIds = task.dependencyIds.filter((id) => id !== dependsOnId);
}

// --- Assignees ---

export function renameAssignee(state, assigneeId, name) {
  const a = state.assignees.find((a) => a.id === assigneeId);
  if (a) a.name = name;
}

export function getAssignee(state, assigneeId) {
  return state.assignees.find((a) => a.id === assigneeId) || null;
}

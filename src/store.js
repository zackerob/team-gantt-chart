// Firestore-backed persistence: realtime listeners mirror the DB into a local
// {assignees, groups, tasks} object, and every write goes straight to Firestore —
// the realtime listener is what re-renders, for the current user and everyone else.

import {
  db, collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, query,
} from './firebaseApp.js';
import { ASSIGNEE_COLORS, dependsOnTransitively } from './state.js';
import { RANGE_START, addDays, formatISO } from './dates.js';

const groupsCol = () => collection(db, 'groups');
const tasksCol = () => collection(db, 'tasks');
const assigneesCol = () => collection(db, 'assignees');

const mirrored = { assignees: [], groups: [], tasks: [] };
let actorName = 'Unknown';

export function setActor(name) {
  actorName = name || 'Unknown';
}

export function getMirroredState() {
  return mirrored;
}

export function subscribe(onChange) {
  const emit = () => onChange(mirrored);
  const unsubA = onSnapshot(query(assigneesCol()), (snap) => {
    mirrored.assignees = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    emit();
  });
  const unsubG = onSnapshot(query(groupsCol()), (snap) => {
    mirrored.groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    emit();
  });
  const unsubT = onSnapshot(query(tasksCol()), (snap) => {
    mirrored.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    emit();
  });
  return () => { unsubA(); unsubG(); unsubT(); };
}

// One-time seed for a brand new Firebase project. No-ops if assignees already exist.
export async function ensureSeeded() {
  const existing = await getDocs(query(assigneesCol()));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  for (let i = 0; i < 5; i++) {
    batch.set(doc(db, 'assignees', `p${i + 1}`), { name: `Person ${i + 1}`, color: ASSIGNEE_COLORS[i], order: i });
  }
  const g1 = doc(groupsCol());
  batch.set(g1, { name: 'Phase 1 — Kickoff', collapsed: false, order: 0 });

  const start1 = RANGE_START;
  const end1 = addDays(start1, 9);
  const start2 = addDays(end1, 1);
  const end2 = addDays(start2, 13);
  const t1 = doc(tasksCol());
  batch.set(t1, {
    groupId: g1.id, name: 'Project kickoff meeting', start: formatISO(start1), end: formatISO(end1),
    assigneeIds: ['p1'], dependencyIds: [], status: 'not-started', order: 0,
    updatedBy: 'system', updatedAt: serverTimestamp(),
  });
  const t2 = doc(tasksCol());
  batch.set(t2, {
    groupId: g1.id, name: 'Requirements gathering', start: formatISO(start2), end: formatISO(end2),
    assigneeIds: ['p2', 'p3'], dependencyIds: [t1.id], status: 'not-started', order: 1,
    updatedBy: 'system', updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

// --- Groups ---

export async function createGroup(name) {
  const orders = mirrored.groups.map((g) => g.order ?? 0);
  const order = orders.length ? Math.max(...orders) + 1 : 0;
  const ref = doc(groupsCol());
  await setDoc(ref, { name: name || 'New Group', collapsed: false, order });
  return ref.id;
}

export async function renameGroupDoc(groupId, name) {
  await updateDoc(doc(db, 'groups', groupId), { name });
}

export async function toggleGroupCollapsedDoc(groupId) {
  const g = mirrored.groups.find((g) => g.id === groupId);
  if (!g) return;
  await updateDoc(doc(db, 'groups', groupId), { collapsed: !g.collapsed });
}

export async function deleteGroupDoc(groupId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'groups', groupId));

  const removedTasks = mirrored.tasks.filter((t) => t.groupId === groupId);
  const removedIds = new Set(removedTasks.map((t) => t.id));
  removedTasks.forEach((t) => batch.delete(doc(db, 'tasks', t.id)));

  mirrored.tasks
    .filter((t) => !removedIds.has(t.id) && (t.dependencyIds || []).some((id) => removedIds.has(id)))
    .forEach((t) => {
      batch.update(doc(db, 'tasks', t.id), { dependencyIds: t.dependencyIds.filter((id) => !removedIds.has(id)) });
    });

  await batch.commit();
}

// --- Tasks ---

export async function createTask(groupId, overrides = {}) {
  const tasksInGroup = mirrored.tasks.filter((t) => t.groupId === groupId);
  const order = tasksInGroup.length ? Math.max(...tasksInGroup.map((t) => t.order ?? 0)) + 1 : 0;
  const ref = doc(tasksCol());
  await setDoc(ref, {
    groupId,
    name: overrides.name || 'New Task',
    start: overrides.start || formatISO(RANGE_START),
    end: overrides.end || formatISO(addDays(RANGE_START, 4)),
    assigneeIds: overrides.assigneeIds || [],
    dependencyIds: overrides.dependencyIds || [],
    status: overrides.status || 'not-started',
    order,
    updatedBy: actorName,
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTaskDoc(taskId, patch) {
  const current = mirrored.tasks.find((t) => t.id === taskId);
  const clean = { ...patch };
  if (current) {
    const start = clean.start ?? current.start;
    const end = clean.end ?? current.end;
    if (start > end) {
      if ('start' in clean) clean.end = clean.start;
      else clean.start = clean.end;
    }
  }
  await updateDoc(doc(db, 'tasks', taskId), { ...clean, updatedBy: actorName, updatedAt: serverTimestamp() });
}

export async function deleteTaskDoc(taskId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'tasks', taskId));
  mirrored.tasks
    .filter((t) => (t.dependencyIds || []).includes(taskId))
    .forEach((t) => {
      batch.update(doc(db, 'tasks', t.id), { dependencyIds: t.dependencyIds.filter((id) => id !== taskId) });
    });
  await batch.commit();
}

// --- Dependencies (validated locally against the mirrored state, then written) ---

export function checkAddDependency(taskId, dependsOnId) {
  if (taskId === dependsOnId) return "A task can't depend on itself.";
  const task = mirrored.tasks.find((t) => t.id === taskId);
  if (!task) return 'Task not found.';
  if ((task.dependencyIds || []).includes(dependsOnId)) return null;
  if (dependsOnTransitively(mirrored, dependsOnId, taskId)) return 'That would create a circular dependency.';
  return null;
}

export async function addDependencyDoc(taskId, dependsOnId) {
  const err = checkAddDependency(taskId, dependsOnId);
  if (err) return err;
  const task = mirrored.tasks.find((t) => t.id === taskId);
  if ((task.dependencyIds || []).includes(dependsOnId)) return null;
  await updateTaskDoc(taskId, { dependencyIds: [...(task.dependencyIds || []), dependsOnId] });
  return null;
}

export async function removeDependencyDoc(taskId, dependsOnId) {
  const task = mirrored.tasks.find((t) => t.id === taskId);
  if (!task) return;
  await updateTaskDoc(taskId, { dependencyIds: (task.dependencyIds || []).filter((id) => id !== dependsOnId) });
}

// --- Assignees ---

export async function renameAssigneeDoc(assigneeId, name) {
  await updateDoc(doc(db, 'assignees', assigneeId), { name });
}

// --- Backup / restore (manual, in addition to Firestore's own durability) ---

export function exportJSON() {
  const json = JSON.stringify(mirrored, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gantt-data-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Bulk-writes a previously exported (or old local-file format) JSON blob into
// Firestore, replacing whatever is currently there. Used for one-off migration.
export async function importState(parsed) {
  const existingGroups = await getDocs(groupsCol());
  const existingTasks = await getDocs(tasksCol());
  const batch = writeBatch(db);
  existingGroups.forEach((d) => batch.delete(d.ref));
  existingTasks.forEach((d) => batch.delete(d.ref));

  for (const a of parsed.assignees || []) {
    batch.set(doc(db, 'assignees', a.id), { name: a.name, color: a.color, order: a.order ?? 0 });
  }
  for (const g of parsed.groups || []) {
    batch.set(doc(db, 'groups', g.id), { name: g.name, collapsed: !!g.collapsed, order: g.order ?? 0 });
  }
  for (const t of parsed.tasks || []) {
    batch.set(doc(db, 'tasks', t.id), {
      groupId: t.groupId, name: t.name, start: t.start, end: t.end,
      assigneeIds: t.assigneeIds || [], dependencyIds: t.dependencyIds || [],
      status: t.status || 'not-started', order: t.order ?? 0,
      updatedBy: actorName, updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

// Firestore-backed persistence: realtime listeners mirror the DB into a local
// {members, groups, tasks, timeEntries} object, and every write goes straight to
// Firestore — the realtime listener is what re-renders, for the current user and
// everyone else.

import {
  db, collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, query,
} from './firebaseApp.js';
import { MEMBER_COLORS, dependsOnTransitively } from './state.js';
import { RANGE_START, addDays, formatISO } from './dates.js';

const membersCol = () => collection(db, 'members');
const groupsCol = () => collection(db, 'groups');
const tasksCol = () => collection(db, 'tasks');
const timeEntriesCol = () => collection(db, 'timeEntries');
const budgetCategoriesCol = () => collection(db, 'budgetCategories');
const budgetItemsCol = () => collection(db, 'budgetItems');
const expensesCol = () => collection(db, 'expenses');
const budgetMetaRef = () => doc(db, 'budgetMeta', 'summary');

const mirrored = {
  members: [], groups: [], tasks: [], timeEntries: [],
  budgetCategories: [], budgetItems: [], expenses: [], budgetMeta: { productionQuantity: 0 },
  loaded: {
    members: false, groups: false, tasks: false, timeEntries: false,
    budgetCategories: false, budgetItems: false, expenses: false, budgetMeta: false,
  },
};
let actorEmail = '';
let actorName = 'Unknown';

export function setActor(name, email) {
  actorName = name || 'Unknown';
  actorEmail = email || '';
}

export function getMirroredState() {
  return mirrored;
}

// onChange fires on every successful snapshot (check mirrored.loaded to know
// which collections have delivered at least once — useful to avoid treating
// "haven't loaded yet" as "genuinely empty"). onError fires (repeatedly, once
// per collection) if reads are rejected — typically means the signed-in user
// isn't in `members` yet, so Firestore rules deny them before they can even
// read the members list to find that out.
export function subscribe(onChange, onError) {
  const emit = () => onChange(mirrored);
  const fail = (err) => { if (onError) onError(err); };

  const unsubM = onSnapshot(query(membersCol()), (snap) => {
    mirrored.members = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    mirrored.loaded.members = true;
    emit();
  }, fail);
  const unsubG = onSnapshot(query(groupsCol()), (snap) => {
    mirrored.groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mirrored.loaded.groups = true;
    emit();
  }, fail);
  const unsubT = onSnapshot(query(tasksCol()), (snap) => {
    mirrored.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mirrored.loaded.tasks = true;
    emit();
  }, fail);
  const unsubTE = onSnapshot(query(timeEntriesCol()), (snap) => {
    mirrored.timeEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mirrored.loaded.timeEntries = true;
    emit();
  }, fail);
  const unsubBC = onSnapshot(query(budgetCategoriesCol()), (snap) => {
    mirrored.budgetCategories = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    mirrored.loaded.budgetCategories = true;
    emit();
  }, fail);
  const unsubBI = onSnapshot(query(budgetItemsCol()), (snap) => {
    mirrored.budgetItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mirrored.loaded.budgetItems = true;
    emit();
  }, fail);
  const unsubEx = onSnapshot(query(expensesCol()), (snap) => {
    mirrored.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mirrored.loaded.expenses = true;
    emit();
  }, fail);
  const unsubBM = onSnapshot(budgetMetaRef(), (snap) => {
    mirrored.budgetMeta = snap.exists() ? snap.data() : { productionQuantity: 0 };
    mirrored.loaded.budgetMeta = true;
    emit();
  }, fail);
  return () => { unsubM(); unsubG(); unsubT(); unsubTE(); unsubBC(); unsubBI(); unsubEx(); unsubBM(); };
}

// Seeds an example group + tasks the first time the board is empty. Never
// touches `members` — the first member (an admin) has to be created by hand
// in the Firebase console, since Firestore rules can't safely bootstrap trust
// for who's allowed to write the very first membership record. See README.
export async function ensureSeeded() {
  const existing = await getDocs(query(groupsCol()));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  const g1 = doc(groupsCol());
  batch.set(g1, { name: 'Phase 1 — Kickoff', collapsed: false, order: 0 });

  const start1 = RANGE_START;
  const end1 = addDays(start1, 9);
  const start2 = addDays(end1, 1);
  const end2 = addDays(start2, 13);
  const t1 = doc(tasksCol());
  batch.set(t1, {
    groupId: g1.id, name: 'Project kickoff meeting', start: formatISO(start1), end: formatISO(end1),
    assigneeIds: [], dependencyIds: [], status: 'not-started', order: 0,
    updatedBy: 'system', updatedAt: serverTimestamp(),
  });
  const t2 = doc(tasksCol());
  batch.set(t2, {
    groupId: g1.id, name: 'Requirements gathering', start: formatISO(start2), end: formatISO(end2),
    assigneeIds: [], dependencyIds: [t1.id], status: 'not-started', order: 1,
    updatedBy: 'system', updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

// Seeds the budget baseline (categories + line items) from the team's original
// spreadsheet, the first time budgetCategories is empty. Numbers below are the
// "Planned" column from that sheet; "Actual" starts at 0 and fills in from
// logged expenses / manual entry. One deviation from the sheet's layout: "10%
// Contingency" is its own category rather than nested under "Other Expenses",
// since here every category total is always a strict sum of its own items
// (the original sheet's "Other Expenses" bold total didn't include it either
// — 245 vs. 245+626.3 — so this keeps the same numbers without a special case).
export async function ensureBudgetSeeded() {
  const existing = await getDocs(query(budgetCategoriesCol()));
  if (!existing.empty) return;

  const batch = writeBatch(db);
  const newItemFields = (categoryId, name, order, overrides = {}) => ({
    categoryId, name, order,
    plannedIncome: 0, plannedExpense: 0, plannedCostPerUnit: 0,
    actualIncome: 0, actualCostPerUnit: 0,
    ...overrides,
  });
  const addCategory = (name, order) => {
    const ref = doc(budgetCategoriesCol());
    batch.set(ref, { name, order });
    return ref.id;
  };
  const addItem = (categoryId, name, order, overrides) => {
    batch.set(doc(budgetItemsCol()), newItemFields(categoryId, name, order, overrides));
  };

  const donations = addCategory('Donations/Income', 0);
  addItem(donations, 'Pitt Power Fundraising', 0);
  addItem(donations, 'Langford Fund', 1, { plannedIncome: 1000 });
  addItem(donations, 'Others', 2);

  const transportation = addCategory('Transportation', 1);
  addItem(transportation, 'Food', 0, { plannedExpense: 1680 });
  addItem(transportation, 'Travel', 1, { plannedExpense: 2107 });
  addItem(transportation, 'Lodging', 2, { plannedExpense: 881 });

  const materials = addCategory('Materials/Fixtures', 2);
  addItem(materials, 'Raw Material', 0);
  addItem(materials, 'Fasteners/Hardware', 1, { plannedExpense: 100 });
  addItem(materials, 'Tooling/Fixtures', 2, { plannedExpense: 1200 });

  const manufacturing = addCategory('Manufacturing/Prototype', 3);
  addItem(manufacturing, 'Prototype Materials', 0, { plannedExpense: 50 });
  addItem(manufacturing, 'Purchased Components', 1);
  addItem(manufacturing, 'Manufacturing Costs', 2);
  addItem(manufacturing, 'Shipping', 3);

  const other = addCategory('Other Expenses', 4);
  addItem(other, 'Miscellaneous', 0);
  addItem(other, 'Uniforms', 1, { plannedExpense: 245 });

  const contingency = addCategory('Contingency', 5);
  addItem(contingency, '10% Contingency', 0, { plannedExpense: 626.3 });

  batch.set(budgetMetaRef(), { productionQuantity: 0 }, { merge: true });
  await batch.commit();
}

// --- Members ---

export async function createMember(email, name) {
  const orders = mirrored.members.map((m) => m.order ?? 0);
  const order = orders.length ? Math.max(...orders) + 1 : 0;
  await setDoc(doc(db, 'members', email), {
    name: name || email,
    color: MEMBER_COLORS[order % MEMBER_COLORS.length],
    role: 'member',
    hourlyRate: 0,
    order,
  });
}

export async function deleteMemberDoc(email) {
  await deleteDoc(doc(db, 'members', email));
}

export async function setMemberRole(email, role) {
  await updateDoc(doc(db, 'members', email), { role });
}

export async function renameMemberDoc(email, name) {
  await updateDoc(doc(db, 'members', email), { name });
}

export async function setOwnHourlyRate(email, rate) {
  await updateDoc(doc(db, 'members', email), { hourlyRate: Number(rate) || 0 });
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
    startTime: overrides.startTime || '',
    endTime: overrides.endTime || '',
    description: overrides.description || '',
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

// --- Time entries ---

export async function createTimeEntry(entry) {
  const ref = doc(timeEntriesCol());
  await setDoc(ref, {
    memberEmail: entry.memberEmail,
    taskId: entry.taskId || null,
    date: entry.date,
    hours: Number(entry.hours) || 0,
    cost: Number(entry.cost) || 0,
    note: entry.note || '',
    createdBy: actorName,
    createdAt: serverTimestamp(),
  });
}

export async function deleteTimeEntryDoc(entryId) {
  await deleteDoc(doc(db, 'timeEntries', entryId));
}

// --- Budget categories ---

export async function createBudgetCategory(name) {
  const orders = mirrored.budgetCategories.map((c) => c.order ?? 0);
  const order = orders.length ? Math.max(...orders) + 1 : 0;
  const ref = doc(budgetCategoriesCol());
  await setDoc(ref, { name: name || 'New Category', order });
  return ref.id;
}

export async function renameBudgetCategoryDoc(categoryId, name) {
  await updateDoc(doc(db, 'budgetCategories', categoryId), { name });
}

export async function deleteBudgetCategoryDoc(categoryId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'budgetCategories', categoryId));

  const removedItems = mirrored.budgetItems.filter((i) => i.categoryId === categoryId);
  const removedIds = new Set(removedItems.map((i) => i.id));
  removedItems.forEach((i) => batch.delete(doc(db, 'budgetItems', i.id)));

  // Expenses logged against a deleted item become "unassigned" rather than
  // being deleted too — the money was still spent, it just loses its category.
  mirrored.expenses
    .filter((e) => removedIds.has(e.budgetItemId))
    .forEach((e) => batch.update(doc(db, 'expenses', e.id), { budgetItemId: null }));

  await batch.commit();
}

// --- Budget items ---

export async function createBudgetItem(categoryId, name) {
  const itemsInCat = mirrored.budgetItems.filter((i) => i.categoryId === categoryId);
  const order = itemsInCat.length ? Math.max(...itemsInCat.map((i) => i.order ?? 0)) + 1 : 0;
  const ref = doc(budgetItemsCol());
  await setDoc(ref, {
    categoryId, name: name || 'New Item', order,
    plannedIncome: 0, plannedExpense: 0, plannedCostPerUnit: 0,
    actualIncome: 0, actualCostPerUnit: 0,
  });
  return ref.id;
}

export async function updateBudgetItemDoc(itemId, patch) {
  await updateDoc(doc(db, 'budgetItems', itemId), patch);
}

export async function deleteBudgetItemDoc(itemId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'budgetItems', itemId));
  mirrored.expenses
    .filter((e) => e.budgetItemId === itemId)
    .forEach((e) => batch.update(doc(db, 'expenses', e.id), { budgetItemId: null }));
  await batch.commit();
}

// --- Expenses (actual purchases, optionally assigned to a budget item) ---

export async function createExpense(entry) {
  const ref = doc(expensesCol());
  await setDoc(ref, {
    budgetItemId: entry.budgetItemId || null,
    description: entry.description || '',
    amount: Number(entry.amount) || 0,
    date: entry.date,
    memberEmail: actorEmail,
    loggedBy: actorName,
    createdAt: serverTimestamp(),
  });
}

export async function deleteExpenseDoc(expenseId) {
  await deleteDoc(doc(db, 'expenses', expenseId));
}

// --- Production summary ---

export async function setProductionQuantity(qty) {
  await setDoc(budgetMetaRef(), { productionQuantity: Number(qty) || 0 }, { merge: true });
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

// Bulk-writes a previously exported JSON blob into Firestore, replacing groups
// and tasks (not members — membership stays admin-managed, not import-managed).
export async function importState(parsed) {
  const existingGroups = await getDocs(groupsCol());
  const existingTasks = await getDocs(tasksCol());
  const batch = writeBatch(db);
  existingGroups.forEach((d) => batch.delete(d.ref));
  existingTasks.forEach((d) => batch.delete(d.ref));

  for (const g of parsed.groups || []) {
    batch.set(doc(db, 'groups', g.id), { name: g.name, collapsed: !!g.collapsed, order: g.order ?? 0 });
  }
  for (const t of parsed.tasks || []) {
    batch.set(doc(db, 'tasks', t.id), {
      groupId: t.groupId, name: t.name, start: t.start, end: t.end,
      startTime: t.startTime || '', endTime: t.endTime || '', description: t.description || '',
      assigneeIds: t.assigneeIds || [], dependencyIds: t.dependencyIds || [],
      status: t.status || 'not-started', order: t.order ?? 0,
      updatedBy: actorName, updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

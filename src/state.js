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

// --- Budget ---

export function budgetItemsForCategory(state, categoryId) {
  return (state.budgetItems || [])
    .filter((i) => i.categoryId === categoryId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getBudgetItem(state, itemId) {
  return (state.budgetItems || []).find((i) => i.id === itemId) || null;
}

// Actual expense per item isn't stored on the item itself — it's the sum of
// logged expenses assigned to it, the same way actual cost derives from
// timeEntries rather than being a field on a task.
export function actualExpenseForItem(state, itemId) {
  return (state.expenses || [])
    .filter((e) => e.budgetItemId === itemId)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

export function unassignedActualExpense(state) {
  return (state.expenses || [])
    .filter((e) => !e.budgetItemId)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

export function categoryTotals(state, categoryId) {
  return budgetItemsForCategory(state, categoryId).reduce((t, item) => {
    t.plannedIncome += Number(item.plannedIncome) || 0;
    t.plannedExpense += Number(item.plannedExpense) || 0;
    t.actualIncome += Number(item.actualIncome) || 0;
    t.actualExpense += actualExpenseForItem(state, item.id);
    return t;
  }, { plannedIncome: 0, plannedExpense: 0, actualIncome: 0, actualExpense: 0 });
}

export function grandBudgetTotals(state) {
  const totals = (state.budgetCategories || []).reduce((t, cat) => {
    const c = categoryTotals(state, cat.id);
    t.plannedIncome += c.plannedIncome;
    t.plannedExpense += c.plannedExpense;
    t.actualIncome += c.actualIncome;
    t.actualExpense += c.actualExpense;
    return t;
  }, { plannedIncome: 0, plannedExpense: 0, actualIncome: 0, actualExpense: 0 });
  totals.actualExpense += unassignedActualExpense(state); // expenses not tied to any item still count toward the total
  return totals;
}

export function perUnitCost(total, quantity) {
  const qty = Number(quantity) || 0;
  return qty > 0 ? total / qty : 0;
}

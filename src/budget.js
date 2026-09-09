import {
  budgetItemsForCategory, getBudgetItem, actualExpenseForItem,
  categoryTotals, grandBudgetTotals, perUnitCost,
} from './state.js';
import { formatISO } from './dates.js';

function money(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function optionEl(value, text, selected) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  if (selected) o.selected = true;
  return o;
}

function numberCell(value, onCommit, { step = '0.01', readOnly = false } = {}) {
  const td = document.createElement('td');
  if (readOnly) {
    td.textContent = money(value);
    td.className = 'budget-readonly-cell';
    return td;
  }
  const input = document.createElement('input');
  input.type = 'number';
  input.step = step;
  input.value = Number(value) || 0;
  input.className = 'budget-num-input';
  input.addEventListener('change', () => onCommit(input.value));
  td.appendChild(input);
  return td;
}

function dashCell() {
  const td = document.createElement('td');
  td.className = 'budget-readonly-cell budget-dash';
  td.textContent = '—';
  return td;
}

// ---------- Budget table ----------

function renderBudgetTable(state, refs, api) {
  refs.budgetTableBody.innerHTML = '';

  for (const cat of state.budgetCategories) {
    const totals = categoryTotals(state, cat.id);

    const catRow = document.createElement('tr');
    catRow.className = 'budget-cat-row';

    const nameTd = document.createElement('td');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = cat.name;
    nameInput.className = 'budget-cat-name-input';
    nameInput.addEventListener('change', () => {
      api.renameBudgetCategory(cat.id, nameInput.value.trim() || cat.name).catch(() => api.toast('Could not rename category.'));
    });
    nameTd.appendChild(nameInput);
    catRow.appendChild(nameTd);

    catRow.appendChild(numberCell(totals.plannedIncome, null, { readOnly: true }));
    catRow.appendChild(numberCell(totals.plannedExpense, null, { readOnly: true }));
    catRow.appendChild(dashCell());
    catRow.appendChild(numberCell(totals.actualIncome, null, { readOnly: true }));
    catRow.appendChild(numberCell(totals.actualExpense, null, { readOnly: true }));
    catRow.appendChild(dashCell());

    const actionsTd = document.createElement('td');
    actionsTd.className = 'budget-actions-cell';
    const addItemBtn = document.createElement('button');
    addItemBtn.type = 'button';
    addItemBtn.className = 'row-icon-btn';
    addItemBtn.textContent = '+';
    addItemBtn.title = 'Add line item';
    addItemBtn.addEventListener('click', () => {
      api.createBudgetItem(cat.id).catch(() => api.toast('Could not add item.'));
    });
    const removeCatBtn = document.createElement('button');
    removeCatBtn.type = 'button';
    removeCatBtn.className = 'row-icon-btn danger';
    removeCatBtn.textContent = '×';
    removeCatBtn.title = 'Remove category and its items';
    removeCatBtn.addEventListener('click', () => {
      if (confirm(`Remove "${cat.name}" and all its line items? Any logged expenses against them become unassigned.`)) {
        api.removeBudgetCategory(cat.id).catch(() => api.toast('Could not remove category.'));
      }
    });
    actionsTd.appendChild(addItemBtn);
    actionsTd.appendChild(removeCatBtn);
    catRow.appendChild(actionsTd);

    refs.budgetTableBody.appendChild(catRow);

    for (const item of budgetItemsForCategory(state, cat.id)) {
      const row = document.createElement('tr');
      row.className = 'budget-item-row';

      const nameCell = document.createElement('td');
      const itemNameInput = document.createElement('input');
      itemNameInput.type = 'text';
      itemNameInput.value = item.name;
      itemNameInput.className = 'budget-item-name-input';
      itemNameInput.addEventListener('change', () => {
        api.updateBudgetItem(item.id, { name: itemNameInput.value.trim() || item.name }).catch(() => api.toast('Could not rename item.'));
      });
      nameCell.appendChild(itemNameInput);
      row.appendChild(nameCell);

      row.appendChild(numberCell(item.plannedIncome, (v) => api.updateBudgetItem(item.id, { plannedIncome: Number(v) || 0 })));
      row.appendChild(numberCell(item.plannedExpense, (v) => api.updateBudgetItem(item.id, { plannedExpense: Number(v) || 0 })));
      row.appendChild(numberCell(item.plannedCostPerUnit, (v) => api.updateBudgetItem(item.id, { plannedCostPerUnit: Number(v) || 0 })));
      row.appendChild(numberCell(item.actualIncome, (v) => api.updateBudgetItem(item.id, { actualIncome: Number(v) || 0 })));
      row.appendChild(numberCell(actualExpenseForItem(state, item.id), null, { readOnly: true }));
      row.appendChild(numberCell(item.actualCostPerUnit, (v) => api.updateBudgetItem(item.id, { actualCostPerUnit: Number(v) || 0 })));

      const itemActionsTd = document.createElement('td');
      itemActionsTd.className = 'budget-actions-cell';
      const removeItemBtn = document.createElement('button');
      removeItemBtn.type = 'button';
      removeItemBtn.className = 'row-icon-btn danger';
      removeItemBtn.textContent = '×';
      removeItemBtn.title = 'Remove line item';
      removeItemBtn.addEventListener('click', () => {
        api.removeBudgetItem(item.id).catch(() => api.toast('Could not remove item.'));
      });
      itemActionsTd.appendChild(removeItemBtn);
      row.appendChild(itemActionsTd);

      refs.budgetTableBody.appendChild(row);
    }
  }

  const grand = grandBudgetTotals(state);
  const grandRow = document.createElement('tr');
  grandRow.className = 'budget-grand-row';
  const grandLabelTd = document.createElement('td');
  grandLabelTd.textContent = 'Grand Total';
  grandRow.appendChild(grandLabelTd);
  grandRow.appendChild(numberCell(grand.plannedIncome, null, { readOnly: true }));
  grandRow.appendChild(numberCell(grand.plannedExpense, null, { readOnly: true }));
  grandRow.appendChild(dashCell());
  grandRow.appendChild(numberCell(grand.actualIncome, null, { readOnly: true }));
  grandRow.appendChild(numberCell(grand.actualExpense, null, { readOnly: true }));
  grandRow.appendChild(dashCell());
  grandRow.appendChild(document.createElement('td'));
  refs.budgetTableBody.appendChild(grandRow);

  return grand;
}

// ---------- Production summary ----------

function renderProductionSummary(state, refs, grand) {
  const qty = state.budgetMeta?.productionQuantity || 0;
  if (document.activeElement !== refs.budgetProductionQty) refs.budgetProductionQty.value = qty || '';
  refs.budgetPlannedCostPerUnit.textContent = money(perUnitCost(grand.plannedExpense, qty));
  refs.budgetActualCostPerUnit.textContent = money(perUnitCost(grand.actualExpense, qty));
}

// ---------- Expense log ----------

function renderExpenseForm(state, refs) {
  const prev = refs.expBudgetItem.value;
  refs.expBudgetItem.innerHTML = '';
  refs.expBudgetItem.appendChild(optionEl('', '— General (not tied to a budget item) —', !prev));
  for (const cat of state.budgetCategories) {
    const items = budgetItemsForCategory(state, cat.id);
    if (items.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = cat.name;
    for (const item of items) {
      group.appendChild(optionEl(item.id, item.name, item.id === prev));
    }
    refs.expBudgetItem.appendChild(group);
  }
  if (!refs.expDate.value) refs.expDate.value = formatISO(new Date());
}

function budgetItemLabel(state, itemId) {
  if (!itemId) return 'General';
  const item = getBudgetItem(state, itemId);
  if (!item) return 'General';
  const cat = state.budgetCategories.find((c) => c.id === item.categoryId);
  return cat ? `${cat.name} — ${item.name}` : item.name;
}

function renderExpenseList(state, refs, currentUserEmail, isAdminUser) {
  refs.expEntriesBody.innerHTML = '';
  const entries = [...state.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const e of entries) {
    const tr = document.createElement('tr');
    const canRemove = isAdminUser || e.memberEmail === currentUserEmail;
    tr.innerHTML = `
      <td>${e.date || ''}</td>
      <td>${e.description ? String(e.description).replace(/</g, '&lt;') : ''}</td>
      <td>${budgetItemLabel(state, e.budgetItemId).replace(/</g, '&lt;')}</td>
      <td>${money(e.amount)}</td>
      <td>${e.loggedBy || ''}</td>
      <td></td>`;
    if (canRemove) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-icon-btn danger';
      btn.textContent = '×';
      btn.title = 'Remove expense';
      btn.dataset.action = 'remove-expense';
      btn.dataset.expenseId = e.id;
      tr.lastElementChild.appendChild(btn);
    }
    refs.expEntriesBody.appendChild(tr);
  }
}

export function renderBudget(state, refs, currentUserEmail, isAdminUser, api) {
  const grand = renderBudgetTable(state, refs, api);
  renderProductionSummary(state, refs, grand);
  renderExpenseForm(state, refs);
  renderExpenseList(state, refs, currentUserEmail, isAdminUser);
}

export function wireBudget(refs, api) {
  refs.addCategoryBtn.addEventListener('click', () => {
    api.createBudgetCategory('New Category').catch(() => api.toast('Could not add category.'));
  });

  refs.budgetProductionQty.addEventListener('change', () => {
    api.setProductionQuantity(refs.budgetProductionQty.value).catch(() => api.toast('Could not update production quantity.'));
  });

  refs.expEntryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseFloat(refs.expAmount.value) || 0;
    if (amount <= 0) { api.toast('Enter an amount greater than 0.'); return; }
    api.createExpense({
      description: refs.expDescription.value.trim(),
      amount: refs.expAmount.value,
      date: refs.expDate.value || formatISO(new Date()),
      budgetItemId: refs.expBudgetItem.value || null,
    }).catch(() => api.toast('Could not save that expense.'));
    refs.expDescription.value = '';
    refs.expAmount.value = '0';
  });

  refs.expEntriesBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-expense"]');
    if (!btn) return;
    api.removeExpense(btn.dataset.expenseId).catch(() => api.toast('Could not remove that expense.'));
  });
}

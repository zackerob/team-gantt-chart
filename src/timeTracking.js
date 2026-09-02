import { getMember, getTask, totalCost, totalHours, costByMember } from './state.js';
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

export function renderTimeCost(state, refs, currentUserEmail, isAdminUser) {
  refs.tcTotalHours.textContent = totalHours(state).toFixed(2);
  refs.tcTotalCost.textContent = money(totalCost(state));

  refs.tcBreakdownBody.innerHTML = '';
  const byMember = costByMember(state);
  for (const m of state.members) {
    const totals = byMember.get(m.id) || { hours: 0, cost: 0 };
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.name}</td><td>${totals.hours.toFixed(2)}</td><td>${money(totals.cost)}</td>`;
    refs.tcBreakdownBody.appendChild(tr);
  }

  const prevMember = refs.tcMember.value;
  refs.tcMember.innerHTML = '';
  const selectable = isAdminUser ? state.members : state.members.filter((m) => m.id === currentUserEmail);
  for (const m of selectable) {
    refs.tcMember.appendChild(optionEl(m.id, m.name, m.id === (prevMember || currentUserEmail)));
  }
  refs.tcMember.disabled = !isAdminUser;

  const prevTask = refs.tcTask.value;
  refs.tcTask.innerHTML = '';
  refs.tcTask.appendChild(optionEl('', '— General (no specific task) —', !prevTask));
  for (const t of state.tasks) {
    refs.tcTask.appendChild(optionEl(t.id, t.name, t.id === prevTask));
  }

  if (!refs.tcDate.value) refs.tcDate.value = formatISO(new Date());

  refs.tcEntriesBody.innerHTML = '';
  const entries = [...state.timeEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const e of entries) {
    const member = getMember(state, e.memberEmail);
    const task = e.taskId ? getTask(state, e.taskId) : null;
    const tr = document.createElement('tr');
    const canRemove = isAdminUser || e.memberEmail === currentUserEmail;
    tr.innerHTML = `
      <td>${e.date || ''}</td>
      <td>${member ? member.name : e.memberEmail}</td>
      <td>${task ? task.name : '—'}</td>
      <td>${Number(e.hours || 0).toFixed(2)}</td>
      <td>${money(e.cost)}</td>
      <td>${e.note ? String(e.note).replace(/</g, '&lt;') : ''}</td>
      <td></td>`;
    if (canRemove) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-icon-btn danger';
      btn.textContent = '×';
      btn.title = 'Remove entry';
      btn.dataset.action = 'remove-time-entry';
      btn.dataset.entryId = e.id;
      tr.lastElementChild.appendChild(btn);
    }
    refs.tcEntriesBody.appendChild(tr);
  }
}

export function wireTimeCost(refs, api) {
  let costEdited = false;

  function suggestedCost() {
    const state = api.getState();
    const member = getMember(state, refs.tcMember.value);
    const hours = parseFloat(refs.tcHours.value) || 0;
    const rate = member ? Number(member.hourlyRate) || 0 : 0;
    return (hours * rate).toFixed(2);
  }

  refs.tcCost.addEventListener('input', () => { costEdited = true; });
  refs.tcHours.addEventListener('input', () => {
    if (!costEdited) refs.tcCost.value = suggestedCost();
  });
  refs.tcMember.addEventListener('change', () => {
    costEdited = false;
    refs.tcCost.value = suggestedCost();
  });

  refs.tcEntryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const memberEmail = refs.tcMember.value;
    if (!memberEmail) { api.toast('Add a team member before logging time.'); return; }
    api.createTimeEntry({
      memberEmail,
      taskId: refs.tcTask.value || null,
      date: refs.tcDate.value || formatISO(new Date()),
      hours: refs.tcHours.value,
      cost: refs.tcCost.value,
      note: refs.tcNote.value.trim(),
    }).catch(() => api.toast('Could not save that entry.'));
    refs.tcHours.value = '0';
    refs.tcCost.value = '0';
    refs.tcNote.value = '';
    costEdited = false;
  });

  refs.tcEntriesBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-time-entry"]');
    if (!btn) return;
    api.removeTimeEntry(btn.dataset.entryId).catch(() => api.toast('Could not remove that entry.'));
  });
}

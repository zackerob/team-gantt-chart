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
  const taskPlaceholder = optionEl('', 'Select a task…', !prevTask);
  taskPlaceholder.disabled = true;
  refs.tcTask.appendChild(taskPlaceholder);
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

  renderTaskBreakdown(state, refs);
}

function taskNotesOrEmpty(container, entries, state) {
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'tc-task-note-empty';
    empty.textContent = 'No time logged yet.';
    container.appendChild(empty);
    return;
  }
  for (const e of entries) {
    const member = getMember(state, e.memberEmail);
    const row = document.createElement('div');
    row.className = 'tc-task-note-row';
    row.innerHTML = `
      <span class="tc-task-note-date">${e.date || ''}</span>
      <span class="tc-task-note-member">${member ? member.name : e.memberEmail}</span>
      <span class="tc-task-note-hours">${Number(e.hours || 0).toFixed(2)} hrs</span>
      <span class="tc-task-note-cost">${money(e.cost)}</span>
      <span class="tc-task-note-text">${e.note ? String(e.note).replace(/</g, '&lt;') : ''}</span>`;
    container.appendChild(row);
  }
}

function appendTaskGroup(container, state, title, dateRange, entries) {
  const hours = entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const cost = entries.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);

  const details = document.createElement('details');
  details.className = 'tc-task-item';

  const summary = document.createElement('summary');
  summary.className = 'tc-task-summary';
  summary.innerHTML = `
    <span class="tc-task-name">${title}</span>
    <span class="tc-task-dates">${dateRange}</span>
    <span class="tc-task-hours">${hours.toFixed(2)} hrs</span>
    <span class="tc-task-cost">${money(cost)}</span>`;
  details.appendChild(summary);

  const notes = document.createElement('div');
  notes.className = 'tc-task-notes';
  taskNotesOrEmpty(notes, entries, state);
  details.appendChild(notes);

  container.appendChild(details);
}

// Every task, oldest start date first (matching the Gantt chart's own order),
// each expandable to the individual logged entries behind its totals. Older
// entries logged before a task was required still need a home, so anything
// without a taskId is grouped under a trailing "General" bucket.
function renderTaskBreakdown(state, refs) {
  const container = refs.tcTaskList;
  if (!container) return;
  container.innerHTML = '';

  const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');
  const tasksByStart = [...state.tasks].sort((a, b) => (a.start || '').localeCompare(b.start || ''));

  for (const t of tasksByStart) {
    const entries = state.timeEntries.filter((e) => e.taskId === t.id).sort(byDate);
    appendTaskGroup(container, state, t.name, `${t.start || ''} – ${t.end || ''}`, entries);
  }

  const untasked = state.timeEntries.filter((e) => !e.taskId).sort(byDate);
  if (untasked.length) {
    appendTaskGroup(container, state, 'General (no task)', '', untasked);
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
    const taskId = refs.tcTask.value;
    if (!taskId) { api.toast('Pick a task before logging time.'); return; }
    api.createTimeEntry({
      memberEmail,
      taskId,
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

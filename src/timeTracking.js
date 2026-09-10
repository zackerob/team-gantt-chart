import { getMember, getTask, totalCost, totalHours, costByMember } from './state.js';
import { formatISO } from './dates.js';

export const ALL_MEMBERS_VALUE = '__all__';

function money(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

function syncMemberModeUI(refs, memberEmail) {
  const allMembers = memberEmail === ALL_MEMBERS_VALUE;
  if (refs.tcAllMembersHint) refs.tcAllMembersHint.hidden = !allMembers;
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
  if (isAdminUser && state.members.length > 1) {
    refs.tcMember.appendChild(optionEl(ALL_MEMBERS_VALUE, 'All Team Members', prevMember === ALL_MEMBERS_VALUE));
  }
  for (const m of selectable) {
    refs.tcMember.appendChild(optionEl(m.id, m.name, m.id === (prevMember || currentUserEmail)));
  }
  refs.tcMember.disabled = !isAdminUser;
  syncMemberModeUI(refs, refs.tcMember.value);

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
  // The Cost field always holds an hourly rate, in both modes — it's
  // multiplied by hours at submit time, never stored as a running total.
  // That keeps it correct regardless of the order hours/rate are edited in.
  function averageMemberRate() {
    const state = api.getState();
    const rates = state.members.map((m) => Number(m.hourlyRate) || 0);
    return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }

  function memberRate(memberEmail) {
    const member = getMember(api.getState(), memberEmail);
    return member ? Number(member.hourlyRate) || 0 : 0;
  }

  refs.tcMember.addEventListener('change', () => {
    syncMemberModeUI(refs, refs.tcMember.value);
    refs.tcCost.value = (refs.tcMember.value === ALL_MEMBERS_VALUE
      ? averageMemberRate()
      : memberRate(refs.tcMember.value)).toFixed(2);
  });

  refs.tcEntryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const memberEmail = refs.tcMember.value;
    if (!memberEmail) { api.toast('Add a team member before logging time.'); return; }
    const taskId = refs.tcTask.value;
    if (!taskId) { api.toast('Pick a task before logging time.'); return; }
    const date = refs.tcDate.value || formatISO(new Date());
    const note = refs.tcNote.value.trim();
    const hours = parseFloat(refs.tcHours.value) || 0;
    const hourlyRate = parseFloat(refs.tcCost.value) || 0;

    if (memberEmail === ALL_MEMBERS_VALUE) {
      const state = api.getState();
      const costPerMember = hours * hourlyRate;
      Promise.all(state.members.map((m) => api.createTimeEntry({
        memberEmail: m.id,
        taskId,
        date,
        hours,
        cost: costPerMember.toFixed(2),
        note,
      }))).catch(() => api.toast('Could not save entries for all members.'));
    } else {
      api.createTimeEntry({
        memberEmail,
        taskId,
        date,
        hours,
        cost: (hours * hourlyRate).toFixed(2),
        note,
      }).catch(() => api.toast('Could not save that entry.'));
    }

    refs.tcHours.value = '0';
    refs.tcNote.value = '';
  });

  refs.tcEntriesBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-time-entry"]');
    if (!btn) return;
    api.removeTimeEntry(btn.dataset.entryId).catch(() => api.toast('Could not remove that entry.'));
  });
}

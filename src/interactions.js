import { DAY_WIDTH, RANGE_START, RANGE_END, xToDate, formatISO, parseISO, addDays, daysBetween } from './dates.js';
import {
  getTask, updateTask, removeTask, addDependency, removeDependency, STATUS_VALUES,
} from './state.js';

// ---------- Drag to move / resize bars ----------

export function attachDragInteractions(chartCol, api) {
  chartCol.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-action^="drag-"]');
    if (!target) return;
    const action = target.dataset.action;
    const taskId = target.dataset.taskId;
    const task = getTask(api.getState(), taskId);
    if (!task) return;

    const barEl = target.closest('.bar');
    const startX = e.clientX;
    const origStart = parseISO(task.start);
    const origEnd = parseISO(task.end);
    const origLeft = parseInt(barEl.style.left, 10);
    const origWidth = parseInt(barEl.style.width, 10);

    target.setPointerCapture(e.pointerId);

    const onMove = (moveEvt) => {
      const deltaPx = moveEvt.clientX - startX;
      const deltaDays = Math.round(deltaPx / DAY_WIDTH);
      if (deltaDays === 0) return;

      if (action === 'drag-move') {
        let newStart = addDays(origStart, deltaDays);
        let newEnd = addDays(origEnd, deltaDays);
        if (newStart < RANGE_START) {
          const fix = daysBetween(newStart, RANGE_START);
          newStart = addDays(newStart, fix);
          newEnd = addDays(newEnd, fix);
        }
        if (newEnd > RANGE_END) {
          const fix = daysBetween(RANGE_END, newEnd);
          newStart = addDays(newStart, -fix);
          newEnd = addDays(newEnd, -fix);
        }
        barEl.style.left = `${origLeft + daysBetween(origStart, newStart) * DAY_WIDTH}px`;
        barEl.dataset.pendingStart = formatISO(newStart);
        barEl.dataset.pendingEnd = formatISO(newEnd);
      } else if (action === 'drag-resize-start') {
        let newStart = addDays(origStart, deltaDays);
        if (newStart < RANGE_START) newStart = RANGE_START;
        if (newStart > origEnd) newStart = origEnd;
        barEl.style.left = `${origLeft + daysBetween(origStart, newStart) * DAY_WIDTH}px`;
        barEl.style.width = `${Math.max(DAY_WIDTH, origWidth - daysBetween(origStart, newStart) * DAY_WIDTH)}px`;
        barEl.dataset.pendingStart = formatISO(newStart);
      } else if (action === 'drag-resize-end') {
        let newEnd = addDays(origEnd, deltaDays);
        if (newEnd > RANGE_END) newEnd = RANGE_END;
        if (newEnd < origStart) newEnd = origStart;
        barEl.style.width = `${Math.max(DAY_WIDTH, origWidth + daysBetween(origEnd, newEnd) * DAY_WIDTH)}px`;
        barEl.dataset.pendingEnd = formatISO(newEnd);
      }
    };

    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      chartCol.removeEventListener('pointermove', onMove);
      chartCol.removeEventListener('pointerup', onUp);
      const patch = {};
      if (barEl.dataset.pendingStart) patch.start = barEl.dataset.pendingStart;
      if (barEl.dataset.pendingEnd) patch.end = barEl.dataset.pendingEnd;
      delete barEl.dataset.pendingStart;
      delete barEl.dataset.pendingEnd;
      if (Object.keys(patch).length) {
        api.mutate((state) => updateTask(state, taskId, patch));
      }
    };

    chartCol.addEventListener('pointermove', onMove);
    chartCol.addEventListener('pointerup', onUp);
  });
}

// ---------- Task detail panel ----------

function optionEl(value, text, selected) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  if (selected) o.selected = true;
  return o;
}

export function populateTaskPanel(refs, api, taskId) {
  const state = api.getState();
  const task = getTask(state, taskId);
  if (!task) return;
  refs.taskPanel.dataset.taskId = taskId;

  refs.taskName.value = task.name;
  refs.taskStatus.innerHTML = '';
  for (const s of STATUS_VALUES) refs.taskStatus.appendChild(optionEl(s, s.replace('-', ' '), s === task.status));

  refs.taskGroup.innerHTML = '';
  for (const g of state.groups) refs.taskGroup.appendChild(optionEl(g.id, g.name, g.id === task.groupId));

  refs.taskStart.value = task.start;
  refs.taskEnd.value = task.end;
  refs.taskStart.min = formatISO(RANGE_START);
  refs.taskStart.max = formatISO(RANGE_END);
  refs.taskEnd.min = formatISO(RANGE_START);
  refs.taskEnd.max = formatISO(RANGE_END);

  refs.taskAssignees.innerHTML = '';
  for (const a of state.assignees) {
    const label = document.createElement('label');
    label.className = 'assignee-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = a.id;
    cb.checked = task.assigneeIds.includes(a.id);
    cb.dataset.action = 'toggle-assignee';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = a.color;
    label.appendChild(cb);
    label.appendChild(swatch);
    label.appendChild(document.createTextNode(a.name));
    refs.taskAssignees.appendChild(label);
  }

  renderDependencyList(refs, api, task);

  refs.taskAddDepSelect.innerHTML = '';
  const eligible = state.tasks.filter((t) => t.id !== task.id && !task.dependencyIds.includes(t.id));
  if (eligible.length === 0) {
    refs.taskAddDepSelect.appendChild(optionEl('', 'No other tasks available', true));
    refs.taskAddDepSelect.disabled = true;
    refs.taskAddDepBtn.disabled = true;
  } else {
    refs.taskAddDepSelect.disabled = false;
    refs.taskAddDepBtn.disabled = false;
    for (const t of eligible) refs.taskAddDepSelect.appendChild(optionEl(t.id, t.name));
  }
}

function renderDependencyList(refs, api, task) {
  const state = api.getState();
  refs.taskDepList.innerHTML = '';
  if (task.dependencyIds.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dep-empty';
    empty.textContent = 'No dependencies';
    refs.taskDepList.appendChild(empty);
    return;
  }
  for (const depId of task.dependencyIds) {
    const dep = getTask(state, depId);
    if (!dep) continue;
    const li = document.createElement('li');
    li.className = 'dep-chip';
    const label = document.createElement('span');
    label.textContent = dep.name;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove dependency';
    removeBtn.addEventListener('click', () => {
      api.mutate((s) => removeDependency(s, task.id, depId));
      const fresh = getTask(api.getState(), task.id);
      if (fresh) populateTaskPanel(refs, api, task.id);
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    refs.taskDepList.appendChild(li);
  }
}

export function wireTaskPanel(refs, api) {
  const currentTaskId = () => refs.taskPanel.dataset.taskId;

  refs.taskClose.addEventListener('click', () => closeTaskPanel(refs));

  refs.taskName.addEventListener('change', () => {
    api.mutate((s) => updateTask(s, currentTaskId(), { name: refs.taskName.value.trim() || 'Untitled task' }));
  });
  refs.taskStatus.addEventListener('change', () => {
    api.mutate((s) => updateTask(s, currentTaskId(), { status: refs.taskStatus.value }));
  });
  refs.taskGroup.addEventListener('change', () => {
    api.mutate((s) => updateTask(s, currentTaskId(), { groupId: refs.taskGroup.value }));
  });
  refs.taskStart.addEventListener('change', () => {
    api.mutate((s) => updateTask(s, currentTaskId(), { start: refs.taskStart.value }));
    populateTaskPanel(refs, api, currentTaskId());
  });
  refs.taskEnd.addEventListener('change', () => {
    api.mutate((s) => updateTask(s, currentTaskId(), { end: refs.taskEnd.value }));
    populateTaskPanel(refs, api, currentTaskId());
  });
  refs.taskAssignees.addEventListener('change', (e) => {
    if (e.target.dataset.action !== 'toggle-assignee') return;
    const state = api.getState();
    const task = getTask(state, currentTaskId());
    const set = new Set(task.assigneeIds);
    if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
    api.mutate((s) => updateTask(s, currentTaskId(), { assigneeIds: [...set] }));
  });
  refs.taskAddDepBtn.addEventListener('click', () => {
    const depId = refs.taskAddDepSelect.value;
    if (!depId) return;
    const err = addDependency(api.getState(), currentTaskId(), depId);
    if (err) {
      api.toast(err);
      return;
    }
    api.rerender();
    api.scheduleSave();
    populateTaskPanel(refs, api, currentTaskId());
  });
  refs.taskDelete.addEventListener('click', () => {
    const id = currentTaskId();
    api.mutate((s) => removeTask(s, id));
    closeTaskPanel(refs);
  });
}

export function openTaskPanel(refs, api, taskId) {
  populateTaskPanel(refs, api, taskId);
  refs.taskPanel.hidden = false;
  refs.scrim.hidden = false;
}

export function closeTaskPanel(refs) {
  refs.taskPanel.hidden = true;
  refs.scrim.hidden = true;
  delete refs.taskPanel.dataset.taskId;
}

import {
  RANGE_START, RANGE_END, DAY_WIDTH, dateToX, totalWidth, daysBetween,
  getMonthsInRange, getWeekStarts, isToday, todayInRange, parseISO, addDays, formatShort,
} from './dates.js';
import { getMember, getTask } from './state.js';

export const TASK_ROW_H = 36;
export const GROUP_ROW_H = 40;
export const BAR_H = 24;
export const SIDEBAR_W = 300;

const STATUS_LABEL = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

// taskId -> { top, left, width, height } in chart-col coordinates, refreshed each render.
export const taskLayout = new Map();

function el(tag, className, attrs) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  return node;
}

function initials(name) {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function hasDependencyConflict(state, task) {
  return task.dependencyIds.some((depId) => {
    const dep = getTask(state, depId);
    return dep && dep.end > task.start;
  });
}

function buildHeader(headerChart) {
  headerChart.innerHTML = '';
  headerChart.style.width = `${totalWidth()}px`;

  const monthBand = el('div', 'header-months');
  for (const m of getMonthsInRange()) {
    const x = dateToX(m.start);
    const w = m.dayCount * DAY_WIDTH;
    const cell = el('div', 'month-cell', { text: m.label });
    cell.style.left = `${x}px`;
    cell.style.width = `${w}px`;
    monthBand.appendChild(cell);
  }
  headerChart.appendChild(monthBand);

  const weekBand = el('div', 'header-weeks');
  for (const w of getWeekStarts()) {
    const x = dateToX(w);
    const tick = el('div', 'week-tick', { text: formatShort(w) });
    tick.style.left = `${x}px`;
    weekBand.appendChild(tick);
  }
  headerChart.appendChild(weekBand);
}

function weekGridBackground() {
  const weeks = getWeekStarts();
  const period = 7 * DAY_WIDTH;
  const firstX = weeks.length ? dateToX(weeks[0]) : 0;
  const offset = ((firstX % period) + period) % period;
  return {
    backgroundImage:
      `repeating-linear-gradient(to right, var(--grid-week) 0, var(--grid-week) 1px, transparent 1px, transparent ${period}px)`,
    backgroundPositionX: `${offset}px`,
  };
}

function buildMonthDividers(chartCol) {
  for (const m of getMonthsInRange()) {
    if (m.start.getTime() === RANGE_START.getTime()) continue;
    const x = dateToX(m.start);
    const line = el('div', 'month-divider');
    line.style.left = `${x}px`;
    chartCol.appendChild(line);
  }
}

function buildGroupRow(state, group, sidebarCol, chartCol, hiddenCount) {
  const sideRow = el('div', 'row group-row', { 'data-group-id': group.id });
  sideRow.style.height = `${GROUP_ROW_H}px`;

  const toggle = el('button', 'chevron' + (group.collapsed ? ' collapsed' : ''), {
    'data-action': 'toggle-group', 'data-group-id': group.id, type: 'button', 'aria-label': 'Toggle group',
  });
  toggle.textContent = '▾';
  sideRow.appendChild(toggle);

  const nameInput = el('input', 'group-name-input', {
    type: 'text', value: group.name, 'data-action': 'rename-group', 'data-group-id': group.id,
  });
  nameInput.value = group.name;
  sideRow.appendChild(nameInput);

  if (hiddenCount > 0) {
    const hiddenBadge = el('span', 'hidden-count-badge', {
      text: `${hiddenCount} done, hidden`, title: `${hiddenCount} completed task${hiddenCount === 1 ? '' : 's'} hidden by "Hide completed"`,
    });
    sideRow.appendChild(hiddenBadge);
  }

  const addTaskBtn = el('button', 'row-icon-btn', {
    'data-action': 'add-task-to-group', 'data-group-id': group.id, type: 'button', title: 'Add task to this group',
  });
  addTaskBtn.textContent = '+';
  sideRow.appendChild(addTaskBtn);

  const removeBtn = el('button', 'row-icon-btn danger', {
    'data-action': 'remove-group', 'data-group-id': group.id, type: 'button', title: 'Remove group',
  });
  removeBtn.textContent = '×';
  sideRow.appendChild(removeBtn);

  sidebarCol.appendChild(sideRow);

  const chartRow = el('div', 'row group-chart-row');
  chartRow.style.height = `${GROUP_ROW_H}px`;
  chartRow.style.width = `${totalWidth()}px`;
  chartCol.appendChild(chartRow);
}

function buildTaskRow(state, task, sidebarCol, chartCol, chartTopOffset) {
  const sideRow = el('div', 'row task-row', { 'data-task-id': task.id, 'data-action': 'open-task' });
  sideRow.style.height = `${TASK_ROW_H}px`;

  const dot = el('span', `status-dot status-${task.status}`);
  sideRow.appendChild(dot);

  const name = el('span', 'task-name', { text: task.name });
  sideRow.appendChild(name);

  const badges = el('span', 'assignee-badges');
  for (const aid of task.assigneeIds) {
    const a = getMember(state, aid);
    if (!a) continue;
    const b = el('span', 'badge', { text: initials(a.name), title: a.name });
    b.style.background = a.color;
    badges.appendChild(b);
  }
  sideRow.appendChild(badges);

  if (hasDependencyConflict(state, task)) {
    const warn = el('span', 'conflict-flag', { text: '⚠', title: 'Starts before a dependency finishes' });
    sideRow.appendChild(warn);
  }

  sidebarCol.appendChild(sideRow);

  const chartRow = el('div', 'row task-chart-row', { 'data-task-id': task.id });
  chartRow.style.height = `${TASK_ROW_H}px`;
  chartRow.style.width = `${totalWidth()}px`;

  const start = parseISO(task.start);
  const end = parseISO(task.end);
  const left = dateToX(start);
  const width = Math.max(DAY_WIDTH, (daysBetween(start, end) + 1) * DAY_WIDTH - 2);
  const top = (TASK_ROW_H - BAR_H) / 2;

  const bar = el('div', `bar status-${task.status}`, {
    'data-task-id': task.id,
    title: task.description && task.description.trim() ? task.description.trim() : undefined,
  });
  bar.style.left = `${left}px`;
  bar.style.width = `${width}px`;
  bar.style.top = `${top}px`;
  bar.style.height = `${BAR_H}px`;

  const body = el('div', 'bar-body', { 'data-action': 'drag-move', 'data-task-id': task.id });
  const label = el('span', 'bar-label', { text: task.name });
  body.appendChild(label);
  bar.appendChild(body);

  const leftHandle = el('div', 'bar-handle left', { 'data-action': 'drag-resize-start', 'data-task-id': task.id });
  const rightHandle = el('div', 'bar-handle right', { 'data-action': 'drag-resize-end', 'data-task-id': task.id });
  bar.appendChild(leftHandle);
  bar.appendChild(rightHandle);

  chartRow.appendChild(bar);
  chartCol.appendChild(chartRow);

  taskLayout.set(task.id, { top: chartTopOffset, left, width, height: TASK_ROW_H });
}

function buildTodayMarker(chartCol) {
  if (!todayInRange()) return;
  const x = dateToX(new Date());
  const marker = el('div', 'today-marker');
  marker.style.left = `${x}px`;
  chartCol.appendChild(marker);
}

function drawConnectors(svg, state) {
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `
    <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--connector)" />
    </marker>`;
  svg.appendChild(defs);

  for (const task of state.tasks) {
    const toPos = taskLayout.get(task.id);
    if (!toPos) continue;
    for (const depId of task.dependencyIds) {
      const fromPos = taskLayout.get(depId);
      if (!fromPos) continue;
      const x1 = fromPos.left + fromPos.width;
      const y1 = fromPos.top + fromPos.height / 2;
      const x2 = toPos.left;
      const y2 = toPos.top + toPos.height / 2;
      const midX = x1 + Math.max(12, (x2 - x1) / 2);
      const d = x2 >= x1 + 4
        ? `M ${x1} ${y1} H ${midX} V ${y2} H ${x2 - 6}`
        : `M ${x1} ${y1} H ${x1 + 12} V ${y1 + (y2 - y1) / 2} H ${x2 - 12} V ${y2} H ${x2 - 6}`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'connector' + (fromPos.conflict ? ' conflict' : ''));
      path.setAttribute('marker-end', 'url(#arrowhead)');
      svg.appendChild(path);
    }
  }
}

export function render(state, refs, options = {}) {
  const hideCompleted = !!options.hideCompleted;

  taskLayout.clear();
  buildHeader(refs.headerChart);

  refs.sidebarCol.innerHTML = '';
  refs.chartCol.innerHTML = '';
  refs.chartCol.style.width = `${totalWidth()}px`;
  Object.assign(refs.chartCol.style, weekGridBackground());

  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  let runningTop = 0;
  for (const group of groups) {
    const allTasks = state.tasks.filter((t) => t.groupId === group.id);
    const visibleTasks = hideCompleted ? allTasks.filter((t) => t.status !== 'done') : allTasks;
    const hiddenCount = allTasks.length - visibleTasks.length;

    buildGroupRow(state, group, refs.sidebarCol, refs.chartCol, hiddenCount);
    runningTop += GROUP_ROW_H;
    if (!group.collapsed) {
      const tasks = visibleTasks.sort((a, b) => a.order - b.order);
      for (const task of tasks) {
        buildTaskRow(state, task, refs.sidebarCol, refs.chartCol, runningTop);
        runningTop += TASK_ROW_H;
      }
    }
  }

  const fixedHeight = Math.max(runningTop, refs.chartCol.scrollHeight);
  refs.chartCol.style.height = `${fixedHeight}px`;
  refs.sidebarCol.style.height = `${fixedHeight}px`;

  buildMonthDividers(refs.chartCol);
  buildTodayMarker(refs.chartCol);

  refs.connectorsSvg.setAttribute('width', String(totalWidth()));
  refs.connectorsSvg.setAttribute('height', String(fixedHeight));
  refs.connectorsSvg.style.width = `${totalWidth()}px`;
  refs.connectorsSvg.style.height = `${fixedHeight}px`;
  drawConnectors(refs.connectorsSvg, state);
}

import { render } from './render.js';
import {
  createDefaultState, addGroup, addTask, removeGroup, toggleGroupCollapsed, renameGroup,
  renameAssignee,
} from './state.js';
import {
  supportsFSAccess, loadDirectoryHandle, saveDirectoryHandle, verifyPermission,
  pickDirectory, readGanttFile, writeGanttFile, exportJSON, importJSONFile,
} from './storage.js';
import { attachDragInteractions, wireTaskPanel, openTaskPanel, closeTaskPanel } from './interactions.js';

const USER_NAME_KEY = 'ganttUserName';
const SAVE_DEBOUNCE_MS = 800;

let state = createDefaultState();
let dirHandle = null;
let saveTimer = null;
let toastTimer = null;

function grabRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    addGroupBtn: byId('addGroupBtn'),
    addTaskBtn: byId('addTaskBtn'),
    connectFolderBtn: byId('connectFolderBtn'),
    reloadBtn: byId('reloadBtn'),
    saveNowBtn: byId('saveNowBtn'),
    importBtn: byId('importBtn'),
    importFileInput: byId('importFileInput'),
    exportBtn: byId('exportBtn'),
    settingsBtn: byId('settingsBtn'),
    saveStatus: byId('saveStatus'),

    headerChart: byId('headerChart'),
    sidebarCol: byId('sidebarCol'),
    chartCol: byId('chartCol'),
    connectorsSvg: byId('connectorsSvg'),

    scrim: byId('scrim'),

    taskPanel: byId('taskPanel'),
    taskClose: byId('taskClose'),
    taskName: byId('taskName'),
    taskStatus: byId('taskStatus'),
    taskGroup: byId('taskGroup'),
    taskStart: byId('taskStart'),
    taskEnd: byId('taskEnd'),
    taskAssignees: byId('taskAssignees'),
    taskDepList: byId('taskDepList'),
    taskAddDepSelect: byId('taskAddDepSelect'),
    taskAddDepBtn: byId('taskAddDepBtn'),
    taskDelete: byId('taskDelete'),

    settingsPanel: byId('settingsPanel'),
    settingsClose: byId('settingsClose'),
    settingsAssignees: byId('settingsAssignees'),
    settingsYourName: byId('settingsYourName'),
    settingsDisconnect: byId('settingsDisconnect'),
    settingsFolderStatus: byId('settingsFolderStatus'),

    toast: byId('toast'),
  };
}

let refs;

function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '';
}

function setUserName(name) {
  localStorage.setItem(USER_NAME_KEY, name);
}

function toast(message) {
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { refs.toast.hidden = true; }, 3500);
}

function rerender() {
  render(state, refs);
}

function mutate(fn) {
  fn(state);
  rerender();
  scheduleSave();
}

function setSaveStatus(kind) {
  const el = refs.saveStatus;
  el.dataset.kind = kind;
  if (kind === 'not-connected') el.textContent = 'Not connected — connect a shared folder, or use Export to save manually.';
  else if (kind === 'unsaved') el.textContent = 'Unsaved changes…';
  else if (kind === 'saving') el.textContent = 'Saving…';
  else if (kind === 'saved') {
    const who = state.meta.lastEditedBy || 'someone';
    const when = state.meta.lastEditedAt ? new Date(state.meta.lastEditedAt).toLocaleTimeString() : '';
    el.textContent = `All changes saved — last edit by ${who} at ${when}`;
  } else if (kind === 'error') el.textContent = 'Save failed — try "Save Now", or use Export as a backup.';
}

function scheduleSave() {
  if (!dirHandle) { setSaveStatus('not-connected'); return; }
  setSaveStatus('unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, SAVE_DEBOUNCE_MS);
}

async function doSave() {
  if (!dirHandle) { setSaveStatus('not-connected'); return; }
  setSaveStatus('saving');
  state.meta.lastEditedBy = getUserName() || 'Unknown';
  state.meta.lastEditedAt = new Date().toISOString();
  try {
    await writeGanttFile(dirHandle, state);
    setSaveStatus('saved');
  } catch (err) {
    console.error(err);
    setSaveStatus('error');
  }
}

const api = { getState: () => state, mutate, rerender, scheduleSave, toast };

// ---------- Toolbar ----------

function lastGroupId() {
  if (state.groups.length === 0) {
    const g = addGroup(state, 'New Group');
    return g.id;
  }
  return [...state.groups].sort((a, b) => a.order - b.order).at(-1).id;
}

function wireToolbar() {
  refs.addGroupBtn.addEventListener('click', () => {
    mutate((s) => addGroup(s, 'New Group'));
  });

  refs.addTaskBtn.addEventListener('click', () => {
    mutate((s) => addTask(s, lastGroupId()));
  });

  refs.exportBtn.addEventListener('click', () => exportJSON(state));

  refs.importBtn.addEventListener('click', () => refs.importFileInput.click());
  refs.importFileInput.addEventListener('change', async () => {
    const file = refs.importFileInput.files[0];
    refs.importFileInput.value = '';
    if (!file) return;
    try {
      state = await importJSONFile(file);
      rerender();
      scheduleSave();
      toast('Imported gantt-data.json.');
    } catch {
      toast('Could not read that file as JSON.');
    }
  });

  if (!supportsFSAccess) {
    refs.connectFolderBtn.hidden = true;
    refs.reloadBtn.hidden = true;
    refs.saveNowBtn.hidden = true;
    setSaveStatus('not-connected');
  } else {
    refs.connectFolderBtn.addEventListener('click', handleConnectClick);
    refs.reloadBtn.addEventListener('click', async () => {
      if (!dirHandle) return;
      try {
        state = await readGanttFile(dirHandle);
        rerender();
        toast('Reloaded from shared folder.');
      } catch {
        toast('Could not reload — file may be missing or locked.');
      }
    });
    refs.saveNowBtn.addEventListener('click', () => {
      clearTimeout(saveTimer);
      doSave();
    });
  }

  refs.settingsBtn.addEventListener('click', () => openSettingsPanel());
  refs.scrim.addEventListener('click', () => {
    closeTaskPanel(refs);
    closeSettingsPanel();
  });
}

async function handleConnectClick() {
  try {
    if (dirHandle) {
      const ok = await verifyPermission(dirHandle, 'readwrite');
      if (!ok) { toast('Permission to the folder was not granted.'); return; }
    } else {
      dirHandle = await pickDirectory();
    }
    state = await readGanttFile(dirHandle);
    setConnectedUI(true);
    rerender();
    doSave();
    toast('Connected to shared folder.');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error(err);
    toast('Could not connect to that folder.');
  }
}

function setConnectedUI(connected) {
  refs.connectFolderBtn.textContent = connected ? 'Reconnect Folder' : 'Open Shared Folder…';
  refs.settingsFolderStatus.textContent = connected ? 'Connected to a shared folder.' : 'Not connected to a shared folder.';
  refs.settingsDisconnect.hidden = !connected;
  setSaveStatus(connected ? 'saved' : 'not-connected');
}

// ---------- Sidebar delegation (groups + opening tasks) ----------

function wireSidebarDelegation() {
  refs.sidebarCol.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'toggle-group') {
      mutate((s) => toggleGroupCollapsed(s, actionEl.dataset.groupId));
    } else if (action === 'remove-group') {
      if (confirm('Remove this group and all its tasks?')) {
        mutate((s) => removeGroup(s, actionEl.dataset.groupId));
      }
    } else if (action === 'add-task-to-group') {
      mutate((s) => addTask(s, actionEl.dataset.groupId));
    } else if (action === 'open-task') {
      openTaskPanel(refs, api, actionEl.closest('[data-task-id]').dataset.taskId);
    }
  });

  refs.sidebarCol.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'rename-group') {
      mutate((s) => renameGroup(s, e.target.dataset.groupId, e.target.value.trim() || 'Untitled group'));
    }
  });
}

// ---------- Settings panel ----------

function buildSettingsPanel() {
  refs.settingsAssignees.innerHTML = '';
  for (const a of state.assignees) {
    const row = document.createElement('label');
    row.className = 'settings-assignee-row';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = a.color;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = a.name;
    input.addEventListener('change', () => {
      mutate((s) => renameAssignee(s, a.id, input.value.trim() || a.name));
    });
    row.appendChild(swatch);
    row.appendChild(input);
    refs.settingsAssignees.appendChild(row);
  }

  refs.settingsYourName.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Choose your name…';
  refs.settingsYourName.appendChild(blank);
  for (const a of state.assignees) {
    const o = document.createElement('option');
    o.value = a.name;
    o.textContent = a.name;
    if (a.name === getUserName()) o.selected = true;
    refs.settingsYourName.appendChild(o);
  }
}

function openSettingsPanel(opts = {}) {
  buildSettingsPanel();
  refs.settingsPanel.hidden = false;
  refs.scrim.hidden = false;
  if (opts.highlightName) refs.settingsYourName.focus();
}

function closeSettingsPanel() {
  refs.settingsPanel.hidden = true;
  if (refs.taskPanel.hidden) refs.scrim.hidden = true;
}

function wireSettingsPanel() {
  refs.settingsClose.addEventListener('click', closeSettingsPanel);
  refs.settingsYourName.addEventListener('change', () => {
    setUserName(refs.settingsYourName.value);
  });
  refs.settingsDisconnect.addEventListener('click', async () => {
    dirHandle = null;
    await saveDirectoryHandle(null);
    setConnectedUI(false);
    toast('Disconnected from shared folder.');
  });
}

// ---------- Init ----------

async function init() {
  refs = grabRefs();
  wireToolbar();
  wireSidebarDelegation();
  wireTaskPanel(refs, api);
  wireSettingsPanel();
  attachDragInteractions(refs.chartCol, api);

  if (supportsFSAccess) {
    const stored = await loadDirectoryHandle();
    if (stored) {
      dirHandle = stored;
      const granted = await stored.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
      if (granted === 'granted') {
        try {
          state = await readGanttFile(dirHandle);
          setConnectedUI(true);
        } catch {
          toast('Stored folder could not be read — try reconnecting.');
          setConnectedUI(false);
        }
      } else {
        setConnectedUI(false);
        toast('Click "Open Shared Folder…" to reconnect and grant access.');
      }
    } else {
      setSaveStatus('not-connected');
    }
  } else {
    setSaveStatus('not-connected');
  }

  rerender();

  if (!getUserName()) {
    toast('Pick your name in Settings so edits are attributed to you.');
    openSettingsPanel({ highlightName: true });
  }
}

init();

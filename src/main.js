import { render } from './render.js';
import { configIsPlaceholder, signIn, signOutUser, watchAuth } from './firebaseApp.js';
import { ALLOWED_EMAILS } from './firebase-config.js';
import {
  getMirroredState, subscribe, setActor, ensureSeeded,
  createGroup, renameGroupDoc, toggleGroupCollapsedDoc, deleteGroupDoc,
  createTask, updateTaskDoc, deleteTaskDoc, addDependencyDoc, removeDependencyDoc,
  renameAssigneeDoc, exportJSON, importJSONFile, importState,
} from './store.js';
import { attachDragInteractions, wireTaskPanel, openTaskPanel, closeTaskPanel, populateTaskPanel } from './interactions.js';

let refs;
let toastTimer = null;
let unsubscribeStore = null;
let storeSubscribed = false;

function grabRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    authGate: byId('authGate'),
    authMessage: byId('authMessage'),
    signInBtn: byId('signInBtn'),
    signOutBtn: byId('signOutBtn'),
    appRoot: byId('app'),

    addGroupBtn: byId('addGroupBtn'),
    addTaskBtn: byId('addTaskBtn'),
    liveStatus: byId('liveStatus'),
    importBtn: byId('importBtn'),
    importFileInput: byId('importFileInput'),
    exportBtn: byId('exportBtn'),
    settingsBtn: byId('settingsBtn'),
    userAvatar: byId('userAvatar'),
    userName: byId('userName'),
    topSignOutBtn: byId('topSignOutBtn'),

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
    taskUpdatedHint: byId('taskUpdatedHint'),
    taskDelete: byId('taskDelete'),

    settingsPanel: byId('settingsPanel'),
    settingsClose: byId('settingsClose'),
    settingsAssignees: byId('settingsAssignees'),
    settingsSignedInAs: byId('settingsSignedInAs'),
    settingsSignOut: byId('settingsSignOut'),

    toast: byId('toast'),
  };
}

function toast(message) {
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { refs.toast.hidden = true; }, 3500);
}

function rerender() {
  render(getMirroredState(), refs);
}

function setLiveStatus(kind, text) {
  refs.liveStatus.dataset.kind = kind;
  refs.liveStatus.textContent = text;
}

const api = {
  getState: getMirroredState,
  toast,
  updateTask: updateTaskDoc,
  removeTask: deleteTaskDoc,
  addDependency: addDependencyDoc,
  removeDependency: removeDependencyDoc,
};

// ---------- Toolbar ----------

function lastGroupId() {
  const state = getMirroredState();
  if (state.groups.length === 0) return null;
  return [...state.groups].sort((a, b) => a.order - b.order).at(-1).id;
}

function wireToolbar() {
  refs.addGroupBtn.addEventListener('click', () => {
    createGroup('New Group').catch(() => toast('Could not add group.'));
  });

  refs.addTaskBtn.addEventListener('click', async () => {
    let groupId = lastGroupId();
    if (!groupId) groupId = await createGroup('New Group').catch(() => null);
    if (!groupId) { toast('Could not add task.'); return; }
    createTask(groupId).catch(() => toast('Could not add task.'));
  });

  refs.exportBtn.addEventListener('click', () => exportJSON());

  refs.importBtn.addEventListener('click', () => refs.importFileInput.click());
  refs.importFileInput.addEventListener('change', async () => {
    const file = refs.importFileInput.files[0];
    refs.importFileInput.value = '';
    if (!file) return;
    if (!confirm('This replaces all current groups and tasks for everyone with the contents of that file. Continue?')) return;
    try {
      const parsed = await importJSONFile(file);
      await importState(parsed);
      toast('Imported — this replaced the shared data for everyone.');
    } catch {
      toast('Could not read that file as JSON.');
    }
  });

  refs.settingsBtn.addEventListener('click', () => openSettingsPanel());
  refs.scrim.addEventListener('click', () => {
    closeTaskPanel(refs);
    closeSettingsPanel();
  });

  refs.topSignOutBtn.addEventListener('click', () => signOutUser());
}

// ---------- Sidebar delegation (groups + opening tasks) ----------

function wireSidebarDelegation() {
  refs.sidebarCol.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'toggle-group') {
      toggleGroupCollapsedDoc(actionEl.dataset.groupId);
    } else if (action === 'remove-group') {
      if (confirm('Remove this group and all its tasks?')) {
        deleteGroupDoc(actionEl.dataset.groupId).catch(() => toast('Could not remove group.'));
      }
    } else if (action === 'add-task-to-group') {
      createTask(actionEl.dataset.groupId).catch(() => toast('Could not add task.'));
    } else if (action === 'open-task') {
      openTaskPanel(refs, api, actionEl.closest('[data-task-id]').dataset.taskId);
    }
  });

  refs.sidebarCol.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'rename-group') {
      renameGroupDoc(e.target.dataset.groupId, e.target.value.trim() || 'Untitled group')
        .catch(() => toast('Could not rename group.'));
    }
  });
}

// ---------- Settings panel ----------

function buildSettingsPanel(user) {
  const state = getMirroredState();
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
      renameAssigneeDoc(a.id, input.value.trim() || a.name).catch(() => toast('Could not rename assignee.'));
    });
    row.appendChild(swatch);
    row.appendChild(input);
    refs.settingsAssignees.appendChild(row);
  }
  refs.settingsSignedInAs.textContent = user ? `${user.displayName} (${user.email})` : '';
}

function openSettingsPanel() {
  buildSettingsPanel(currentUser);
  refs.settingsPanel.hidden = false;
  refs.scrim.hidden = false;
}

function closeSettingsPanel() {
  refs.settingsPanel.hidden = true;
  if (refs.taskPanel.hidden) refs.scrim.hidden = true;
}

function wireSettingsPanel() {
  refs.settingsClose.addEventListener('click', closeSettingsPanel);
  refs.settingsSignOut.addEventListener('click', () => signOutUser());
}

// ---------- Auth gate ----------

let currentUser = null;

function showAuthGate(message, { showSignIn, showSignOut }) {
  refs.appRoot.hidden = true;
  refs.authGate.hidden = false;
  refs.authMessage.textContent = message;
  refs.signInBtn.hidden = !showSignIn;
  refs.signOutBtn.hidden = !showSignOut;
}

function showApp(user) {
  refs.authGate.hidden = true;
  refs.appRoot.hidden = false;
  refs.userAvatar.src = user.photoURL || '';
  refs.userAvatar.alt = user.displayName || user.email;
  refs.userName.textContent = user.displayName || user.email;
}

async function handleAuthChange(user) {
  if (!user) {
    currentUser = null;
    showAuthGate('Sign in with your Google account to continue.', { showSignIn: true, showSignOut: false });
    return;
  }
  if (!ALLOWED_EMAILS.includes(user.email)) {
    currentUser = null;
    showAuthGate(`${user.email} isn't on the team allowlist for this chart. Ask whoever set this up to add you.`, { showSignIn: false, showSignOut: true });
    return;
  }

  currentUser = user;
  setActor(user.displayName || user.email);
  showApp(user);

  if (!storeSubscribed) {
    storeSubscribed = true;
    wireToolbar();
    wireSidebarDelegation();
    wireTaskPanel(refs, api);
    wireSettingsPanel();
    attachDragInteractions(refs.chartCol, api);

    setLiveStatus('connecting', 'Connecting…');
    try {
      await ensureSeeded();
    } catch {
      toast('Could not initialize shared data — check Firestore rules.');
    }
    unsubscribeStore = subscribe(onStoreChange);
    window.addEventListener('online', () => setLiveStatus('live', 'Live — synced'));
    window.addEventListener('offline', () => setLiveStatus('offline', 'Offline — changes will sync once reconnected'));
  }
}

function onStoreChange() {
  setLiveStatus(navigator.onLine ? 'live' : 'offline', navigator.onLine ? 'Live — synced' : 'Offline — changes will sync once reconnected');
  rerender();
  if (!refs.taskPanel.hidden && refs.taskPanel.dataset.taskId) {
    populateTaskPanel(refs, api, refs.taskPanel.dataset.taskId);
  }
}

// ---------- Init ----------

function init() {
  refs = grabRefs();

  if (configIsPlaceholder) {
    showAuthGate('This app isn’t configured yet — src/firebase-config.js still has placeholder values.', { showSignIn: false, showSignOut: false });
    return;
  }

  refs.signInBtn.hidden = false;
  refs.signInBtn.addEventListener('click', () => {
    signIn().catch((err) => {
      if (err && err.code === 'auth/popup-closed-by-user') return;
      toast('Sign-in failed. Please try again.');
    });
  });
  refs.signOutBtn.addEventListener('click', () => signOutUser());

  watchAuth(handleAuthChange);
}

init();

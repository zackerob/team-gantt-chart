import { render } from './render.js';
import { configIsPlaceholder, signIn, signOutUser, watchAuth } from './firebaseApp.js';
import { isAdmin as isAdminOf } from './state.js';
import {
  getMirroredState, subscribe, setActor, ensureSeeded,
  createGroup, renameGroupDoc, toggleGroupCollapsedDoc, deleteGroupDoc,
  createTask, updateTaskDoc, deleteTaskDoc, addDependencyDoc, removeDependencyDoc,
  createMember, deleteMemberDoc, setMemberRole, renameMemberDoc, setOwnHourlyRate,
  createTimeEntry, deleteTimeEntryDoc,
  exportJSON, importJSONFile, importState,
} from './store.js';
import { attachDragInteractions, wireTaskPanel, openTaskPanel, closeTaskPanel, populateTaskPanel } from './interactions.js';
import { renderTimeCost, wireTimeCost } from './timeTracking.js';

let refs;
let toastTimer = null;
let storeSubscribed = false;
let currentUser = null;
let activeTab = 'gantt';

function grabRefs() {
  const byId = (id) => document.getElementById(id);
  return {
    authGate: byId('authGate'),
    authMessage: byId('authMessage'),
    signInBtn: byId('signInBtn'),
    signOutBtn: byId('signOutBtn'),
    appRoot: byId('app'),

    tabGanttBtn: byId('tabGanttBtn'),
    tabTimeCostBtn: byId('tabTimeCostBtn'),
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

    ganttScroll: byId('ganttScroll'),
    headerChart: byId('headerChart'),
    sidebarCol: byId('sidebarCol'),
    chartCol: byId('chartCol'),
    connectorsSvg: byId('connectorsSvg'),

    timeCostView: byId('timeCostView'),
    tcTotalHours: byId('tcTotalHours'),
    tcTotalCost: byId('tcTotalCost'),
    tcBreakdownBody: byId('tcBreakdownBody'),
    tcEntryForm: byId('tcEntryForm'),
    tcMember: byId('tcMember'),
    tcDate: byId('tcDate'),
    tcTask: byId('tcTask'),
    tcHours: byId('tcHours'),
    tcCost: byId('tcCost'),
    tcNote: byId('tcNote'),
    tcEntriesBody: byId('tcEntriesBody'),

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
    settingsMembers: byId('settingsMembers'),
    settingsAddMemberField: byId('settingsAddMemberField'),
    settingsAddMemberForm: byId('settingsAddMemberForm'),
    newMemberEmail: byId('newMemberEmail'),
    newMemberName: byId('newMemberName'),
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

function amIAdmin() {
  return currentUser ? isAdminOf(getMirroredState(), currentUser.email) : false;
}

function rerenderGantt() {
  render(getMirroredState(), refs);
}

function rerenderTimeCost() {
  if (!currentUser) return;
  renderTimeCost(getMirroredState(), refs, currentUser.email, amIAdmin());
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
  createTimeEntry,
  removeTimeEntry: deleteTimeEntryDoc,
};

// ---------- Tabs ----------

function setTab(tab) {
  activeTab = tab;
  const ganttActive = tab === 'gantt';
  refs.tabGanttBtn.classList.toggle('active', ganttActive);
  refs.tabTimeCostBtn.classList.toggle('active', !ganttActive);
  refs.addGroupBtn.hidden = !ganttActive;
  refs.addTaskBtn.hidden = !ganttActive;
  refs.ganttScroll.hidden = !ganttActive;
  refs.timeCostView.hidden = ganttActive;
  if (ganttActive) rerenderGantt(); else rerenderTimeCost();
}

function wireTabs() {
  refs.tabGanttBtn.addEventListener('click', () => setTab('gantt'));
  refs.tabTimeCostBtn.addEventListener('click', () => setTab('timecost'));
}

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

// ---------- Settings panel (team member management) ----------

function buildSettingsPanel() {
  const state = getMirroredState();
  const iAmAdmin = amIAdmin();

  refs.settingsMembers.innerHTML = '';
  for (const m of state.members) {
    const row = document.createElement('div');
    row.className = 'settings-member-row';

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = m.color;
    row.appendChild(swatch);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = m.name;
    nameInput.disabled = !iAmAdmin;
    nameInput.title = iAmAdmin ? 'Rename this member' : 'Only an admin can rename members';
    nameInput.addEventListener('change', () => {
      renameMemberDoc(m.id, nameInput.value.trim() || m.name).catch(() => toast('Could not rename member.'));
    });
    row.appendChild(nameInput);

    const rateWrap = document.createElement('span');
    rateWrap.className = 'rate-wrap';
    const rateInput = document.createElement('input');
    rateInput.type = 'number';
    rateInput.min = '0';
    rateInput.step = '0.01';
    rateInput.value = m.hourlyRate || 0;
    const isSelf = currentUser && m.id === currentUser.email;
    rateInput.disabled = !isSelf;
    rateInput.title = isSelf ? 'Your hourly rate' : `${m.name}'s hourly rate (only they can change it)`;
    rateInput.addEventListener('change', () => {
      setOwnHourlyRate(m.id, rateInput.value).catch(() => toast('Could not update your rate.'));
    });
    rateWrap.appendChild(document.createTextNode('$'));
    rateWrap.appendChild(rateInput);
    rateWrap.appendChild(document.createTextNode('/hr'));
    row.appendChild(rateWrap);

    const roleTag = document.createElement('span');
    roleTag.className = 'role-tag' + (m.role === 'admin' ? ' admin' : '');
    roleTag.textContent = m.role === 'admin' ? 'Admin' : 'Member';
    row.appendChild(roleTag);

    if (iAmAdmin && m.id !== currentUser.email) {
      const toggleAdminBtn = document.createElement('button');
      toggleAdminBtn.type = 'button';
      toggleAdminBtn.className = 'row-icon-btn';
      toggleAdminBtn.textContent = m.role === 'admin' ? '▾admin' : '▴admin';
      toggleAdminBtn.title = m.role === 'admin' ? 'Remove admin' : 'Make admin';
      toggleAdminBtn.addEventListener('click', () => {
        setMemberRole(m.id, m.role === 'admin' ? 'member' : 'admin').catch(() => toast('Could not change role.'));
      });
      row.appendChild(toggleAdminBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'row-icon-btn danger';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove member';
      removeBtn.addEventListener('click', () => {
        if (confirm(`Remove ${m.name} (${m.id})? They will no longer be able to sign in.`)) {
          deleteMemberDoc(m.id).catch(() => toast('Could not remove member.'));
        }
      });
      row.appendChild(removeBtn);
    }

    refs.settingsMembers.appendChild(row);
  }

  refs.settingsAddMemberField.hidden = !iAmAdmin;
  refs.settingsSignedInAs.textContent = currentUser ? `${currentUser.displayName} (${currentUser.email})` : '';
}

function openSettingsPanel() {
  buildSettingsPanel();
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
  refs.settingsAddMemberForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = refs.newMemberEmail.value.trim().toLowerCase();
    const name = refs.newMemberName.value.trim();
    if (!email || !name) return;
    createMember(email, name)
      .then(() => {
        refs.newMemberEmail.value = '';
        refs.newMemberName.value = '';
        toast(`Added ${name} — they can sign in with ${email} right away.`);
      })
      .catch(() => toast('Could not add member — check you still have admin rights.'));
  });
}

// ---------- Auth gate ----------

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

  currentUser = user;
  setActor(user.displayName || user.email, user.email);
  showAuthGate('Loading your team’s board…', { showSignIn: false, showSignOut: true });

  if (!storeSubscribed) {
    storeSubscribed = true;
    wireTabs();
    wireToolbar();
    wireSidebarDelegation();
    wireTaskPanel(refs, api);
    wireSettingsPanel();
    wireTimeCost(refs, api);
    attachDragInteractions(refs.chartCol, api);

    setLiveStatus('connecting', 'Connecting…');

    subscribe(onStoreChange, handleStoreError);
    ensureSeeded().catch(() => {}); // no-op if this account can't write yet (not a member) or rows already exist

    window.addEventListener('online', () => setLiveStatus('live', 'Live — synced'));
    window.addEventListener('offline', () => setLiveStatus('offline', 'Offline — changes will sync once reconnected'));
  }
}

function notOnTeamMessage() {
  return `${currentUser.email} isn't on this team's member list yet. Ask an admin to add you from the Settings panel.`;
}

function handleStoreError(err) {
  if (err && err.code === 'permission-denied') {
    showAuthGate(notOnTeamMessage(), { showSignIn: false, showSignOut: true });
  } else {
    toast('Connection error — check your internet connection.');
  }
}

function onStoreChange(state) {
  if (state.loaded.members && !state.members.find((m) => currentUser && m.id === currentUser.email)) {
    showAuthGate(notOnTeamMessage(), { showSignIn: false, showSignOut: true });
    return;
  }
  if (!state.loaded.members) return; // wait for the real answer instead of flashing the gate

  showApp(currentUser);
  setLiveStatus(navigator.onLine ? 'live' : 'offline', navigator.onLine ? 'Live — synced' : 'Offline — changes will sync once reconnected');

  if (activeTab === 'gantt') rerenderGantt(); else rerenderTimeCost();
  if (!refs.taskPanel.hidden && refs.taskPanel.dataset.taskId) {
    populateTaskPanel(refs, api, refs.taskPanel.dataset.taskId);
  }
  if (!refs.settingsPanel.hidden) buildSettingsPanel();
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

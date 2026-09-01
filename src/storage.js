// Persistence: File System Access API (primary, for the shared OneDrive folder)
// plus an Import/Export JSON fallback for browsers that don't support it.

import { createDefaultState } from './state.js';

export const supportsFSAccess = 'showDirectoryPicker' in window;

const DB_NAME = 'team-gantt-chart';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'sharedDirectory';
const MAIN_FILE_NAME = 'gantt-data.json';
const MAX_BACKUPS = 15;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDirectoryHandle(handle) {
  await idbSet(HANDLE_KEY, handle);
}

export async function loadDirectoryHandle() {
  try {
    return (await idbGet(HANDLE_KEY)) || null;
  } catch {
    return null;
  }
}

// mode: 'read' or 'readwrite'. Returns true if permission is (now) granted.
export async function verifyPermission(handle, mode = 'readwrite') {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await saveDirectoryHandle(handle);
  return handle;
}

export async function readGanttFile(dirHandle) {
  let fileHandle;
  try {
    fileHandle = await dirHandle.getFileHandle(MAIN_FILE_NAME, { create: false });
  } catch (err) {
    if (err.name === 'NotFoundError') {
      const initial = createDefaultState();
      await writeGanttFile(dirHandle, initial);
      return initial;
    }
    throw err;
  }
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

async function pruneBackups(dirHandle) {
  const backups = [];
  for await (const [name, entryHandle] of dirHandle.entries()) {
    if (entryHandle.kind === 'file' && /^gantt-data\.backup-.*\.json$/.test(name)) {
      backups.push(name);
    }
  }
  backups.sort(); // timestamps in the name sort chronologically
  const excess = backups.length - MAX_BACKUPS;
  for (let i = 0; i < excess; i++) {
    await dirHandle.removeEntry(backups[i]);
  }
}

export async function writeGanttFile(dirHandle, state) {
  const json = JSON.stringify(state, null, 2);

  const mainHandle = await dirHandle.getFileHandle(MAIN_FILE_NAME, { create: true });
  const mainWritable = await mainHandle.createWritable();
  await mainWritable.write(json);
  await mainWritable.close();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupHandle = await dirHandle.getFileHandle(`gantt-data.backup-${stamp}.json`, { create: true });
  const backupWritable = await backupHandle.createWritable();
  await backupWritable.write(json);
  await backupWritable.close();

  await pruneBackups(dirHandle);
}

export function exportJSON(state) {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gantt-data-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

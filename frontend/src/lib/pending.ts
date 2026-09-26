// A resume dropped on the landing page before sign-in; picked up by New Scan after auth.
// Kept in memory for the normal in-app flow and mirrored to IndexedDB so it survives a page
// reload (e.g. opening a password-reset or invite link in the same tab). Storage failures
// (private windows, blocked site data) just fall back to the in-memory copy.

const DB = 'resumint';
const STORE = 'pending';
const KEY = 'resume';
const MAX_AGE_MS = 60 * 60 * 1000;

let pending: File | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function setPendingResume(f: File | null) {
  pending = f;
  void (f ? withStore('readwrite', (s) => s.put({ file: f, savedAt: Date.now() }, KEY)) : withStore('readwrite', (s) => s.delete(KEY))).catch(() => {});
}

export async function takePendingResume(): Promise<File | null> {
  let f = pending;
  pending = null;
  try {
    const saved = await withStore<{ file: File; savedAt: number } | undefined>('readonly', (s) => s.get(KEY));
    if (!f && saved && Date.now() - saved.savedAt < MAX_AGE_MS) f = saved.file;
    if (saved) await withStore('readwrite', (s) => s.delete(KEY));
  } catch {
    /* storage unavailable: the in-memory copy is all we have */
  }
  return f;
}

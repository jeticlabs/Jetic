// ─── Trace persistence layer (IndexedDB) ──────────────────────────────────────
// No external deps — uses native IndexedDB API.

const DB_NAME = 'jetic-traces';
const DB_VERSION = 1;
const STORE = 'traces';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceStepRecord {
  index: number;
  name: string;
  method: string;
  path: string;
  description?: string;
  // Result
  status: number;
  passed: boolean;
  durationMs: number;
  // Vars
  captured: Record<string, string>;   // varName → value
  injected: Record<string, string>;   // header → value
  // Bodies
  requestBody?: any;
  responseBody?: any;
  error: string | null;
  // Step definition extras (from workflow file)
  expectStatus?: number;
  captureSpec?: Record<string, string>; // jsonpath spec e.g. "body:$.token"
  injectSpec?: Record<string, string>;  // header → varName
}

export interface TraceRecord {
  id: string;
  workflowName: string;
  workflowFile: string;
  startedAt: string;   // ISO
  finishedAt: string;  // ISO
  durationMs: number;
  phase: 'done' | 'aborted' | 'error';
  passed: number;
  failed: number;
  baseUrl?: string;
  source: 'local-sim' | 'api';
  steps: TraceStepRecord[];
}

// ─── DB init ──────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('workflowFile', 'workflowFile', { unique: false });
        store.createIndex('startedAt', 'startedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveTrace(record: TraceRecord): Promise<string> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve(record.id);
    req.onerror = () => reject(req.error);
  });
}

export async function listTraces(): Promise<TraceRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all: TraceRecord[] = req.result ?? [];
      // Newest first
      resolve(all.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getTrace(id: string): Promise<TraceRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTrace(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllTraces(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// تخزين ملفات الرفع الجارية في IndexedDB حتى يكمل الرفع
// بعد تحديث الصفحة أو الانتقال لصفحة أخرى (طالما الجهاز لم يُغلق/المتصفح مفتوح).

const DB_NAME = "magpro-uploads";
const STORE = "pending";
const VERSION = 1;

export type PendingUpload = {
  id: string;
  courseId: string;
  objectName: string;
  title: string;
  sortOrder: number;
  fileName: string;
  fileType: string;
  file: Blob;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const uploadStore = {
  put: (rec: PendingUpload) => tx<void>("readwrite", (s) => s.put(rec)),
  remove: (id: string) => tx<void>("readwrite", (s) => s.delete(id)),
  all: async () => ((await tx<PendingUpload[]>("readonly", (s) => s.getAll())) ?? []),
};

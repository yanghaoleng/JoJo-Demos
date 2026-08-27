export const MEDIA_LIBRARY_LIMIT = 30;

const DATABASE_NAME = "jocam-media-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "captures";

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Media library transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("Media library transaction was aborted"));
  });
}

function openMediaDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Media library could not be opened"));
  });
}

function readRecentCaptures(store, limit) {
  return new Promise((resolve, reject) => {
    const captures = [];
    const request = store.index("createdAt").openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || captures.length >= limit) {
        resolve(captures);
        return;
      }
      captures.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("Media library could not be read"));
  });
}

function readStaleCaptureIds(store, limit) {
  return new Promise((resolve, reject) => {
    const staleIds = [];
    let position = 0;
    const request = store.index("createdAt").openKeyCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(staleIds);
        return;
      }
      if (position >= limit) staleIds.push(cursor.primaryKey);
      position += 1;
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error("Media library could not be pruned"));
  });
}

export function sortMediaCaptures(captures = []) {
  return [...captures].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}

export function toStoredMediaCapture(capture) {
  const { url: _temporaryUrl, ...storedCapture } = capture;
  return storedCapture;
}

export async function loadMediaCaptures(limit = MEDIA_LIBRARY_LIMIT) {
  const database = await openMediaDatabase();
  if (!database) return [];
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const captures = await readRecentCaptures(store, limit);
    await transactionDone(transaction);
    return captures;
  } finally {
    database.close();
  }
}

export async function storeMediaCapture(capture, limit = MEDIA_LIBRARY_LIMIT) {
  const database = await openMediaDatabase();
  if (!database) return false;
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(toStoredMediaCapture(capture));
    const staleIds = await readStaleCaptureIds(store, limit);
    for (const staleId of staleIds) store.delete(staleId);
    await transactionDone(transaction);
    return true;
  } finally {
    database.close();
  }
}

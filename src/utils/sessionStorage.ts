import { type AnalysisSession } from "../types/biomechanics";

const DB_NAME = "sports_ai_db";
const DB_VERSION = 1;
const STORE_NAME = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저는 로컬 분석 기록 저장소(IndexedDB)를 지원하지 않습니다."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("로컬 분석 기록 데이터베이스를 여는 중 오류가 발생했습니다."));
  });
}

export async function saveAnalysisSession(session: AnalysisSession): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(session);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("분석 기록을 저장하지 못했습니다. 브라우저 저장 공간이 부족할 수 있습니다."));
    };
  });
}

export async function listAnalysisSessions(): Promise<AnalysisSession[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      db.close();
      const items = (req.result as AnalysisSession[]) ?? [];
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(items);
    };
    req.onerror = () => {
      db.close();
      reject(new Error("저장된 분석 기록을 불러오는 중 오류가 발생했습니다."));
    };
  });
}

export async function deleteAnalysisSession(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("분석 기록 삭제에 실패했습니다."));
    };
  });
}

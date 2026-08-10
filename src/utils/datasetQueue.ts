export interface DatasetParticipantPayload {
  id: string;
  user_id: string;
  pseudonym: string;
  dominant_hand: 'right' | 'left' | 'both';
  country_code: string;
  is_adult: true;
  consent_version: string;
  consent_research: boolean;
  consent_product: boolean;
  consented_at: string;
  withdrawn_at: null;
}

export interface QueuedSignRecording {
  id: string;
  userId: string;
  participant: DatasetParticipantPayload;
  labelCode: string;
  variant: 'LSD' | 'ASL';
  blob: Blob;
  extension: 'webm' | 'mp4';
  contentType: string;
  landmarkSequence: unknown[];
  durationMs: number;
  frameCount: number;
  cameraFacing: 'user' | 'environment';
  createdAt: string;
}

const DB_NAME = 'signtalk-dataset';
const STORE_NAME = 'pending-recordings';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueSignRecording(recording: QueuedSignRecording) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(recording);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listQueuedSignRecordings(userId: string): Promise<QueuedSignRecording[]> {
  const database = await openDatabase();
  const records = await new Promise<QueuedSignRecording[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).index('userId').getAll(userId);
    request.onsuccess = () => resolve(request.result as QueuedSignRecording[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records;
}

export async function removeQueuedSignRecording(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function clearQueuedSignRecordings(userId: string) {
  const records = await listQueuedSignRecordings(userId);
  await Promise.all(records.map((record) => removeQueuedSignRecording(record.id)));
}

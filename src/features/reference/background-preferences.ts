export const backgroundSlots = [
  'splash',
  'home',
  'transactions',
  'entry',
  'statistics',
  'profile',
  'profileSubpage',
] as const;

export type BackgroundSlot = typeof backgroundSlots[number];
export type BackgroundOverrides = Partial<Record<BackgroundSlot, string>>;

type StoredBackground = {
  slot: BackgroundSlot;
  bytes: ArrayBuffer;
  type: string;
};

const databaseName = 'seabreeze-appearance';
const storeName = 'backgrounds';
const maximumBackgroundBytes = 8 * 1024 * 1024;
const supportedBackgroundTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function openBackgroundDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('背景存储不可用'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('背景存储失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('背景存储已取消'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('背景读取失败'));
  });
}

function imageDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('背景图片读取失败'));
    reader.onerror = () => reject(new Error('背景图片读取失败'));
    reader.readAsDataURL(image);
  });
}

function imageBytes(image: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error('背景图片读取失败'));
    reader.onerror = () => reject(new Error('背景图片读取失败'));
    reader.readAsArrayBuffer(image);
  });
}

export async function loadBackgroundOverrides(): Promise<BackgroundOverrides> {
  const database = await openBackgroundDatabase();
  try {
    const transaction = database.transaction(storeName, 'readonly');
    const completion = waitForTransaction(transaction);
    const records = await requestResult(
      transaction.objectStore(storeName).getAll() as IDBRequest<StoredBackground[]>,
    );
    await completion;
    const entries = await Promise.all(records.map(async (record) => (
      [record.slot, await imageDataUrl(new Blob([record.bytes], { type: record.type }))] as const
    )));
    return Object.fromEntries(entries) as BackgroundOverrides;
  } finally {
    database.close();
  }
}

export async function saveBackgroundOverride(slot: BackgroundSlot, file: File): Promise<string> {
  if (!supportedBackgroundTypes.has(file.type)) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片');
  }
  if (file.size > maximumBackgroundBytes) {
    throw new Error('背景图片不能超过 8 MB');
  }

  const database = await openBackgroundDatabase();
  try {
    const bytes = await imageBytes(file);
    const transaction = database.transaction(storeName, 'readwrite');
    const completion = waitForTransaction(transaction);
    transaction.objectStore(storeName).put({ slot, bytes, type: file.type } satisfies StoredBackground);
    await completion;
  } finally {
    database.close();
  }
  return imageDataUrl(file);
}

export async function resetBackgroundOverride(slot: BackgroundSlot): Promise<void> {
  const database = await openBackgroundDatabase();
  try {
    const transaction = database.transaction(storeName, 'readwrite');
    const completion = waitForTransaction(transaction);
    transaction.objectStore(storeName).delete(slot);
    await completion;
  } finally {
    database.close();
  }
}

export type ProfileTextPreferences = {
  ledgerName: string;
  signature: string;
};

export const defaultProfileTextPreferences: ProfileTextPreferences = {
  ledgerName: '海风的小账本',
  signature: '记录生活，遇见美好',
};

const textPreferencesKey = 'seabreeze-profile-preferences';
const avatarDatabaseName = 'seabreeze-profile-appearance';
const avatarStoreName = 'avatars';
const currentAvatarId = 'current';
const maximumAvatarBytes = 5 * 1024 * 1024;
const supportedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

type StoredAvatar = {
  id: typeof currentAvatarId;
  bytes: ArrayBuffer;
  type: string;
};

export function loadProfileTextPreferences(): ProfileTextPreferences {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(textPreferencesKey) ?? 'null');
    if (typeof stored !== 'object' || stored === null) return defaultProfileTextPreferences;
    const candidate = stored as Partial<ProfileTextPreferences>;
    return {
      ledgerName: typeof candidate.ledgerName === 'string' && candidate.ledgerName.trim()
        ? candidate.ledgerName.trim()
        : defaultProfileTextPreferences.ledgerName,
      signature: typeof candidate.signature === 'string'
        ? candidate.signature.trim()
        : defaultProfileTextPreferences.signature,
    };
  } catch {
    return defaultProfileTextPreferences;
  }
}

export function saveProfileTextPreferences(preferences: ProfileTextPreferences): void {
  localStorage.setItem(textPreferencesKey, JSON.stringify({
    ledgerName: preferences.ledgerName.trim(),
    signature: preferences.signature.trim(),
  }));
}

function openAvatarDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(avatarDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(avatarStoreName)) {
        request.result.createObjectStore(avatarStoreName, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('头像存储不可用'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('头像保存失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('头像保存已取消'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('头像读取失败'));
  });
}

function imageDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('头像读取失败'));
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.readAsDataURL(image);
  });
}

function imageBytes(image: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new Error('头像读取失败'));
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.readAsArrayBuffer(image);
  });
}

export async function loadProfileAvatar(): Promise<string | undefined> {
  const database = await openAvatarDatabase();
  try {
    const transaction = database.transaction(avatarStoreName, 'readonly');
    const completion = waitForTransaction(transaction);
    const avatar = await requestResult(
      transaction.objectStore(avatarStoreName).get(currentAvatarId) as IDBRequest<StoredAvatar | undefined>,
    );
    await completion;
    return avatar
      ? imageDataUrl(new Blob([avatar.bytes], { type: avatar.type }))
      : undefined;
  } finally {
    database.close();
  }
}

export async function saveProfileAvatar(file: File): Promise<string> {
  if (!supportedAvatarTypes.has(file.type)) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片');
  }
  if (file.size > maximumAvatarBytes) {
    throw new Error('头像图片不能超过 5 MB');
  }

  const bytes = await imageBytes(file);
  const database = await openAvatarDatabase();
  try {
    const transaction = database.transaction(avatarStoreName, 'readwrite');
    const completion = waitForTransaction(transaction);
    transaction.objectStore(avatarStoreName).put({
      id: currentAvatarId,
      bytes,
      type: file.type,
    } satisfies StoredAvatar);
    await completion;
  } finally {
    database.close();
  }
  return imageDataUrl(file);
}

export async function resetProfileAvatar(): Promise<void> {
  const database = await openAvatarDatabase();
  try {
    const transaction = database.transaction(avatarStoreName, 'readwrite');
    const completion = waitForTransaction(transaction);
    transaction.objectStore(avatarStoreName).delete(currentAvatarId);
    await completion;
  } finally {
    database.close();
  }
}

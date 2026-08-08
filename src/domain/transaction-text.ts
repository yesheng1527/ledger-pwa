const TEXT_PREFIX = '@seabreeze-transaction-text:2:';
const MAX_STORED_LENGTH = 500;

export interface TransactionText {
  name: string;
  note: string;
  legacy: boolean;
}

type StoredEnvelope = {
  name: string;
  note: string;
  check: string;
};

function checksum(transactionId: string, name: string, note: string): string {
  const input = `${transactionId}\u0000${name}\u0000${note}`;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, '0');
}

export function decodeTransactionText(transactionId: string, stored: string): TransactionText {
  if (!stored.startsWith(TEXT_PREFIX)) {
    return { name: '', note: stored, legacy: stored.length > 0 };
  }

  try {
    const value = JSON.parse(stored.slice(TEXT_PREFIX.length)) as unknown;
    if (!value || typeof value !== 'object') throw new Error('invalid');
    const candidate = value as Partial<StoredEnvelope>;
    if (
      typeof candidate.name !== 'string'
      || typeof candidate.note !== 'string'
      || typeof candidate.check !== 'string'
      || candidate.check !== checksum(transactionId, candidate.name, candidate.note)
    ) {
      throw new Error('invalid');
    }
    return { name: candidate.name, note: candidate.note, legacy: false };
  } catch {
    // Prefix collisions and damaged envelopes are legacy notes. Preserve every character.
    return { name: '', note: stored, legacy: true };
  }
}

export function encodeTransactionText(transactionId: string, name: string, note: string): string {
  const normalizedName = name.trim();
  const normalizedNote = note.trim();
  if (normalizedName.length > 80) throw new Error('流水名称不能超过80个字符');
  if (normalizedNote.length > 300) throw new Error('流水备注不能超过300个字符');

  // A decoded envelope can safely pass through this boundary without nesting.
  const existing = decodeTransactionText(transactionId, note);
  if (!existing.legacy && normalizedName.length === 0) return note;

  const envelope: StoredEnvelope = {
    name: normalizedName,
    note: normalizedNote,
    check: checksum(transactionId, normalizedName, normalizedNote),
  };
  const stored = `${TEXT_PREFIX}${JSON.stringify(envelope)}`;
  if (stored.length > MAX_STORED_LENGTH) throw new Error('流水名称和备注内容过长');
  return stored;
}

export function isInternalTransactionText(value: string): boolean {
  return value.startsWith(TEXT_PREFIX);
}


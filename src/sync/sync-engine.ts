import type { OutboxRecord, ServerChange } from '../db/records';
import type { LedgerOperation } from '../domain/operations';
import type { ApplyOperationResult, PullChangesResult } from '../services/ledger-api';

const NETWORK_ERROR_MESSAGE = '网络连接失败，稍后会自动重试';
const SYNC_ERROR_MESSAGE = '同步失败，请稍后重试';
const CONFLICT_MESSAGE = '存在需要处理的数据冲突';
const DECIMAL_CURSOR = /^\d+$/;

export type SyncStatus = {
  mode: 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';
  pendingCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};

export interface SyncRepository {
  listPendingOperations(now?: string): Promise<OutboxRecord[]>;
  getPendingOperationCount(): Promise<number>;
  hasUnresolvedConflicts(ledgerId: string): Promise<boolean>;
  markOperationFailed(operationId: string, message: string): Promise<void>;
  markOperationConflict(operationId: string, serverRecord: unknown): Promise<void>;
  markOperationSynced(operationId: string): Promise<void>;
  getChangeCursor(ledgerId: string): Promise<string>;
  applyServerChanges(
    ledgerId: string,
    changes: readonly ServerChange[],
    nextCursor: string,
  ): Promise<void>;
}

export interface SyncApi {
  applyOperation(operation: LedgerOperation): Promise<ApplyOperationResult>;
  pullChanges(ledgerId: string, afterSeq: string): Promise<PullChangesResult>;
}

type SyncStatusListener = (status: SyncStatus) => void;

function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function errorSummary(error: unknown): string {
  let detail: string | null = typeof error === 'string' ? error : null;
  if (detail === null && error !== null && (typeof error === 'object' || typeof error === 'function')) {
    try {
      const message = Reflect.get(error, 'message');
      if (typeof message === 'string') detail = message;
    } catch {
      detail = null;
    }
  }
  return detail !== null && /fetch|network|econnreset/i.test(detail)
    ? NETWORK_ERROR_MESSAGE
    : SYNC_ERROR_MESSAGE;
}

function compareDecimalCursors(left: string, right: string): number {
  if (!DECIMAL_CURSOR.test(left) || !DECIMAL_CURSOR.test(right)) {
    throw new Error(SYNC_ERROR_MESSAGE);
  }
  const normalizedLeft = left.replace(/^0+(?=\d)/, '');
  const normalizedRight = right.replace(/^0+(?=\d)/, '');
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1;
  }
  return normalizedLeft.localeCompare(normalizedRight);
}

export class SyncEngine {
  private inFlight: Promise<void> | null = null;
  private rerunRequested = false;
  private status: SyncStatus = {
    mode: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    message: null,
  };
  private readonly listeners = new Set<SyncStatusListener>();

  constructor(
    private readonly ledgerId: string,
    private readonly repository: SyncRepository,
    private readonly api: SyncApi,
    private readonly isOnline: () => boolean = defaultIsOnline,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  syncNow(): Promise<void> {
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.runRequestedSyncs().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async runRequestedSyncs(): Promise<void> {
    do {
      this.rerunRequested = false;
      await this.run();
    } while (this.rerunRequested);
  }

  private setStatus(next: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.listeners) {
      try {
        listener(this.getStatus());
      } catch {
        // Subscriber failures must not change synchronization state.
      }
    }
  }

  private async setError(error: unknown): Promise<void> {
    let pendingCount = this.status.pendingCount;
    try {
      pendingCount = await this.repository.getPendingOperationCount();
    } catch {
      // Keep the last known count when local status storage is unavailable.
    }
    this.setStatus({
      mode: 'error',
      pendingCount,
      message: errorSummary(error),
    });
  }

  private async pullAllChanges(): Promise<void> {
    let cursor = await this.repository.getChangeCursor(this.ledgerId);
    if (!DECIMAL_CURSOR.test(cursor)) throw new Error(SYNC_ERROR_MESSAGE);

    while (true) {
      const page = await this.api.pullChanges(this.ledgerId, cursor);
      const cursorComparison = compareDecimalCursors(page.nextCursor, cursor);
      if (page.changes.length > 0 && cursorComparison <= 0) {
        throw new Error(SYNC_ERROR_MESSAGE);
      }
      if (page.changes.length === 0 && cursorComparison !== 0) {
        throw new Error(SYNC_ERROR_MESSAGE);
      }

      await this.repository.applyServerChanges(this.ledgerId, page.changes, page.nextCursor);
      if (page.changes.length === 0) return;
      cursor = page.nextCursor;
    }
  }

  private async run(): Promise<void> {
    let currentOperation: OutboxRecord | null = null;
    try {
      const pendingCount = await this.repository.getPendingOperationCount();
      if (!this.isOnline()) {
        this.setStatus({ mode: 'offline', pendingCount, message: null });
        return;
      }

      this.setStatus({ mode: 'syncing', pendingCount, message: null });
      let hasConflict = await this.repository.hasUnresolvedConflicts(this.ledgerId);
      const operations = hasConflict
        ? []
        : await this.repository.listPendingOperations(this.now().toISOString());

      for (const operation of operations) {
        currentOperation = operation;
        const result = await this.api.applyOperation(operation.payload);
        if (result.status === 'applied') {
          await this.repository.markOperationSynced(operation.operationId);
          currentOperation = null;
          continue;
        }

        await this.repository.markOperationConflict(operation.operationId, result.server);
        currentOperation = null;
        hasConflict = true;
        break;
      }

      await this.pullAllChanges();
      const finalPendingCount = await this.repository.getPendingOperationCount();
      if (hasConflict) {
        this.setStatus({
          mode: 'conflict',
          pendingCount: finalPendingCount,
          message: CONFLICT_MESSAGE,
        });
        return;
      }

      this.setStatus({
        mode: 'idle',
        pendingCount: finalPendingCount,
        lastSyncedAt: this.now().toISOString(),
        message: null,
      });
    } catch (error) {
      if (currentOperation) {
        const summary = errorSummary(error);
        try {
          await this.repository.markOperationFailed(currentOperation.operationId, summary);
        } catch {
          // The error status below still reports the failed synchronization.
        }
      }
      await this.setError(error);
    }
  }
}

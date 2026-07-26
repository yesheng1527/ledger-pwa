import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { UndoToast } from '../../design-system/components/UndoToast';
import type { LedgerViewModel } from '../../view-model/ledger-view-model';
import type { TransactionDetail, TransactionEditInput } from '../../view-model/types';
import { useLedgerQuery } from '../../view-model/use-ledger-query';
import { TransactionDetailSheet } from './TransactionDetailSheet';
import { TransactionEditForm } from './TransactionEditForm';
import styles from './TransactionsPage.module.css';

export type TransactionOverlaysProps = {
  viewModel: LedgerViewModel;
  transactionId: string | null;
  onCloseDetail(): void;
  onDetailOpenChange(open: boolean): void;
  onReload(): void;
};

type PendingUndo = {
  transactionId: string;
  expiresAt: string;
};

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'));
}

export function TransactionOverlays({
  viewModel,
  transactionId,
  onCloseDetail,
  onDetailOpenChange,
  onReload,
}: TransactionOverlaysProps) {
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [editDetail, setEditDetail] = useState<TransactionDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLElement | null>(null);
  const previousIdRef = useRef<string | null>(null);
  const previousOpenRef = useRef(false);
  const activeTransactionIdRef = useRef(transactionId);
  const deleteLockRef = useRef<string | null>(null);
  activeTransactionIdRef.current = transactionId;

  const detailResult = useLedgerQuery(
    viewModel,
    transactionId ?? 'closed',
    async () => ({
      requestedId: transactionId,
      detail: transactionId === null
        ? null
        : await viewModel.getTransactionDetail(transactionId),
    }),
  );

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    const isOpen = transactionId !== null;
    if (isOpen && previousIdRef.current === null) {
      sourceRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    if (isOpen && previousIdRef.current !== transactionId) {
      setMode('detail');
      setEditDetail(null);
      setDeleteError(null);
    }
    if (wasOpen !== isOpen) onDetailOpenChange(isOpen);
    if (wasOpen && !isOpen) {
      queueMicrotask(() => sourceRef.current?.focus());
    }
    previousOpenRef.current = isOpen;
    previousIdRef.current = transactionId;
  }, [onDetailOpenChange, transactionId]);

  useEffect(() => {
    if (transactionId === null) return;
    dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [transactionId]);

  const resultMatchesRequest = detailResult.status === 'ready'
    && detailResult.data.requestedId === transactionId;
  const detail = resultMatchesRequest ? detailResult.data.detail : null;
  const detailLoading = detailResult.status === 'loading'
    || (detailResult.status === 'ready' && !resultMatchesRequest);
  const detailReady = detail !== null;

  useEffect(() => {
    if (transactionId === null || detail === null) return;
    const firstAction = dialogRef.current?.querySelector<HTMLElement>(
      '[data-dialog-initial-focus]',
    ) ?? dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
    firstAction?.focus();
  }, [detailReady, mode, transactionId]);

  const close = useCallback(() => {
    onCloseDetail();
  }, [onCloseDetail]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const save = async (input: TransactionEditInput) => {
    await viewModel.updateTransaction(input);
    setEditDetail(null);
    setMode('detail');
  };

  const remove = async () => {
    if (!detail || deleteLockRef.current !== null) return;
    const deletingId = detail.id;
    deleteLockRef.current = deletingId;
    setDeleting(true);
    setDeleteError(null);
    try {
      const result = await viewModel.deleteTransaction(deletingId);
      setPendingUndo({ transactionId: deletingId, expiresAt: result.undoUntil });
      if (activeTransactionIdRef.current === deletingId) close();
    } catch {
      deleteLockRef.current = null;
      if (activeTransactionIdRef.current === deletingId) {
        setDeleteError('删除失败，请稍后重试');
      }
    } finally {
      setDeleting(false);
    }
  };

  const undoDelete = useCallback(async () => {
    if (!pendingUndo) return;
    await viewModel.undoTransactionDelete(pendingUndo.transactionId);
    deleteLockRef.current = null;
    setPendingUndo(null);
  }, [pendingUndo, viewModel]);

  const expireDelete = useCallback(async () => {
    await viewModel.flushPendingDelete();
    deleteLockRef.current = null;
    setPendingUndo(null);
  }, [viewModel]);

  return (
    <>
      {transactionId !== null ? (
        <div className={styles.overlayBackdrop}>
          <div
            ref={dialogRef}
            className={styles.detailDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-detail-title"
            onKeyDown={handleDialogKeyDown}
          >
            <div className={styles.dialogHeading}>
              <h2 id="transaction-detail-title">
                {mode === 'detail' ? '流水详情' : '编辑流水'}
              </h2>
              <button className={styles.iconAction} type="button" onClick={close} aria-label="关闭详情">
                ×
              </button>
            </div>

            {detailLoading ? (
              <p role="status">正在读取流水详情…</p>
            ) : null}
            {detailResult.status === 'error' ? (
              <div className={styles.overlayError} role="alert">
                <p>流水详情暂时无法读取</p>
                <button type="button" onClick={detailResult.retry}>重试</button>
              </div>
            ) : null}
            {resultMatchesRequest && detail === null ? (
              <p className={styles.overlayError} role="alert">这笔流水已不存在或已删除</p>
            ) : null}
            {detail ? (
              mode === 'detail' ? (
                <TransactionDetailSheet
                  detail={detail}
                  deleting={deleting}
                  editDisabled={deleteLockRef.current !== null}
                  deleteDisabled={deleteLockRef.current !== null}
                  deleteMessage={deleting
                    ? '上一笔删除正在处理中，请稍候'
                    : pendingUndo
                      ? '请先处理上一笔删除的撤销机会'
                      : null}
                  error={deleteError}
                  onEdit={() => {
                    if (deleteLockRef.current !== null) return;
                    setEditDetail(detail);
                    setMode('edit');
                  }}
                  onDelete={remove}
                />
              ) : (
                <TransactionEditForm
                  key={editDetail?.id ?? detail.id}
                  detail={editDetail ?? detail}
                  onCancel={() => {
                    setEditDetail(null);
                    setMode('detail');
                  }}
                  onSave={save}
                />
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingUndo ? (
        <div className={styles.undoToast}>
          <UndoToast
            message="流水已删除，8 秒内可以撤销"
            undoLabel="撤销删除"
            expiresAt={pendingUndo.expiresAt}
            onUndo={undoDelete}
            onExpire={expireDelete}
            onReload={onReload}
          />
        </div>
      ) : null}
    </>
  );
}

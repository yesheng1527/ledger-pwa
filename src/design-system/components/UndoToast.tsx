import { useEffect, useRef, useState } from 'react';

export type UndoToastProps = {
  message: string;
  undoLabel: string;
  expiresAt: string;
  onUndo(): Promise<void>;
  onExpire(): Promise<void>;
  onReload(): void;
};

export function UndoToast({
  message,
  undoLabel,
  expiresAt,
  onUndo,
  onExpire,
  onReload,
}: UndoToastProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const clearExpiration = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    settledRef.current = false;
    setBusy(false);
    setFailure(null);
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    timeoutRef.current = setTimeout(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      timeoutRef.current = null;
      void onExpire().catch(() => {
        setFailure('删除同步失败，请重新加载');
      });
    }, delay);
    return clearExpiration;
  }, [expiresAt, onExpire]);

  const undo = async () => {
    if (settledRef.current || busy) return;
    settledRef.current = true;
    clearExpiration();
    setBusy(true);
    try {
      await onUndo();
    } catch {
      setFailure('撤销失败，请重新加载');
      setBusy(false);
    }
  };

  return (
    <div className="ds-undo-toast" role="status" aria-live="polite">
      <span>{failure ?? message}</span>
      {failure ? (
        <button
          type="button"
          style={{ minHeight: 'var(--control-height)' }}
          onClick={onReload}
        >
          重新加载
        </button>
      ) : (
        <button
          type="button"
          style={{ minHeight: 'var(--control-height)' }}
          disabled={busy}
          onClick={() => void undo()}
        >
          {undoLabel}
        </button>
      )}
    </div>
  );
}

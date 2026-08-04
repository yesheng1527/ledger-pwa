import { useCallback, useEffect, useRef, useState } from 'react';
import type { LedgerViewModel } from './ledger-view-model';
import type { LedgerQueryState } from './types';

export function useLedgerQuery<T>(
  viewModel: Pick<LedgerViewModel, 'subscribe'>,
  queryKey: string,
  load: () => Promise<T>,
): LedgerQueryState<T> {
  const requestId = useRef(0);
  const reloadRef = useRef<() => void>(() => undefined);
  const [state, setState] = useState<LedgerQueryState<T>>({ status: 'loading' });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => {
    const current = ++requestId.current;
    setState((previous) => previous.status === 'ready' ? previous : { status: 'loading' });
    void loadRef.current().then(
      (data) => {
        if (requestId.current === current) setState({ status: 'ready', data });
      },
      () => {
        if (requestId.current === current) {
          setState({ status: 'error', retry: () => reloadRef.current() });
        }
      },
    );
  }, []);
  reloadRef.current = reload;

  useEffect(() => {
    reload();
    const unsubscribe = viewModel.subscribe(reload);
    return () => {
      requestId.current += 1;
      unsubscribe();
    };
  }, [queryKey, reload, viewModel]);
  return state;
}

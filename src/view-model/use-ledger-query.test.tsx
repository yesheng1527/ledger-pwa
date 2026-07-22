import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LedgerQueryState } from './types';
import { useLedgerQuery } from './use-ledger-query';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function subscriptionSource() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit() {
      listeners.forEach((listener) => listener());
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
}

function QueryProbe({
  source,
  queryKey,
  load,
}: {
  source: ReturnType<typeof subscriptionSource>;
  queryKey: string;
  load: () => Promise<string>;
}) {
  const state: LedgerQueryState<string> = useLedgerQuery(source, queryKey, load);
  if (state.status === 'loading') return <p>loading</p>;
  if (state.status === 'error') return <button onClick={state.retry}>retry</button>;
  return <p>{state.data}</p>;
}

describe('useLedgerQuery', () => {
  it('ignores a stale response when a newer query resolves first', async () => {
    const source = subscriptionSource();
    const first = deferred<string>();
    const second = deferred<string>();
    const view = render(
      <QueryProbe source={source} queryKey="first" load={() => first.promise} />,
    );

    view.rerender(
      <QueryProbe source={source} queryKey="second" load={() => second.promise} />,
    );
    await act(async () => second.resolve('second value'));
    expect(screen.getByText('second value')).toBeInTheDocument();

    await act(async () => first.resolve('stale first value'));
    expect(screen.getByText('second value')).toBeInTheDocument();
    expect(screen.queryByText('stale first value')).not.toBeInTheDocument();
  });

  it('returns a retry action after rejection and becomes ready after retry', async () => {
    const source = subscriptionSource();
    const failed = deferred<string>();
    const recovered = deferred<string>();
    let attempts = 0;
    const load = () => {
      attempts += 1;
      return attempts === 1 ? failed.promise : recovered.promise;
    };
    render(<QueryProbe source={source} queryKey="retry" load={load} />);

    await act(async () => failed.reject(new Error('offline')));
    const retry = await screen.findByRole('button', { name: 'retry' });
    fireEvent.click(retry);
    expect(screen.getByText('loading')).toBeInTheDocument();

    await act(async () => recovered.resolve('recovered value'));
    expect(screen.getByText('recovered value')).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('reloads from repository changes and unsubscribes on unmount', async () => {
    const source = subscriptionSource();
    let value = 'first value';
    const load = async () => value;
    const view = render(<QueryProbe source={source} queryKey="stable" load={load} />);
    await screen.findByText('first value');
    expect(source.subscriberCount).toBe(1);

    value = 'updated value';
    act(() => source.emit());
    await waitFor(() => expect(screen.getByText('updated value')).toBeInTheDocument());

    view.unmount();
    expect(source.subscriberCount).toBe(0);
  });
});

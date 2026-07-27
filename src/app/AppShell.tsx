import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { X } from '@phosphor-icons/react';
import type { LedgerViewModel } from '../view-model/ledger-view-model';
import splashBackground from '../assets/reference-ui-v2/splash-background.webp';
import {
  EntryPage,
  HomePage,
  ProfilePage,
  StatisticsPage,
  TransactionsPage,
} from '../features/reference/ReferencePages';
import {
  type BackgroundOverrides,
  type BackgroundSlot,
  loadBackgroundOverrides,
  resetBackgroundOverride,
  saveBackgroundOverride,
} from '../features/reference/background-preferences';
import { type AppPage } from './navigation';
import styles from './AppShell.module.css';

export type AppShellProps = {
  viewModel: LedgerViewModel;
  displayName?: string;
  onSignOut?: () => Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => void;
};

function shouldShowSplash(): boolean {
  const forced = new URLSearchParams(window.location.search).get('splash') === '1';
  const staticTestMode = import.meta.env.MODE === 'test'
    || document.documentElement.dataset.visualTest === 'true';
  if (staticTestMode && !forced) return false;
  return forced || sessionStorage.getItem('seabreeze-splash-seen') !== 'true';
}

export function AppShell({ viewModel, displayName = '海风', onSignOut = async () => undefined }: AppShellProps) {
  const [page, setPage] = useState<AppPage>('home');
  const [returnPage, setReturnPage] = useState<Exclude<AppPage, 'entry'>>('home');
  const [entryCategory, setEntryCategory] = useState<string | undefined>();
  const [feedback, setFeedback] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [backgrounds, setBackgrounds] = useState<BackgroundOverrides>({});
  const [splashVisible, setSplashVisible] = useState(shouldShowSplash);
  const feedbackTimer = useRef<number | null>(null);
  const fallbackTransitionTimer = useRef<number | null>(null);
  const backgroundRevision = useRef(0);
  const phoneRef = useRef<HTMLDivElement>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const revision = backgroundRevision.current;
    void loadBackgroundOverrides().then((storedBackgrounds) => {
      if (active && backgroundRevision.current === revision) setBackgrounds(storedBackgrounds);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!splashVisible) return undefined;
    sessionStorage.setItem('seabreeze-splash-seen', 'true');
    const timer = window.setTimeout(() => setSplashVisible(false), 900);
    return () => window.clearTimeout(timer);
  }, [splashVisible]);

  const showFeedback = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setFeedback({ message, tone });
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimer.current = null;
    }, 2200);
  }, []);

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    if (fallbackTransitionTimer.current !== null) window.clearTimeout(fallbackTransitionTimer.current);
  }, []);

  function clearFallbackTransition() {
    if (fallbackTransitionTimer.current !== null) {
      window.clearTimeout(fallbackTransitionTimer.current);
      fallbackTransitionTimer.current = null;
    }
    phoneRef.current?.querySelectorAll(`.${styles.outgoingPageStage}`).forEach((element) => element.remove());
    pageStageRef.current?.classList.remove(styles.incomingPageStage);
  }

  function runFallbackTransition(update: () => void) {
    const phone = phoneRef.current;
    const pageStage = pageStageRef.current;
    if (!phone || !pageStage) {
      flushSync(update);
      return;
    }

    clearFallbackTransition();
    const outgoingStage = pageStage.cloneNode(true) as HTMLDivElement;
    outgoingStage.classList.add(styles.outgoingPageStage);
    outgoingStage.setAttribute('aria-hidden', 'true');
    outgoingStage.setAttribute('inert', '');
    outgoingStage.style.viewTransitionName = 'none';
    phone.append(outgoingStage);

    flushSync(update);
    pageStage.classList.add(styles.incomingPageStage);
    fallbackTransitionTimer.current = window.setTimeout(clearFallbackTransition, 280);
  }

  function switchPage(next: AppPage, prepare?: () => void) {
    if (next === page) return;
    const update = () => {
      prepare?.();
      setPage(next);
    };
    const transitionDocument = document as ViewTransitionDocument;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticTestMode = import.meta.env.MODE === 'test'
      || document.documentElement.dataset.visualTest === 'true';

    if (reducedMotion || staticTestMode) {
      flushSync(update);
      return;
    }
    if (typeof transitionDocument.startViewTransition === 'function') {
      transitionDocument.startViewTransition(() => flushSync(update));
      return;
    }
    runFallbackTransition(update);
  }

  function openEntry(initialCategory?: string) {
    const previousPage = page;
    switchPage('entry', () => {
      if (previousPage !== 'entry') setReturnPage(previousPage);
      setEntryCategory(initialCategory);
    });
  }

  function navigate(next: AppPage) {
    if (next === 'entry') {
      openEntry();
      return;
    }
    switchPage(next);
  }

  async function replaceBackground(slot: BackgroundSlot, file: File) {
    const image = await saveBackgroundOverride(slot, file);
    backgroundRevision.current += 1;
    setBackgrounds((current) => ({ ...current, [slot]: image }));
  }

  async function restoreBackground(slot: BackgroundSlot) {
    await resetBackgroundOverride(slot);
    backgroundRevision.current += 1;
    setBackgrounds((current) => {
      const next = { ...current };
      delete next[slot];
      return next;
    });
  }

  return (
    <div className={styles.viewport}>
      <div ref={phoneRef} className={styles.phone} data-page={page}>
        <div ref={pageStageRef} className={styles.pageStage}>
          {page === 'home' ? (
            <HomePage
              viewModel={viewModel}
              backgrounds={backgrounds}
              displayName={displayName}
              onNavigate={navigate}
              onOpenEntry={openEntry}
              onFeedback={showFeedback}
            />
          ) : null}
          {page === 'transactions' ? (
            <TransactionsPage viewModel={viewModel} backgrounds={backgrounds} onNavigate={navigate} onFeedback={showFeedback} />
          ) : null}
          {page === 'entry' ? (
            <EntryPage
              viewModel={viewModel}
              backgrounds={backgrounds}
              initialCategory={entryCategory}
              onClose={() => switchPage(returnPage)}
              onFeedback={showFeedback}
            />
          ) : null}
          {page === 'statistics' ? (
            <StatisticsPage viewModel={viewModel} backgrounds={backgrounds} onNavigate={navigate} onFeedback={showFeedback} />
          ) : null}
          {page === 'profile' ? (
            <ProfilePage
              viewModel={viewModel}
              backgrounds={backgrounds}
              onNavigate={navigate}
              onFeedback={showFeedback}
              onSignOut={onSignOut}
              onReplaceBackground={replaceBackground}
              onRestoreBackground={restoreBackground}
            />
          ) : null}
        </div>
        <div
          className={styles.feedback}
          data-visible={feedback ? 'true' : 'false'}
          data-tone={feedback?.tone ?? 'info'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback?.message ?? ''}
        </div>
        {splashVisible ? (
          <section
            className={styles.splashScreen}
            style={{ backgroundImage: `url(${backgrounds.splash ?? splashBackground})` }}
            aria-label="开屏页"
          >
            <button type="button" aria-label="跳过开屏页" title="跳过" onClick={() => setSplashVisible(false)}>
              <X />
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

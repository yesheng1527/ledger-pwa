import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { X } from '@phosphor-icons/react';
import type { LedgerViewModel } from '../view-model/ledger-view-model';
import splashBackground from '../assets/reference-ui-v2/splash-background.webp';
import homeBackground from '../assets/reference-ui-v2/home-background.webp';
import transactionsBackground from '../assets/reference-ui-v2/transactions-background.webp';
import entryBackground from '../assets/reference-ui-v2/entry-background.webp';
import statisticsBackground from '../assets/reference-ui-v2/statistics-background.webp';
import profileBackground from '../assets/reference-ui-v2/profile-background.webp';
import profileSubpageBackground from '../assets/reference-ui-v2/profile-subpage-background.webp';
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
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const pageBackgrounds: Record<AppPage, string> = {
  home: homeBackground,
  transactions: transactionsBackground,
  entry: entryBackground,
  statistics: statisticsBackground,
  profile: profileBackground,
};

const pageOrder: Record<AppPage, number> = {
  home: 0,
  transactions: 1,
  entry: 2,
  statistics: 3,
  profile: 4,
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
  const [splashClosing, setSplashClosing] = useState(false);
  const feedbackTimer = useRef<number | null>(null);
  const fallbackTransitionTimer = useRef<number | null>(null);
  const splashTimer = useRef<number | null>(null);
  const navigationRevision = useRef(0);
  const preloadedBackgrounds = useRef(new Map<string, Promise<void>>());
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
    const sources = [
      backgrounds.splash ?? splashBackground,
      backgrounds.home ?? homeBackground,
      backgrounds.transactions ?? transactionsBackground,
      backgrounds.entry ?? entryBackground,
      backgrounds.statistics ?? statisticsBackground,
      backgrounds.profile ?? profileBackground,
      backgrounds.profileSubpage ?? profileSubpageBackground,
    ];
    sources.forEach((source) => { void preloadBackground(source); });
  }, [backgrounds]);

  function preloadBackground(source: string): Promise<void> {
    const existing = preloadedBackgrounds.current.get(source);
    if (existing) return existing;
    const pending = new Promise<void>((resolve) => {
      const image = new Image();
      const finish = () => resolve();
      const decode = () => {
        if (typeof image.decode === 'function') void image.decode().catch(() => undefined).finally(finish);
        else finish();
      };
      image.onload = decode;
      image.onerror = finish;
      image.src = source;
      if (image.complete) decode();
    });
    preloadedBackgrounds.current.set(source, pending);
    return pending;
  }

  function dismissSplash() {
    if (!splashVisible || splashClosing) return;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticTestMode = import.meta.env.MODE === 'test'
      || document.documentElement.dataset.visualTest === 'true';
    if (reducedMotion || staticTestMode) {
      setSplashVisible(false);
      return;
    }
    setSplashClosing(true);
    splashTimer.current = window.setTimeout(() => {
      setSplashVisible(false);
      setSplashClosing(false);
      splashTimer.current = null;
    }, 280);
  }

  useEffect(() => {
    if (!splashVisible) return undefined;
    sessionStorage.setItem('seabreeze-splash-seen', 'true');
    const timer = window.setTimeout(dismissSplash, 450);
    return () => window.clearTimeout(timer);
  }, [splashVisible, splashClosing]);

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
    if (splashTimer.current !== null) window.clearTimeout(splashTimer.current);
  }, []);

  function clearNavigationDirection() {
    delete document.documentElement.dataset.navigationDirection;
    if (phoneRef.current) delete phoneRef.current.dataset.navigationDirection;
  }

  function clearFallbackTransition() {
    if (fallbackTransitionTimer.current !== null) {
      window.clearTimeout(fallbackTransitionTimer.current);
      fallbackTransitionTimer.current = null;
    }
    phoneRef.current?.querySelectorAll(`.${styles.outgoingPageStage}`).forEach((element) => element.remove());
    pageStageRef.current?.classList.remove(styles.incomingPageStage);
    clearNavigationDirection();
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
    fallbackTransitionTimer.current = window.setTimeout(clearFallbackTransition, 420);
  }

  function switchPage(next: AppPage, prepare?: () => void) {
    if (next === page) return;
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const staticTestMode = import.meta.env.MODE === 'test'
      || document.documentElement.dataset.visualTest === 'true';
    const requestRevision = ++navigationRevision.current;

    const startTransition = () => {
      if (navigationRevision.current !== requestRevision) return;
      const update = () => {
        prepare?.();
        setPage(next);
      };
      const transitionDocument = document as ViewTransitionDocument;
      const direction = pageOrder[next] >= pageOrder[page] ? 'forward' : 'backward';
      document.documentElement.dataset.navigationDirection = direction;
      if (phoneRef.current) phoneRef.current.dataset.navigationDirection = direction;

      if (reducedMotion || staticTestMode) {
        flushSync(update);
        clearNavigationDirection();
        return;
      }
      if (typeof transitionDocument.startViewTransition === 'function') {
        const transition = transitionDocument.startViewTransition(() => flushSync(update));
        void transition.finished.catch(() => undefined).finally(clearNavigationDirection);
        return;
      }
      runFallbackTransition(update);
    };

    if (reducedMotion || staticTestMode) {
      startTransition();
      return;
    }
    const targetBackground = backgrounds[next] ?? pageBackgrounds[next];
    void preloadBackground(targetBackground).then(startTransition);
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
            data-closing={splashClosing ? 'true' : 'false'}
            style={{ backgroundImage: `url(${backgrounds.splash ?? splashBackground})` }}
            aria-label="开屏页"
          >
            <button type="button" aria-label="跳过开屏页" title="跳过" onClick={dismissSplash}>
              <X />
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

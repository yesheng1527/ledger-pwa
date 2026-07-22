import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-sc/index.css';
import './design-system/tokens.css';
import './design-system/global.css';
import './assets/registry';
import { App } from './app/App';
import { AppProviders, type AppProviderServices } from './app/providers';

async function renderApplication() {
  let services: AppProviderServices | undefined;
  if (import.meta.env.MODE === 'test-e2e') {
    const searchParams = new URLSearchParams(location.search);
    const fixtureModule = await import('./test/e2e-services');
    services = fixtureModule.createE2eServices(
      fixtureModule.parseE2eFixture(searchParams.get('fixture')),
    );
    if (searchParams.get('visual') === '1') {
      document.documentElement.dataset.visualTest = 'true';
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders services={services}>
        <App />
      </AppProviders>
    </StrictMode>,
  );
}

void renderApplication();

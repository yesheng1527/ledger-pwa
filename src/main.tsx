import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/noto-sans-sc/index.css';
import './design-system/tokens.css';
import './design-system/global.css';
import './assets/registry';
import { App } from './app/App';
import { AppProviders } from './app/providers';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);

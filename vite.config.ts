import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const assetManifestPlugin: Plugin = {
  name: 'ledger-asset-manifest',
  generateBundle(_options, bundle) {
    this.emitFile({
      type: 'asset',
      fileName: 'asset-manifest.json',
      source: JSON.stringify(Object.values(bundle).map((item) => item.fileName).sort()),
    });
  },
};

export default defineConfig(({ mode }) => {
  const connectedEnv = mode === 'integration'
    ? loadEnv(
        mode,
        '../..',
        ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'],
      )
    : null;

  if (connectedEnv && (!connectedEnv.SUPABASE_URL || !connectedEnv.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('缺少 Supabase 连接配置');
  }

  return {
    base: '/ledger-pwa/',
    build: {
      assetsInlineLimit: 0,
    },
    define: connectedEnv
      ? {
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(connectedEnv.SUPABASE_URL),
          'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
            connectedEnv.SUPABASE_PUBLISHABLE_KEY,
          ),
        }
      : undefined,
    plugins: [react(), assetManifestPlugin],
  };
});

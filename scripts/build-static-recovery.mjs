import { build } from 'vite';

process.env.VITE_SUPABASE_URL = 'https://static-recovery-gate.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_static_recovery_gate';

await build({ mode: 'production' });

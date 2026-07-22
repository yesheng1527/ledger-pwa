import { AuthGate } from './AuthGate';
import { AppShell } from './AppShell';

export function App() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}

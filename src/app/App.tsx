import { AuthGate } from './AuthGate';
import { AppShell } from './AppShell';
import { useAppRuntime } from './providers';

function AuthenticatedApp() {
  const { ledgerViewModel, session, signOut } = useAppRuntime();
  if (!ledgerViewModel) return null;
  const metadataName = session?.user.user_metadata?.display_name;
  const displayName = typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim()
    : '海风';

  return <AppShell viewModel={ledgerViewModel} displayName={displayName} onSignOut={signOut} />;
}

export function App() {
  return (
    <AuthGate>
      <AuthenticatedApp />
    </AuthGate>
  );
}

import { IdentityProvider } from '@/components/IdentityProvider';
import { TopBar } from '@/components/TopBar';

export default function RequirementsLayout({ children }) {
  return (
    <IdentityProvider>
      <div className="min-h-screen bg-slate-50">
        <TopBar />
        <main className="p-4">{children}</main>
      </div>
    </IdentityProvider>
  );
}

'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/app-layout';

// Initialize security monitoring
import '@/lib/security-monitor';

export default function Home() {
  const [activeView, setActiveView] = useState('add-password');
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, isLoading, user, isVaultUnlocked } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      console.log('Not authenticated, redirecting to login');
      router.push('/login');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  // Force re-evaluation of auth state after completing auth steps
  // Show loading while checking authentication
  if (!mounted || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated (handled by useEffect)
  if (!isAuthenticated || !user) {
    return null;
  }

  // Show main app - the new system automatically unlocks vault during sign-in
  return (
    <main className="h-screen flex flex-col" data-vault-content>
      <AppLayout activeView={activeView} setActiveView={setActiveView} />
    </main>
  );
}

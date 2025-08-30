"use client";
import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { appConfig } from '@/lib/config';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Global error boundary:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="space-y-2 max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">An unexpected error occurred while rendering the application.</p>
            {error?.message && (
              <p className="text-sm text-red-600 break-words">{error.message}</p>
            )}
            <div className="rounded-md bg-muted p-3 text-xs text-left space-y-1">
              <div>Environment: <strong>{appConfig.environment}</strong></div>
              <div>Firebase Project: <strong>{appConfig.firebase.projectId || 'N/A'}</strong></div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => reset()} variant="default">Retry</Button>
            <Button onClick={() => window.location.reload()} variant="outline">Reload</Button>
          </div>
          {appConfig.environment === 'development' && (
            <div className="text-xs text-muted-foreground">
              Check console for stack trace. Verify env vars in .env.local.
            </div>
          )}
        </div>
      </body>
    </html>
  );
}

"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CitadelGuardLogo } from '@/components/icons';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const router = useRouter();
  
  const { user, signIn, loading, error } = useAuth();

  useEffect(() => {
    setMounted(true);
    
    // Force clear any autofilled values
    setEmail('');
    setPassword('');
  }, []);

  // Clear fields whenever component mounts or remounts
  useEffect(() => {
    const clearFields = () => {
      setEmail('');
      setPassword('');
    };
    
    // Clear immediately
    clearFields();
    
    // Clear again after a short delay to override any browser autofill
    const timeoutId = setTimeout(clearFields, 100);
    
    return () => clearTimeout(timeoutId);
  }, [mounted]);

  useEffect(() => {
    if (mounted && user) {
      console.log('User already authenticated, redirecting to main page');
      router.push('/');
    }
  }, [mounted, user, router]);

  // Clean up form data when component unmounts
  useEffect(() => {
    return () => {
      setEmail('');
      setPassword('');
    };
  }, []);

  // Additional security: clear fields on page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden, clear sensitive data
        setEmail('');
        setPassword('');
      }
    };

    const handleFocus = () => {
      // When window regains focus, ensure fields are empty
      setEmail('');
      setPassword('');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mounted || isSubmitting) return;
    
    setIsSubmitting(true);
    
    try {
      console.log('Attempting to login with:', email);
      
      const result = await signIn(email, password);
      
      if (result) {
        console.log('Login successful, redirecting...');
        
        // Clear sensitive data immediately
        setEmail('');
        setPassword('');
        
        router.push('/');
      } else {
        console.error('Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user) {
    return null;
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <CitadelGuardLogo className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <CitadelGuardLogo className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Citadel Guard</h1>
          <p className="text-muted-foreground mt-2">Secure Password Manager</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Enter your credentials to access your secure vault
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {/* Hidden inputs to confuse browser autofill */}
              <input type="text" style={{display: 'none'}} />
              <input type="password" style={{display: 'none'}} />
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  disabled={loading || isSubmitting}
                  autoComplete="new-email"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  key="email-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={loading || isSubmitting}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  key="password-input"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading || isSubmitting}
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Your data is encrypted with your master password
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

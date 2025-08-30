"use client";
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { calculatePasswordStrength } from '@/lib/crypto';
import { useAuth } from '@/contexts/AuthContext';

interface MasterPasswordDialogProps {
  open: boolean;
  mode: 'setup' | 'unlock';
  onComplete: () => void;
  onClose?: () => void;
}

export const MasterPasswordDialog: React.FC<MasterPasswordDialogProps> = ({ open, mode, onComplete, onClose }) => {
  const { unlockVault, requiresMasterPasswordSetup, registerUser, signIn, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const strength = calculatePasswordStrength(password);
  const isValid = strength.score >= 5;
  const needsSetup = requiresMasterPasswordSetup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      if (mode === 'setup') {
        if (password !== confirm) {
          setError('Passwords do not match');
          return;
        }
        if (!isValid) {
          setError('Password is too weak');
          return;
        }
        // Master password setup occurs during registration flow; here we just trigger completion
        onComplete();
      } else {
        const unlocked = await unlockVault(password);
        if (unlocked) {
          onComplete();
        } else {
          setError('Invalid master password');
        }
      }
    } catch (err:any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}> 
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'setup' ? 'Set Master Password' : 'Unlock Vault'}</DialogTitle>
          <DialogDescription>
            {mode === 'setup' ? 'Create a strong master password. This cannot be changed later.' : 'Enter your master password to unlock your encrypted vault.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Master password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {mode === 'setup' && (
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            )}
            {password && (
              <div className="text-xs text-muted-foreground">
                Strength: {strength.strength} ({strength.score}/8)
              </div>
            )}
          </div>
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading || (mode === 'setup' && !isValid)}>
              {isLoading ? 'Please wait...' : mode === 'setup' ? 'Set Password' : 'Unlock'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

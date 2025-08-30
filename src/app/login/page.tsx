"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { calculatePasswordStrength } from '@/lib/crypto';
import { auth } from '@/lib/firebase';
import { fetchSignInMethodsForEmail } from 'firebase/auth';

export default function LoginPage() {
	const { registerUser, signIn, error, clearError, isLoading } = useAuth();
	// derived mode now based on whether email exists
	const [isNewEmail, setIsNewEmail] = useState<boolean | null>(null); // null = unknown / not checked
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [masterPassword, setMasterPassword] = useState('');
	const [confirmMaster, setConfirmMaster] = useState('');
	const [localError, setLocalError] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckRef = useRef<number | null>(null);

	const strength = calculatePasswordStrength(masterPassword);
	const masterValid = strength.score >= 5;

	// Debounced email existence check
	useEffect(() => {
		if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			setIsNewEmail(null);
			return;
		}
		if (emailCheckRef.current) window.clearTimeout(emailCheckRef.current);
		emailCheckRef.current = window.setTimeout(async () => {
			if (!auth) return; // firebase disabled
			setCheckingEmail(true);
			try {
				const methods = await fetchSignInMethodsForEmail(auth, email).catch(() => []);
				setIsNewEmail(methods.length === 0);
			} finally {
				setCheckingEmail(false);
			}
		}, 450);
	}, [email]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLocalError(null);
		try {
			if (isNewEmail) {
				if (masterPassword !== confirmMaster) {
					setLocalError('Master passwords do not match');
					return;
				}
				if (!masterValid) {
					setLocalError('Master password too weak');
					return;
				}
				await registerUser(email, password, masterPassword);
				window.location.href = '/';
			} else {
				await signIn(email, password, masterPassword);
				window.location.href = '/';
			}
		} catch (err:any) {
			setLocalError(err.message || 'Authentication failed');
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="w-full max-w-md space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-2xl font-semibold tracking-tight">
            {isNewEmail ? 'Create Account' : isNewEmail === false ? 'Sign In' : 'Welcome'}
          </h1>
          <p className="text-sm text-muted-foreground min-h-[2rem]">
            {checkingEmail && 'Checking email...'}
            {!checkingEmail && isNewEmail === null && 'Enter your email to continue'}
            {!checkingEmail && isNewEmail === false && 'Access your secure password vault'}
            {!checkingEmail && isNewEmail === true && 'Create an account and set an immutable master password'}
          </p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<div className="relative">
							<Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="pr-28" />
							<div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
								{checkingEmail && email && (
									<div className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
										<span className="inline-block h-2 w-2 rounded-full bg-primary/70 animate-ping" />
										<span>Checking</span>
									</div>
								)}
								{!checkingEmail && isNewEmail === true && (
									<span className="text-xs font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded">New</span>
								)}
								{!checkingEmail && isNewEmail === false && (
									<span className="text-xs font-medium text-blue-600 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded">Existing</span>
								)}
							</div>
						</div>
						<Input type="password" placeholder="Account password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={isNewEmail? 'new-password':'current-password'} />
						<Input type="password" placeholder={isNewEmail? 'New master password':'Master password'} value={masterPassword} onChange={e => setMasterPassword(e.target.value)} required />
						{isNewEmail && (
							<Input type="password" placeholder="Confirm master password" value={confirmMaster} onChange={e => setConfirmMaster(e.target.value)} required />
						)}
						{masterPassword && (
							<div className="text-xs text-muted-foreground">
								Master strength: {strength.strength} ({strength.score}/8){isNewEmail ? '' : ' (used to unlock vault)'}
							</div>
						)}
					</div>
					{(error || localError) && <div className="text-sm text-red-600">{localError || error}</div>}
					<Button type="submit" className="w-full" disabled={isLoading || (!!isNewEmail && !masterValid)}>
						{isLoading ? 'Please wait...' : isNewEmail ? 'Create Account' : 'Sign In'}
					</Button>
				</form>
				{/* No manual toggle; mode determined automatically by email existence */}
			</div>
		</div>
	);
}

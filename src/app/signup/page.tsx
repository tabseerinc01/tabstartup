'use client';



import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Logo } from '@/components/logo';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

import {
  fetchAccountAccess,
} from '@/lib/account-access-client';

import {
  sanitizeAccountReturnTo,
  resolveAccountLoginDestination,
} from '@/lib/safe-account-redirect';

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const roleParam = searchParams.get('role');
  const returnTo = sanitizeAccountReturnTo(
    searchParams.get('returnTo')
  );
  const refCode = searchParams.get('ref')?.toUpperCase();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(roleParam || 'founder');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signupInProgressRef = useRef(false);

  useEffect(() => {
    if (!user || isUserLoading || signupInProgressRef.current) return;

    let cancelled = false;
    const verifyProfile = async () => {
      try {
        const account = await fetchAccountAccess(user);

        if (cancelled) return;

        const destination =
          resolveAccountLoginDestination(
            account,
            returnTo
          );

        router.replace(
          destination || '/login'
        );
      } catch (error) {
        console.error("Signup profile verification failed:", error);
      }
    };

    void verifyProfile();
    return () => { cancelled = true; };
  }, [user, isUserLoading, firestore, router, returnTo]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupInProgressRef.current) return;

    signupInProgressRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({
          fullName: name,
          email,
          password,
          role,
          referralCode: refCode || null
        })
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'SIGNUP_FAILED');
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      if (credential.user.uid !== result.uid) {
        throw new Error('SIGNUP_IDENTITY_MISMATCH');
      }

      const savedProfile = await getDoc(
        doc(firestore, 'users', credential.user.uid)
      );

      if (!savedProfile.exists()) {
        throw new Error('RECOVERY_VERIFICATION_REQUIRED');
      }

      const account = await fetchAccountAccess(
        credential.user
      );

      if (!account.portals.startup.allowed) {
        throw new Error(
          'RECOVERY_VERIFICATION_REQUIRED'
        );
      }

      const destination =
        resolveAccountLoginDestination(
          account,
          returnTo
        ) || '/login';

      toast({
        title: 'Account created!',
        description: 'Welcome to the TabStartup ecosystem.'
      });

      router.replace(destination);

    } catch (error: unknown) {
      const code =
        error instanceof Error ? error.message : '';

      let message = 'An error occurred during signup.';

      if (code === 'SIGNUP_RATE_LIMIT_EXCEEDED') {
        message = 'Too many signup attempts. Please wait a few minutes before trying again.';
      } else if (code === 'SIGNUP_TEMPORARILY_UNAVAILABLE') {
        message = 'Registration is temporarily unavailable. Please try again later.';
      } else if (code === 'REQUEST_TOO_LARGE') {
        message = 'Your registration details exceed the allowed size.';
      } else if (code === 'INVALID_CONTENT_TYPE') {
        message = 'Invalid registration request. Please refresh the page and try again.';
      } else if (code === 'ACCOUNT_ALREADY_EXISTS') {
        message = 'An account already exists. Please sign in or contact support if your profile is incomplete.';
      } else if (code === 'RECOVERY_VERIFICATION_REQUIRED') {
        message = 'Your registration requires secure verification. Please contact TabStartup support.';
      } else if (code === 'INVALID_SIGNUP_INPUT') {
        message = 'Please check your registration details and try again.';
      } else if (code === 'SIGNUP_IDENTITY_MISMATCH') {
        message = 'Account verification failed. Please contact support.';
      }

      toast({
        variant: 'destructive',
        title: 'Signup failed',
        description: message
      });

    } finally {
      signupInProgressRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-md animate-in fade-in duration-500">
      <Logo className="mb-8" />
      <Card className="border-none shadow-2xl rounded-[2rem]">
        <CardHeader>
          <CardTitle className="text-2xl font-black">Join TabStartup</CardTitle>
          <CardDescription>Join our ecosystem of founders and investors.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input 
                id="name" 
                placeholder="John Doe" 
                required 
                className="rounded-xl h-11"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                required 
                className="rounded-xl h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password" 
                required 
                className="rounded-xl h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Your Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="founder">Founder</SelectItem>
                  <SelectItem value="mentor">Mentor</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl font-bold shadow-lg shadow-primary/20" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create account
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground w-full text-center">
            Already have an account? <Link href={`/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-primary font-bold hover:underline">Log in</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20">
      <Logo className="mb-8" />
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center p-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      }>
        <SignupForm />
      </Suspense>
    </div>
  );
}

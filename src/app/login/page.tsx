'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { useToast } from '@/hooks/use-toast';
import { useAuth, useUser } from '@/firebase';
import {
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import { usePortalAccess } from '@/hooks/use-portal-access';

import {
  sanitizeAccountReturnTo,
  resolveAccountLoginDestination,
} from '@/lib/safe-account-redirect';
import { Loader2 } from 'lucide-react';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnTo = sanitizeAccountReturnTo(
    searchParams.get('returnTo')
  );

  const access = usePortalAccess(
    user,
    isUserLoading,
    'startup'
  );

  const destination = access.account
    ? resolveAccountLoginDestination(
        access.account,
        returnTo
      )
    : null;

  useEffect(() => {
    if (
      user &&
      !isUserLoading &&
      destination
    ) {
      router.replace(destination);
    }
  }, [
    user,
    isUserLoading,
    router,
    destination,
  ]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        toast({ 
          title: "Welcome back!", 
          description: "Login successful." 
        });
      })
      .catch((error: any) => {
        setIsSubmitting(false);
        let message = "An error occurred during login.";
        
        if (error.code === 'auth/invalid-credential') {
          message = "Invalid email or password.";
        } else if (error.code === 'auth/user-not-found') {
          message = "No account found with this email.";
        } else if (error.code === 'auth/wrong-password') {
          message = "Incorrect password.";
        } else if (error.code === 'auth/too-many-requests') {
          message = "Too many failed attempts. Please try again later.";
        }
        
        toast({ 
          variant: "destructive",
          title: "Login failed", 
          description: message 
        });
      });
  };

  if (
    isUserLoading ||
    (
      user &&
      (
        access.status === 'loading' ||
        destination
      )
    )
  ) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    const account = access.account;
    const suspended =
      account?.status === 'suspended';

    const eventOrganizerAvailable =
      account?.portals.event_organizer.allowed === true;

    const startupAvailable =
      account?.portals.startup.allowed === true;

    return (
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader>
          <CardTitle>
            {suspended
              ? 'Account Suspended'
              : access.status === 'error'
                ? 'Account Access Unavailable'
                : eventOrganizerAvailable
                  ? 'Choose Your Portal'
                  : 'Account Access Required'}
          </CardTitle>

          <CardDescription>
            {suspended
              ? 'Please contact support regarding your account.'
              : access.status === 'error'
                ? 'Your account access could not be verified.'
                : eventOrganizerAvailable
                  ? 'Select an available portal to continue.'
                  : 'Your account requires profile setup or recovery. Please contact support.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {startupAvailable && (
            <Button
              onClick={() => router.replace('/dashboard')}
            >
              Startup Dashboard
            </Button>
          )}

          {eventOrganizerAvailable && (
            <Button variant="outline" disabled>
              Event Organizer Dashboard — Coming Soon
            </Button>
          )}

          <Button
            variant="outline"
            onClick={access.retry}
          >
            Retry Access
          </Button>

          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await signOut(auth);
                setIsSubmitting(false);
              } catch {
                toast({
                  variant: 'destructive',
                  title: 'Sign out failed',
                  description: 'Please try again.',
                });
              }
            }}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-md animate-in fade-in duration-500">
      <Card className="border-none shadow-2xl rounded-[2rem]">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-black">Log in</CardTitle>
          <CardDescription>Enter your credentials to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="m@example.com" 
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
            <Button type="submit" className="w-full h-11 rounded-xl font-bold shadow-lg shadow-primary/20" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Log in
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground w-full text-center">
            Don't have an account? <Link href={`/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-primary font-bold hover:underline">Sign up</Link>
          </p>

        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <Logo className="mb-8" />
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-primary" />}>
        <LoginFormContent />
      </Suspense>
    </div>
  );
}

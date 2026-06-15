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
import { signInWithEmailAndPassword } from 'firebase/auth';
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

  const returnTo = searchParams.get('returnTo');

  useEffect(() => {
    if (user && !isUserLoading) {
      router.push(returnTo || '/dashboard');
    }
  }, [user, isUserLoading, router, returnTo]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        toast({ 
          title: "Success", 
          description: "Welcome back!" 
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

  if (isUserLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Log in</CardTitle>
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Log in
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground w-full text-center">
            Don't have an account? <Link href={`/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-primary hover:underline">Sign up</Link>
          </p>
          <Button variant="ghost" asChild size="sm" className="w-full">
            <Link href="/dashboard">Preview Dashboard (Demo)</Link>
          </Button>
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

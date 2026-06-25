'use client';

import { useEffect, useState, Suspense } from 'react';
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
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const roleParam = searchParams.get('role');
  const returnTo = searchParams.get('returnTo');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(roleParam || 'founder');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && !isUserLoading) {
      const redirectUrl = returnTo ? decodeURIComponent(returnTo) : '/dashboard';
      router.push(redirectUrl);
    }
  }, [user, isUserLoading, router, returnTo]);

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const newUser = userCredential.user;
        
        updateProfile(newUser, { displayName: name });

        setDoc(doc(firestore, "users", newUser.uid), {
          uid: newUser.uid,
          fullName: name,
          email: email,
          role: role, 
          primaryRole: role,
          roles: [role],
          plan: "basic",
          subscriptionStatus: "inactive",
          headline: "",
          bio: "",
          location: "",
          stage: "",
          skills: [],
          lookingFor: "",
          preferredStage: "",
          investorNote: "",
          isOpenToPitches: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        toast({ 
          title: "Account created!", 
          description: "Welcome to the TabStartup ecosystem." 
        });
      })
      .catch((error: any) => {
        setIsSubmitting(false);
        let message = "An error occurred during signup.";
        if (error.code === 'auth/email-already-in-use') {
          message = "An account already exists with this email.";
        } else if (error.code === 'auth/weak-password') {
          message = "Password should be at least 6 characters.";
        } else if (error.code === 'auth/invalid-email') {
          message = "Please enter a valid email address.";
        }
        
        toast({ 
          variant: "destructive",
          title: "Signup failed", 
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

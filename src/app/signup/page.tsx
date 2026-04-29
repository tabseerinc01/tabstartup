
'use client';

import { useEffect, useState } from 'react';
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

export default function SignupPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  
  const roleParam = searchParams.get('role');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState(roleParam || 'founder');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user && !isUserLoading) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      await updateProfile(newUser, { displayName: name });

      // Create Firestore User Profile
      await setDoc(doc(firestore, "users", newUser.uid), {
        uid: newUser.uid,
        fullName: name,
        email: email,
        role: role,
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
        description: "Welcome to TabStartup." 
      });
      router.push('/dashboard');
    } catch (error: any) {
      setIsSubmitting(false);
      toast({ 
        variant: "destructive",
        title: "Signup failed", 
        description: error.message || "An error occurred during signup." 
      });
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Join TabStartup</CardTitle>
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
            <div className="space-y-2">
              <Label htmlFor="role">Your Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="founder">Founder</SelectItem>
                  <SelectItem value="mentor">Mentor</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create account
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground w-full text-center">
            Already have an account? <Link href="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}


'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { User as UserIcon, Rocket, Target, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const userRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'startups', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(userRef);
  const { data: startup, isLoading: isStartupLoading } = useDoc(startupRef);

  if (isUserLoading || isProfileLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "Founder";
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Founder";

  // Simple completeness calculation
  const fields = ['headline', 'location', 'stage', 'skills', 'lookingFor'];
  const filledFields = fields.filter(f => profile && profile[f] && (Array.isArray(profile[f]) ? profile[f].length > 0 : profile[f] !== ''));
  const completeness = Math.round((filledFields.length / fields.length) * 100);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {displayName}</h1>
        <p className="text-muted-foreground">
          {roleDisplay} • {user?.email}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile Completeness</CardTitle>
            <UserIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completeness}%</div>
            <Progress value={completeness} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {completeness < 100 ? "Complete your profile to stand out." : "Your profile is fully complete!"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Startup Status</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{startup ? "Created" : "Not Listed"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {startup ? startup.name : "Pitch your startup to investors."}
            </p>
            <Button size="sm" variant="outline" asChild className="mt-4 w-full">
              <Link href="/dashboard/startup">
                {startup ? "Manage Startup" : "Create Startup Listing"}
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Community Interaction</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 Connections</div>
            <p className="text-xs text-muted-foreground mt-1">
              Start connecting with investors.
            </p>
            <Button size="sm" variant="link" asChild className="mt-4 px-0">
              <Link href="/investors">Explore Investors <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Actionable items to grow your startup presence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="bg-primary/10 p-2 rounded-full">
                <UserIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Update your headline</p>
                <p className="text-xs text-muted-foreground">Summarize what you do in one sentence.</p>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/dashboard/profile">Edit</Link>
              </Button>
            </div>
            {!startup && (
              <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="bg-primary/10 p-2 rounded-full">
                  <Rocket className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">List your startup</p>
                  <p className="text-xs text-muted-foreground">Make your venture discoverable by investors.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/startup">Create</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>My Public View</CardTitle>
            <CardDescription>How you appear to others.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 rounded-full overflow-hidden bg-muted">
                <Image src={`https://picsum.photos/seed/${user?.uid || 'user'}/128/128`} alt={displayName} fill className="object-cover" />
              </div>
              <div>
                <p className="font-bold">{displayName}</p>
                <Badge variant="secondary">{profile?.stage || "Early"} Stage</Badge>
              </div>
            </div>
            <p className="text-sm italic text-muted-foreground mb-4">
              &quot;{profile?.headline || "Building amazing things."}&quot;
            </p>
            <div className="flex flex-wrap gap-1">
              {profile?.skills?.map((s: string) => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

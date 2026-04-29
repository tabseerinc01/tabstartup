
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { User as UserIcon, Rocket, Target, ArrowRight, Loader2, CheckCircle2, Share2, ExternalLink, Copy } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

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

  if (isUserLoading || isProfileLoading || isStartupLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "Founder";
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Founder";

  const getCompleteness = () => {
    if (!profile) return 0;
    const coreFields = ['headline', 'location', 'stage', 'skills', 'bio', 'whyBuilding', 'lookingFor', 'imageUrl'];
    let score = 0;
    
    const filledCore = coreFields.filter(f => profile[f] && (Array.isArray(profile[f]) ? profile[f].length > 0 : profile[f] !== ''));
    score += (filledCore.length / coreFields.length) * 70;
    
    if (profile.experience && profile.experience.length > 0 && profile.experience[0].company) score += 15;
    if (profile.socialLinks && (profile.socialLinks.linkedin || profile.socialLinks.website)) score += 15;
    
    return Math.min(Math.round(score), 100);
  };

  const completeness = getCompleteness();

  const copyToClipboard = (path: string, type: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied!",
      description: `${type} link has been copied to your clipboard.`,
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Welcome, {displayName} {profile?.isVerified && <CheckCircle2 className="h-6 w-6 text-primary fill-primary/10" />}
          </h1>
          <p className="text-muted-foreground">
            {roleDisplay} • {user?.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/founders/${user?.uid}`} className="gap-2">
              <ExternalLink className="h-4 w-4" /> View Public Profile
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/profile">Edit Profile</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile Score</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completeness}%</div>
            <Progress value={completeness} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {completeness < 100 ? "Add experience and vision to attract investors." : "Your profile is investor-ready!"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Startup Listing</CardTitle>
            <Rocket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{startup ? startup.name : "Unlisted"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {startup 
                ? `${startup.industry} • ${startup.stage}` 
                : "Pitch your venture to the community."}
            </p>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="ghost" asChild className="flex-1 border border-dashed border-primary/20 hover:bg-primary/5">
                <Link href="/dashboard/startup">
                  {startup ? "Update Venture" : "Create Startup Listing"}
                </Link>
              </Button>
              {startup && (
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(`/startups/${user?.uid}`, 'Startup')} title="Copy Startup Link">
                  <Share2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Public Visibility</CardTitle>
            <UserIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Active</div>
            <p className="text-xs text-muted-foreground mt-1">
              Your profile is visible to investors.
            </p>
            <div className="mt-4 flex flex-wrap gap-1">
              {profile?.availability?.openToInvestment && <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">Investing</Badge>}
              {profile?.availability?.hiring && <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">Hiring</Badge>}
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-[10px]" onClick={() => copyToClipboard(`/founders/${user?.uid}`, 'Profile')}>
                <Copy className="h-3 w-3 mr-1" /> Copy Profile Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next Milestones</CardTitle>
            <CardDescription>Actions to strengthen your presence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!profile?.whyBuilding && (
              <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Share your "Why"</p>
                  <p className="text-xs text-muted-foreground">Explain the passion behind your startup.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/profile">Start</Link>
                </Button>
              </div>
            )}
            {!profile?.imageUrl && (
              <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                  <UserIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Upload Profile Photo</p>
                  <p className="text-xs text-muted-foreground">Add a photo to build trust with investors.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/profile">Add Photo</Link>
                </Button>
              </div>
            )}
            {!startup && (
              <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                  <Rocket className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Launch your startup card</p>
                  <p className="text-xs text-muted-foreground">Get discovered by early-stage investors.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/startup">Create</Link>
                </Button>
              </div>
            )}
            <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group opacity-60">
              <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Verified Founder Badge</p>
                <p className="text-xs text-muted-foreground">Submit documents for official verification.</p>
              </div>
              <Badge variant="secondary">Upcoming</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Investor View</CardTitle>
            <CardDescription>Your current public appearance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-2xl overflow-hidden bg-muted shadow-sm">
                <Image src={profile?.imageUrl || `https://picsum.photos/seed/${user?.uid || 'user'}/128/128`} alt={displayName} fill className="object-cover" />
              </div>
              <div>
                <p className="font-bold flex items-center gap-1">
                  {displayName} 
                  {profile?.isVerified && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </p>
                <Badge variant="secondary" className="text-[10px]">{profile?.stage || "Early"} Stage</Badge>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Headline</p>
                <p className="text-sm font-medium text-primary">"{profile?.headline || "Building amazing things."}"</p>
              </div>
              
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Availability</p>
                <div className="flex flex-wrap gap-1">
                  {profile?.availability?.openToInvestment ? (
                    <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700">Open to Investment</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">None specified</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Top Skills</p>
                <div className="flex flex-wrap gap-1">
                  {profile?.skills?.slice(0, 3).map((s: string) => <Badge key={s} variant="outline" className="text-[9px]">{s}</Badge>)}
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full mt-4" asChild>
              <Link href={`/founders/${user?.uid}`}>View Full Public Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  User as UserIcon, 
  Rocket, 
  Target, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  Share2, 
  ExternalLink, 
  Copy, 
  HandCoins,
  Eye,
  Users,
  MessageSquare,
  TrendingUp,
  FileText,
  Clock,
  Mail,
  Plus,
  Send,
  Heart,
  Check,
  X,
  FileSignature
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, where, limit, orderBy, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user?.uid]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(userRef);

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'startups', user.uid);
  }, [firestore, user?.uid]);

  const viewsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || profile?.role !== 'founder') return null;
    return collection(firestore, 'startups', user.uid, 'views');
  }, [firestore, user?.uid, profile?.role]);

  const interestsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || profile?.role !== 'founder') return null;
    return collection(firestore, 'startups', user.uid, 'interests');
  }, [firestore, user?.uid, profile?.role]);

  // Pitches queries - strictly filtered by role to satisfy security rules
  const incomingPitchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || profile?.role !== 'founder') return null;
    return query(
      collection(firestore, 'pitches'),
      where('toFounderUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
  }, [firestore, user?.uid, profile?.role]);

  const sentPitchesQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid || profile?.role !== 'investor') return null;
    return query(
      collection(firestore, 'pitches'),
      where('fromInvestorUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
  }, [firestore, user?.uid, profile?.role]);

  const { data: startup, isLoading: isStartupLoading } = useDoc(startupRef);
  const { data: views, isLoading: isViewsLoading } = useCollection(viewsQuery);
  const { data: interests, isLoading: isInterestsLoading } = useCollection(interestsQuery);
  const { data: incomingPitches, isLoading: isIncomingPitchesLoading } = useCollection(incomingPitchesQuery);
  const { data: sentPitches, isLoading: isSentPitchesLoading } = useCollection(sentPitchesQuery);

  if (isUserLoading || isProfileLoading || isStartupLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "Founder";
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Founder";
  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';
  const viewsCount = views?.length || 0;
  const interestsCount = interests?.length || 0;

  const handlePitchStatus = async (pitchId: string, status: 'accepted' | 'rejected') => {
    if (!firestore) return;
    try {
      await updateDoc(doc(firestore, 'pitches', pitchId), { status });
      toast({
        title: `Pitch ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `You have ${status} this investment pitch.`,
      });
    } catch (error) {
      console.error("Error updating pitch status:", error);
      toast({
        title: "Error",
        description: "Failed to update pitch status.",
        variant: "destructive",
      });
    }
  };

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

  const activities = [
    { id: 1, type: 'view', text: 'Someone viewed your startup', time: viewsCount > 0 ? 'Recently' : 'No views yet', icon: Eye, color: 'text-blue-500' },
    { id: 2, type: 'interest', text: 'An investor expressed interest', time: interestsCount > 0 ? 'Recently' : 'No interest yet', icon: Users, color: 'text-green-500' },
    { id: 3, type: 'status', text: 'Profile visibility is live', time: 'Active', icon: CheckCircle2, color: 'text-primary' },
  ];

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
            <Link href={isFounder ? `/founders/${user?.uid}` : `/investors/${user?.uid}`} className="gap-2">
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
              {completeness < 100 ? "Add experience and vision to attract partners." : "Your profile is fully ready!"}
            </p>
            
            {completeness < 100 && (
              <div className="mt-4 pt-4 border-t border-dashed space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suggestions</p>
                <div className="space-y-2">
                  {!profile?.bio && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Add professional bio
                    </Link>
                  )}
                  {!profile?.imageUrl && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Upload profile photo
                    </Link>
                  )}
                  {(!profile?.experience || profile.experience.length === 0) && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Add work experience
                    </Link>
                  )}
                  {isFounder && !startup?.pitchDeckUrl && (
                    <Link href="/dashboard/fundraising" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Upload pitch deck
                    </Link>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        {isFounder && (
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
        )}

        {isFounder && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fundraising</CardTitle>
              <HandCoins className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {startup?.fundraisingStatus || 'Inactive'}
              </div>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Goal: {startup?.fundingNeed || '$0'}
              </p>
              
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-medium">
                  <span>Funding Progress</span>
                  <span>0%</span>
                </div>
                <Progress value={0} className="h-1.5" />
                
                <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-dashed border-primary/10 mt-2">
                  <div className="text-center border-r border-dashed border-primary/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Interest</p>
                    <p className="text-sm font-bold text-primary">{interestsCount}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Views</p>
                    <p className="text-sm font-bold text-primary">{viewsCount}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" asChild className="w-full">
                  <Link href="/dashboard/fundraising">
                    Manage Campaign
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Pitch System UI */}
        {isFounder && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" /> Incoming Pitches
                </CardTitle>
                <CardDescription>Review proposals from interested investors.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-primary/5">{incomingPitches?.length || 0}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isIncomingPitchesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : incomingPitches && incomingPitches.length > 0 ? (
                  incomingPitches.map((pitch: any) => (
                    <div key={pitch.id} className="p-4 border rounded-2xl bg-muted/20 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={`https://picsum.photos/seed/${pitch.fromInvestorUid}/40/40`} />
                            <AvatarFallback>I</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold">Investor</p>
                            <p className="text-xs text-muted-foreground">{pitch.createdAt?.toDate() ? new Date(pitch.createdAt.toDate()).toLocaleDateString() : 'Just now'}</p>
                          </div>
                        </div>
                        <Badge variant={pitch.status === 'accepted' ? 'default' : pitch.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {pitch.status?.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm italic text-muted-foreground">"{pitch.message}"</p>
                      {pitch.status === 'pending' && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => handlePitchStatus(pitch.id, 'rejected')} className="text-destructive hover:text-destructive">
                            <X className="h-4 w-4 mr-1" /> Reject
                          </Button>
                          <Button size="sm" onClick={() => handlePitchStatus(pitch.id, 'accepted')}>
                            <Check className="h-4 w-4 mr-1" /> Accept
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 border-2 border-dashed rounded-3xl">
                    <Mail className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">No incoming pitches yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isInvestor && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" /> Sent Pitches
                </CardTitle>
                <CardDescription>Track the status of your investment proposals.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-primary/5">{sentPitches?.length || 0}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isSentPitchesLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : sentPitches && sentPitches.length > 0 ? (
                  sentPitches.map((pitch: any) => (
                    <div key={pitch.id} className="p-4 border rounded-2xl bg-muted/20 space-y-3">
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Sent on {pitch.createdAt?.toDate() ? new Date(pitch.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                        </p>
                        <Badge variant={pitch.status === 'accepted' ? 'default' : pitch.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {pitch.status?.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm line-clamp-2">"{pitch.message}"</p>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/founders/${pitch.toFounderUid}`}>View Founder Profile</Link>
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 border-2 border-dashed rounded-3xl">
                    <Send className="h-12 w-12 mx-auto text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">You haven't sent any pitches yet.</p>
                    <Button variant="outline" className="mt-4" asChild>
                      <Link href="/founders">Browse Founders</Link>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Interested Investors List for Founders */}
        {isFounder && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Investor Engagement</CardTitle>
              <CardDescription>Investors tracking your venture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Public Preview</p>
                <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-2xl border border-dashed border-primary/10">
                  <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-muted shadow-sm">
                    <Image src={profile?.imageUrl || `https://picsum.photos/seed/${user?.uid || 'user'}/128/128`} alt={displayName} fill className="object-cover" />
                  </div>
                  <div>
                    <p className="text-sm font-bold flex items-center gap-1">
                      {displayName} 
                      {profile?.isVerified && <CheckCircle2 className="h-3 w-3 text-primary" />}
                    </p>
                    <Badge variant="secondary" className="text-[9px] h-4">{profile?.stage || "Early"} Stage</Badge>
                  </div>
                </div>
              </div>

              <Separator className="bg-primary/5" />
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Interested Investors</p>
                  <Badge variant="outline" className="text-[9px] h-4 bg-primary/5">{interestsCount} Leads</Badge>
                </div>
                <div className="space-y-3">
                  {isInterestsLoading ? (
                    <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  ) : interests && interests.length > 0 ? (
                    interests.map((interest: any) => (
                      <div key={interest.id} className="flex items-center gap-3 group">
                        <Avatar className="h-8 w-8 border border-primary/10">
                          <AvatarImage src={`https://picsum.photos/seed/${interest.investorId}/40/40`} />
                          <AvatarFallback>{interest.investorName?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-bold leading-none">{interest.investorName}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{interest.investorHeadline}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" title="Send Message">
                          <Send className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic text-center py-2">No active leads yet.</p>
                  )}
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                <Link href={`/founders/${user?.uid}`}>View Full Public Profile</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common tasks you might want to perform.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {isFounder && (
            <>
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/dashboard/fundraising">
                  <HandCoins className="h-4 w-4" /> Launch / Edit Fundraising
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/dashboard/fundraising">
                  <FileText className="h-4 w-4" /> Upload Pitch Deck
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link href="/dashboard/startup">
                  <Rocket className="h-4 w-4" /> Edit Startup Profile
                </Link>
              </Button>
            </>
          )}
          {isInvestor && (
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/founders">
                <Users className="h-4 w-4" /> Browse Founders
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/10 shadow-sm md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> Recent Activity
              </CardTitle>
              <CardDescription>Track interactions with your startup and profile.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 group cursor-default">
                  <div className={`mt-1 p-2 rounded-lg bg-muted/50 ${activity.color} group-hover:scale-110 transition-transform`}>
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.text}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

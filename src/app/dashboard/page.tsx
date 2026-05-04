
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
   Rocket, 
   Target, 
   Loader2, 
   CheckCircle2, 
   ExternalLink, 
   Eye,
   Users,
   MessageSquare,
   Check,
   X,
   Heart,
   Send,
   ArrowRight,
   Zap,
   Briefcase,
   HandCoins,
   ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, limit, orderBy, updateDoc, getDoc, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button as ShadButton } from '@/components/ui/button';

const SUPER_ADMIN_EMAIL = "shahmubaruk05@gmail.com";

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [viewsCount, setViewsCount] = useState(0);
  const [interests, setInterests] = useState<any[]>([]);
  const [incomingPitches, setIncomingPitches] = useState<any[]>([]);
  const [sentPitches, setSentPitches] = useState<any[]>([]);
  const [chatsCount, setChatsCount] = useState(0);
  const [recommendedStartups, setRecommendedStartups] = useState<any[]>([]);
  const [incomingProfiles, setIncomingProfiles] = useState<Record<string, any>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  async function loadDashboardData() {
    if (!firestore || !user?.uid) return;
    setIsLoading(true);

    try {
      const profileSnap = await getDoc(doc(firestore, 'users', user.uid));
      const profileData = profileSnap.exists() ? profileSnap.data() : null;
      setProfile(profileData);

      // Super Admin Promotion Logic
      if (user.email === SUPER_ADMIN_EMAIL && profileData && profileData.role !== 'super_admin') {
        await updateDoc(doc(firestore, 'users', user.uid), {
          role: 'super_admin',
          updatedAt: serverTimestamp()
        });
        setProfile((prev: any) => ({ ...prev, role: 'super_admin' }));
        toast({
          title: "Permission Elevated",
          description: "Your account has been promoted to Super Admin.",
        });
      }

      const startupSnap = await getDoc(doc(firestore, 'startups', user.uid));
      const startupData = startupSnap.exists() ? startupSnap.data() : null;
      setStartup(startupData);

      // Fetch Chat count for all roles
      const chatsQ = query(
        collection(firestore, 'chats'),
        where('participants', 'array-contains', user.uid)
      );
      const chatsSnap = await getDocs(chatsQ);
      setChatsCount(chatsSnap.size);

      if (profileData?.role === 'founder' || profileData?.role === 'super_admin') {
        try {
          const viewsSnap = await getDocs(collection(firestore, 'startups', user.uid, 'views'));
          setViewsCount(viewsSnap.size);
        } catch (e) {
          console.warn("Could not load views:", e);
        }

        try {
          const interestsSnap = await getDocs(collection(firestore, 'startups', user.uid, 'interests'));
          setInterests(interestsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.warn("Could not load interests:", e);
        }

        const incomingQ = query(
          collection(firestore, 'pitches'),
          where('toFounderUid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const incomingSnap = await getDocs(incomingQ);
        const pitches = incomingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIncomingPitches(pitches);

        const uids = new Set(pitches.map((p: any) => p.fromInvestorUid));
        const profilesMap: Record<string, any> = {};
        for (const uid of Array.from(uids)) {
          const pSnap = await getDoc(doc(firestore, 'users', uid as string));
          if (pSnap.exists()) {
            profilesMap[uid as string] = pSnap.data();
          }
        }
        setIncomingProfiles(profilesMap);
      }

      if (profileData?.role === 'investor' || profileData?.role === 'super_admin') {
        const sentQ = query(
          collection(firestore, 'pitches'),
          where('fromInvestorUid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const sentSnap = await getDocs(sentQ);
        setSentPitches(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Load recommended startups
        const recQ = query(
          collection(firestore, 'startups'),
          orderBy('createdAt', 'desc'),
          limit(3)
        );
        const recSnap = await getDocs(recQ);
        setRecommendedStartups(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, [firestore, user?.uid]);

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "User";
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1).replace('_', ' ') : "Founder";
  const isFounder = profile?.role === 'founder' || profile?.role === 'super_admin';
  const isInvestor = profile?.role === 'investor' || profile?.role === 'super_admin';
  const isSuperAdmin = profile?.role === 'super_admin';
  
  const handlePitchStatus = async (pitch: any, status: 'accepted' | 'rejected') => {
    if (!firestore || !user?.uid) return;
    const pitchId = pitch.id;
    try {
      await updateDoc(doc(firestore, 'pitches', pitchId), { status });
      
      if (status === 'accepted') {
        const otherUid = user.uid === pitch.fromInvestorUid ? pitch.toFounderUid : pitch.fromInvestorUid;
        
        const q = query(
          collection(firestore, "chats"),
          where("participants", "array-contains", user.uid)
        );
        const snap = await getDocs(q);
        let existingChatId = null;
        snap.forEach(doc => {
          const data = doc.data();
          if (data.participants && data.participants.includes(otherUid)) {
            existingChatId = doc.id;
          }
        });

        if (!existingChatId) {
          await addDoc(collection(firestore, 'chats'), {
            participants: [user.uid, otherUid],
            lastMessage: "You are now connected!",
            updatedAt: serverTimestamp(),
          });
        }
      }

      setIncomingPitches(prev => prev.map(p => p.id === pitchId ? { ...p, status } : p));
      
      toast({
        title: status === 'accepted' ? "Connection Established!" : "Request Declined",
        description: status === 'accepted' 
          ? "You are now connected. Start the conversation." 
          : "You have declined this interest request.",
      });
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status.",
        variant: "destructive",
      });
    }
  };

  const completeness = (() => {
    if (!profile) return 0;
    const coreFields = ['headline', 'location', 'stage', 'skills', 'bio', 'whyBuilding', 'lookingFor', 'imageUrl'];
    let score = 0;
    const filledCore = coreFields.filter(f => profile[f] && (Array.isArray(profile[f]) ? profile[f].length > 0 : profile[f] !== ''));
    score += (filledCore.length / coreFields.length) * 70;
    if (profile.experience && profile.experience.length > 0) score += 15;
    if (profile.socialLinks && (profile.socialLinks.linkedin || profile.socialLinks.website)) score += 15;
    return Math.min(Math.round(score), 100);
  })();

  const acceptedCount = sentPitches.filter(p => p.status === 'accepted').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Welcome, {displayName} {profile?.isVerified && <CheckCircle2 className="h-6 w-6 text-primary" />}
            {isSuperAdmin && <ShieldAlert className="h-6 w-6 text-destructive" />}
          </h1>
          <p className="text-muted-foreground">
            {roleDisplay} • {user?.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShadButton variant="outline" size="sm" asChild>
            <Link href={isFounder ? `/founders/${user?.uid}` : `/investors/${user?.uid}`} className="gap-2">
              <ExternalLink className="h-4 w-4" /> View Public Profile
            </Link>
          </ShadButton>
          <ShadButton size="sm" asChild>
            <Link href="/dashboard/profile">Edit Profile</Link>
          </ShadButton>
        </div>
      </div>

      {isSuperAdmin && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-destructive flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> System Administrator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">You have full access to manage users, startups, and services across the platform.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isInvestor ? (
          <>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Interests Sent</CardTitle>
                <Heart className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sentPitches.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Total startup requests sent.</p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Connections</CardTitle>
                <Users className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{acceptedCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Accepted connection requests.</p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{chatsCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Active chat threads.</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Profile Score</CardTitle>
                <Target className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completeness}%</div>
                <Progress value={completeness} className="mt-2 h-2" />
              </CardContent>
            </Card>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Startup Listing</CardTitle>
                <Rocket className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold truncate">{startup ? startup.name : "Unlisted"}</div>
                <p className="text-xs text-muted-foreground mt-1">{startup?.stage || "Venture"}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Views</CardTitle>
                <Eye className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{viewsCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Venture profile views.</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {isInvestor ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-primary" /> Recommended Startups
                  </CardTitle>
                  <CardDescription>Featured ventures matching the ecosystem.</CardDescription>
                </div>
                <ShadButton variant="ghost" size="sm" asChild className="text-primary hover:text-primary/80">
                  <Link href="/founders" className="gap-1">Explore More <ArrowRight className="h-4 w-4" /></Link>
                </ShadButton>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {recommendedStartups.length > 0 ? (
                    recommendedStartups.map((s) => (
                      <div key={s.id} className="p-4 border rounded-2xl bg-muted/20 space-y-2 hover:bg-muted/30 transition-colors">
                        <p className="font-bold text-sm truncate">{s.name}</p>
                        <Badge variant="secondary" className="text-[10px] h-4">{s.industry}</Badge>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 h-7">{s.shortDescription}</p>
                        <ShadButton size="sm" variant="link" className="p-0 h-auto text-xs" asChild>
                          <Link href={`/founders/${s.ownerUid}`}>View Founder</Link>
                        </ShadButton>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 py-10 text-center text-muted-foreground italic text-sm">
                      No recommended startups yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Heart className="h-5 w-5 text-primary" /> Incoming Requests
                  </CardTitle>
                  <CardDescription>Review interest requests from potential investors.</CardDescription>
                </div>
                {incomingPitches.some(p => p.status === 'pending') && (
                  <Badge variant="destructive" className="animate-pulse flex items-center gap-1.5 rounded-full px-3 h-7">
                    <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                    New investor interest
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {incomingPitches.length > 0 ? (
                    incomingPitches.map((pitch: any) => {
                      const investorProfile = incomingProfiles[pitch.fromInvestorUid];
                      const investorName = investorProfile?.fullName || "Investor";
                      return (
                        <div key={pitch.id} className="p-6 border rounded-[2rem] bg-muted/20 space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-4">
                              <Avatar className="h-14 w-14 border-2 border-primary/10 rounded-2xl">
                                <AvatarImage src={investorProfile?.imageUrl} />
                                <AvatarFallback>{investorName.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Link href={`/investors/${pitch.fromInvestorUid}`} className="text-lg font-bold hover:underline">
                                    {investorName}
                                  </Link>
                                  {investorProfile?.isOpenToPitches && (
                                    <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-primary/20 bg-primary/5 text-primary gap-1">
                                      <Zap className="h-2.5 w-2.5 fill-primary" /> Open to Pitches
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-medium text-primary/80">{investorProfile?.investorHeadline || "Active Investor"}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {pitch.status === 'pending' ? (
                                <>
                                  <ShadButton 
                                    size="sm" 
                                    variant="outline" 
                                    className="rounded-xl h-10 w-10 p-0" 
                                    onClick={() => handlePitchStatus(pitch, 'rejected')}
                                  >
                                    <X className="h-4 w-4" />
                                  </ShadButton>
                                  <ShadButton 
                                    size="sm" 
                                    className="rounded-xl h-10 px-4 gap-2" 
                                    onClick={() => handlePitchStatus(pitch, 'accepted')}
                                  >
                                    <Check className="h-4 w-4" /> Accept
                                  </ShadButton>
                                </>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant={pitch.status === 'accepted' ? 'default' : 'secondary'}
                                    className="rounded-full px-4"
                                  >
                                    {pitch.status === 'accepted' ? 'Connected' : 'Declined'}
                                  </Badge>
                                  {pitch.status === 'accepted' && (
                                    <ShadButton size="sm" variant="outline" asChild className="rounded-xl gap-2 h-9 px-4">
                                      <Link href={`/chats/${pitch.id}`}>
                                        <MessageSquare className="h-4 w-4" /> Message
                                      </Link>
                                    </ShadButton>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-muted-foreground/10">
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                <Target className="h-3 w-3" /> Investment Focus
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {Array.isArray(investorProfile?.investmentFocus) && investorProfile.investmentFocus.length > 0 ? (
                                  investorProfile.investmentFocus.map((f: string) => (
                                    <Badge key={f} variant="secondary" className="text-[10px] bg-background border h-5 px-2">
                                      {f}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Generalist</span>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                  <HandCoins className="h-3 w-3" /> Ticket Size
                                </p>
                                <p className="text-sm font-bold">{investorProfile?.ticketSize || 'TBD'}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                  <Briefcase className="h-3 w-3" /> Pref. Stages
                                </p>
                                <p className="text-xs font-medium truncate">
                                  {Array.isArray(investorProfile?.preferredStage) ? investorProfile.preferredStage.join(', ') : 'All Stages'}
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground italic pt-2">
                            * Review this investor before accepting to ensure a strategic fit.
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-[2.5rem] bg-muted/10 space-y-3">
                      <Heart className="h-10 w-10 text-muted-foreground mx-auto opacity-20" />
                      <div>
                        <p className="text-sm font-bold text-muted-foreground">No investor interest yet.</p>
                        <p className="text-xs text-muted-foreground max-w-[240px] mx-auto mt-1">
                          Complete your startup profile to attract investors.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isInvestor && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" /> Sent Requests
                </CardTitle>
                <CardDescription>Tracking your outreach to founders.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sentPitches.length > 0 ? (
                    sentPitches.slice(0, 5).map((pitch) => (
                      <div key={pitch.id} className="flex items-center justify-between p-3 border rounded-xl">
                        <div className="flex items-center gap-3">
                          <Badge variant={pitch.status === 'accepted' ? 'default' : 'secondary'}>{pitch.status}</Badge>
                          <p className="text-sm font-medium">Request to Founder</p>
                        </div>
                        <ShadButton size="sm" variant="ghost" asChild>
                          <Link href={`/founders/${pitch.toFounderUid}`}>Profile</Link>
                        </ShadButton>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-[2.5rem] bg-muted/10 space-y-4">
                      <Send className="h-10 w-10 text-muted-foreground mx-auto opacity-20" />
                      <div>
                        <p className="text-sm font-bold text-muted-foreground">You haven't expressed interest yet.</p>
                        <p className="text-xs text-muted-foreground mt-1 mb-6">
                          Discover high-potential startups in the directory.
                        </p>
                        <ShadButton size="sm" asChild>
                          <Link href="/founders">Explore Startups</Link>
                        </ShadButton>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6 text-sm text-muted-foreground italic">
                {chatsCount > 0 ? "You have active discussions in your inbox." : "No messages yet."}
                <ShadButton variant="link" className="block w-full mt-2" asChild>
                  <Link href="/dashboard/messages">Go to Inbox</Link>
                </ShadButton>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/10">
            <CardHeader>
              <CardTitle className="text-sm">Ecosystem Update</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <p>• <strong>Verification:</strong> Get your profile verified to increase visibility by 40%.</p>
              <p>• <strong>Networking:</strong> The community forum is launching next month.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

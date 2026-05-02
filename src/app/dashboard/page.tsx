'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
   Rocket, 
   Target, 
   Loader2, 
   CheckCircle2, 
   Share2, 
   ExternalLink, 
   HandCoins,
   Eye,
   Users,
   Clock,
   Send,
   Check,
   X,
   Heart,
   MessageCircle,
   MessageSquare,
   Briefcase,
   TrendingUp,
   Info,
   AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, limit, orderBy, updateDoc, getDoc, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

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

      const startupSnap = await getDoc(doc(firestore, 'startups', user.uid));
      const startupData = startupSnap.exists() ? startupSnap.data() : null;
      setStartup(startupData);

      if (profileData?.role === 'founder') {
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

        // Fetch profiles for incoming pitches
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

      if (profileData?.role === 'investor') {
        const sentQ = query(
          collection(firestore, 'pitches'),
          where('fromInvestorUid', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        const sentSnap = await getDocs(sentQ);
        setSentPitches(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Founder";
  const isFounder = profile?.role === 'founder';
  const isInvestor = profile?.role === 'investor';
  const interestsCount = interests.length;

  const hasNewInterest = incomingPitches.some(p => p.status === 'pending');

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
        description: "Failed to update status. You may not have permission.",
        variant: "destructive",
      });
    }
  };

  async function openChat(pitch: any) {
    if (!firestore || !user?.uid || isOpeningChat) return;
    setIsOpeningChat(true);
    try {
      const otherUid = user.uid === pitch.fromInvestorUid ? pitch.toFounderUid : pitch.fromInvestorUid;
      
      const q = query(
        collection(firestore, "chats"),
        where("participants", "array-contains", user.uid)
      );

      const snap = await getDocs(q);
      let chatId = null;

      snap.forEach(doc => {
        const data = doc.data();
        if (data.participants && data.participants.includes(otherUid)) {
          chatId = doc.id;
        }
      });

      if (chatId) {
        router.push(`/chats/${chatId}`);
      } else if (pitch.status === 'accepted') {
        const newChatRef = await addDoc(collection(firestore, 'chats'), {
          participants: [user.uid, otherUid],
          lastMessage: "Conversation started",
          updatedAt: serverTimestamp(),
        });
        router.push(`/chats/${newChatRef.id}`);
      } else {
        toast({
          title: "Chat not found",
          description: "A formal chat room hasn't been created yet for this connection.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      toast({
        title: "Error",
        description: "Failed to access conversation. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsOpeningChat(false);
    }
  }

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

  const copyToClipboard = (path: string, type: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied!",
      description: `${type} link has been copied to your clipboard.`,
    });
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case 'accepted': return 'Connected';
      case 'rejected': return 'Declined';
      case 'pending': return 'Waiting';
      default: return status;
    }
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
                {startup ? `${startup.industry} • ${startup.stage}` : "Share your venture with the community."}
              </p>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="ghost" asChild className="flex-1 border border-dashed border-primary/20 hover:bg-primary/5">
                  <Link href="/dashboard/startup">{startup ? "Update Venture" : "Create Startup Listing"}</Link>
                </Button>
                {startup && (
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(`/startups/${user?.uid}`, 'Startup')}>
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
              <CardTitle className="text-sm font-medium">Engagement</CardTitle>
              <HandCoins className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{interestsCount} Interests</div>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Goal: {startup?.fundingNeed || '$0'}</p>
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-medium">
                  <span>Views Progress</span>
                  <span>{viewsCount} Views</span>
                </div>
                <Progress value={Math.min(viewsCount, 100)} className="h-1.5" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(isFounder || profile?.role === 'mentor') && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" /> Incoming Requests
                </CardTitle>
                <CardDescription>Review interest requests from potential investors.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {hasNewInterest && (
                  <Badge variant="destructive" className="animate-pulse flex items-center gap-1.5 px-3">
                    🔴 New investor interest
                  </Badge>
                )}
                <Badge variant="outline" className="bg-primary/5">{incomingPitches.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {incomingPitches.length > 0 ? (
                  incomingPitches.map((pitch: any) => {
                    const investorProfile = incomingProfiles[pitch.fromInvestorUid];
                    const investorName = investorProfile?.fullName || "Potential Investor";
                    const investorHeadline = investorProfile?.investorHeadline || investorProfile?.headline || "Investor";
                    
                    return (
                      <div key={pitch.id} className="p-6 border rounded-[2rem] bg-muted/20 space-y-6 relative group transition-all hover:bg-muted/30">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                              <AvatarImage src={investorProfile?.imageUrl || `https://picsum.photos/seed/${pitch.fromInvestorUid}/60/60`} />
                              <AvatarFallback>{investorName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <Link href={`/investors/${pitch.fromInvestorUid}`} className="hover:underline flex items-center gap-2">
                                <p className="text-lg font-extrabold">{investorName}</p>
                                {investorProfile?.isVerified && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              </Link>
                              <p className="text-sm text-primary font-medium">{investorHeadline}</p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Badge variant={pitch.status === 'accepted' ? 'default' : pitch.status === 'rejected' ? 'destructive' : 'secondary'} className="rounded-lg">
                              {getStatusDisplay(pitch.status)}
                            </Badge>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                              {pitch.createdAt?.toDate() ? new Date(pitch.createdAt.toDate()).toLocaleDateString() : 'Recently'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 border-y border-border/50">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Investment Focus</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {investorProfile?.investmentFocus?.length > 0 ? (
                                investorProfile.investmentFocus.map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-2 py-0 h-5 bg-background border-primary/20 text-primary">
                                    {tag}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Generalist</span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Preferred Stage</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {investorProfile?.preferredStage?.length > 0 ? (
                                investorProfile.preferredStage.map((s: string) => (
                                  <Badge key={s} variant="secondary" className="text-[10px] px-2 py-0 h-5">
                                    {s}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Any Stage</span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ticket Size</p>
                            <p className="text-sm font-bold text-primary">{investorProfile?.ticketSize || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="p-4 rounded-2xl bg-background/50 italic text-sm text-muted-foreground border">
                            {pitch.message ? `"${pitch.message}"` : "Expressed interest in connecting with your venture."}
                          </div>
                          
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                               <Info className="h-3 w-3" />
                               Review this investor before accepting
                             </div>

                             <div className="flex gap-2 justify-end">
                                {pitch.status === 'pending' && (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => handlePitchStatus(pitch, 'rejected')} 
                                      className="text-destructive border-destructive/20 hover:bg-destructive/5 rounded-xl h-9 px-4"
                                    >
                                      <X className="h-4 w-4 mr-1.5" /> Ignore
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      onClick={() => handlePitchStatus(pitch, 'accepted')}
                                      className="rounded-xl h-9 px-6"
                                    >
                                      <Check className="h-4 w-4 mr-1.5" /> Accept
                                    </Button>
                                  </>
                                )}
                                {pitch.status === 'accepted' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="gap-2 rounded-xl h-9 bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary" 
                                    onClick={() => openChat(pitch)} 
                                    disabled={isOpeningChat}
                                  >
                                    {isOpeningChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                                    Message Investor
                                  </Button>
                                )}
                             </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-20 border-2 border-dashed rounded-[2rem]">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                    <p className="text-muted-foreground font-medium">No incoming interest requests yet.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isInvestor && (
          <>
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" /> Sent Requests
                  </CardTitle>
                  <CardDescription>Track the status of your interest requests.</CardDescription>
                </div>
                <Badge variant="outline" className="bg-primary/5">{sentPitches.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sentPitches.length > 0 ? (
                    sentPitches.map((pitch: any) => (
                      <div key={pitch.id} className="p-4 border rounded-2xl bg-muted/20 space-y-3">
                        <div className="flex justify-between items-center">
                          <p className="text-xs font-bold text-muted-foreground uppercase">
                            Sent on {pitch.createdAt?.toDate() ? new Date(pitch.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge variant={pitch.status === 'accepted' ? 'default' : pitch.status === 'rejected' ? 'destructive' : 'secondary'}>
                              {getStatusDisplay(pitch.status)}
                            </Badge>
                            {pitch.status === 'accepted' && (
                              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => openChat(pitch)} disabled={isOpeningChat}>
                                {isOpeningChat ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                                Open Chat
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm line-clamp-2">
                          {pitch.message ? `"${pitch.message}"` : "Sent interest request."}
                        </p>
                        <div className="flex justify-end">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/founders/${pitch.toFounderUid}`}>View Founder Profile</Link>
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-3xl">
                      <p className="text-sm text-muted-foreground">No requests sent yet</p>
                      <Button variant="outline" className="mt-4" asChild>
                        <Link href="/founders">Browse Founders</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Rocket className="h-5 w-5 text-primary" /> Connected Founders
                  </CardTitle>
                  <CardDescription>Founders you are officially connected with.</CardDescription>
                </div>
                <Badge variant="outline" className="bg-primary/5">{connectedFounders.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {connectedFounders.length > 0 ? (
                    connectedFounders.map((pitch: any) => (
                      <div key={pitch.id} className="flex items-center justify-between p-4 border rounded-2xl bg-background shadow-sm">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={`https://picsum.photos/seed/${pitch.toFounderUid}/40/40`} />
                            <AvatarFallback>F</AvatarFallback>
                          </Avatar>
                          <div>
                            <Link href={`/founders/${pitch.toFounderUid}`} className="hover:underline">
                              <p className="font-bold">{pitch.toFounderName || "Founder"}</p>
                            </Link>
                            <p className="text-xs text-muted-foreground">Status: Connected</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openChat(pitch)}>
                          <MessageSquare className="h-4 w-4" /> Message
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-3xl">
                      <p className="text-sm text-muted-foreground">No connections yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {isFounder && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Lead Connections</CardTitle>
              <CardDescription>Investors tracking your venture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {interests.length > 0 ? (
                  interests.map((interest: any) => (
                    <div key={interest.id} className="flex items-center gap-3 group">
                      <Avatar className="h-8 w-8 border border-primary/10">
                        <AvatarImage src={`https://picsum.photos/seed/${interest.investorId}/40/40`} />
                        <AvatarFallback>{interest.investorName?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <Link href={`/investors/${interest.investorId}`} className="hover:underline">
                          <p className="text-xs font-bold leading-none">{interest.investorName}</p>
                        </Link>
                        <p className="text-[10px] text-muted-foreground truncate">{interest.investorHeadline}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" onClick={() => openChat({ fromInvestorUid: interest.investorId, toFounderUid: user?.uid, status: 'accepted' })}>
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground italic text-center py-2">No active leads yet.</p>
                )}
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" asChild>
                <Link href={`/founders/${user?.uid}`}>View Public Profile</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

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
              <div key={activity.id} className="flex items-start gap-4 group">
                <div className={`mt-1 p-2 rounded-lg bg-muted/50 ${activity.color}`}>
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
  );
}
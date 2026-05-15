'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
   ShieldAlert,
   Globe,
   MapPin,
   Info,
   Clock,
   UserPlus,
   Wrench
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  doc, 
  collection, 
  query, 
  where, 
  limit, 
  orderBy, 
  updateDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  arrayUnion,
  onSnapshot
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const SUPER_ADMIN_EMAIL = "shahmubaruk05@gmail.com";

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [viewsCount, setViewsCount] = useState(0);
  const [incomingPitches, setIncomingPitches] = useState<any[]>([]);
  const [sentPitches, setSentPitches] = useState<any[]>([]);
  const [chatsCount, setChatsCount] = useState(0);
  const [recommendedStartups, setRecommendedStartups] = useState<any[]>([]);
  const [investorProfiles, setInvestorProfiles] = useState<Record<string, any>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isPitchesLoading, setIsPitchesLoading] = useState(false);
  const [processingPitchId, setProcessingPitchId] = useState<string | null>(null);

  async function loadInitialData() {
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
          primaryRole: 'super_admin',
          roles: arrayUnion('super_admin'),
          updatedAt: serverTimestamp()
        });
        setProfile((prev: any) => ({ ...prev, role: 'super_admin', primaryRole: 'super_admin' }));
      }

      const startupSnap = await getDoc(doc(firestore, 'startups', user.uid));
      const startupData = startupSnap.exists() ? startupSnap.data() : null;
      setStartup(startupData);

      // Fetch Chat count
      const chatsQ = query(collection(firestore, 'chats'), where('participants', 'array-contains', user.uid));
      const chatsSnap = await getDocs(chatsQ);
      setChatsCount(chatsSnap.size);

      const rolesArr = (profileData?.roles || (profileData?.role ? [profileData.role] : ['user'])).filter(Boolean) as string[];
      const isFounder = rolesArr.includes('founder') || rolesArr.includes('super_admin');
      const isInvestor = rolesArr.includes('investor') || rolesArr.includes('super_admin');

      if (isFounder) {
        try {
          const viewsSnap = await getDocs(collection(firestore, 'startups', user.uid, 'views'));
          setViewsCount(viewsSnap.size);
        } catch (e) { console.warn("Could not fetch views", e); }
        
        loadIncomingPitches();
      }

      if (isInvestor) {
        const sentQ = query(collection(firestore, 'pitches'), where('fromInvestorUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
        const sentSnap = await getDocs(sentQ);
        setSentPitches(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const recQ = query(collection(firestore, 'startups'), orderBy('createdAt', 'desc'), limit(3));
        const recSnap = await getDocs(recQ);
        setRecommendedStartups(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const loadIncomingPitches = async () => {
    if (!firestore || !user?.uid) return;
    setIsPitchesLoading(true);
    try {
      const incomingQ = query(
        collection(firestore, 'pitches'), 
        where('toFounderUid', '==', user.uid), 
        orderBy('createdAt', 'desc'), 
        limit(10)
      );
      
      const snap = await getDocs(incomingQ);
      const pitches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIncomingPitches(pitches);

      // Fetch detailed profiles for all investors
      const uids = Array.from(new Set(pitches.map((p: any) => p.fromInvestorUid)));
      const profilesMap: Record<string, any> = { ...investorProfiles };
      
      for (const uid of uids) {
        if (!profilesMap[uid as string]) {
          const pSnap = await getDoc(doc(firestore, 'users', uid as string));
          if (pSnap.exists()) {
            profilesMap[uid as string] = pSnap.data();
          }
        }
      }
      setInvestorProfiles(profilesMap);
    } catch (e) {
      console.error("Error loading incoming pitches:", e);
    } finally {
      setIsPitchesLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [firestore, user?.uid]);

  const handlePitchStatus = async (pitch: any, status: 'accepted' | 'rejected') => {
    if (!firestore || !user?.uid || processingPitchId) return;
    
    setProcessingPitchId(pitch.id);
    const investorUid = pitch.fromInvestorUid;
    const investorProfile = investorProfiles[investorUid];

    try {
      await updateDoc(doc(firestore, 'pitches', pitch.id), { 
        status,
        updatedAt: serverTimestamp()
      });

      if (status === 'accepted') {
        // 1. Create/Check Chat
        const chatsQ = query(collection(firestore, "chats"), where("participants", "array-contains", user.uid));
        const chatsSnap = await getDocs(chatsQ);
        let existingChatId = null;
        chatsSnap.forEach(doc => {
          if (doc.data().participants?.includes(investorUid)) existingChatId = doc.id;
        });

        if (!existingChatId) {
          await addDoc(collection(firestore, 'chats'), {
            participants: [user.uid, investorUid],
            lastMessage: "You are now connected! Start building together.",
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }

        // 2. Notify Investor
        createNotification(firestore, {
          recipientUid: investorUid,
          actorUid: user.uid,
          type: 'connection',
          title: 'Interest Accepted',
          message: `${profile?.fullName || 'A founder'} accepted your interest request. You can now chat!`,
          targetId: user.uid,
          targetType: 'user'
        });

        toast({ 
          title: "Connection Established", 
          description: `You are now connected with ${investorProfile?.fullName || 'the investor'}.`,
        });
      } else {
        toast({ title: "Request Declined" });
      }

      setIncomingPitches(prev => prev.map(p => p.id === pitch.id ? { ...p, status } : p));
    } catch (error) {
      console.error("Error processing pitch:", error);
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setProcessingPitchId(null);
    }
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Worskpace...</p>
        </div>
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "User";
  const roles = (profile?.roles || (profile?.role ? [profile.role] : ['user'])).filter(Boolean) as string[];
  const isFounder = roles.includes('founder') || roles.includes('super_admin');
  const isInvestor = roles.includes('investor') || roles.includes('super_admin');

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Dashboard Overview</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            Welcome, {displayName} {profile?.isVerified && <CheckCircle2 className="h-6 w-6 text-primary" />}
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
            {roles.map(r => (
              <Badge key={r} variant="secondary" className="capitalize text-[9px] font-black tracking-wider py-0.5 px-2 bg-primary/5 text-primary border-none">
                {r.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild className="rounded-xl border-slate-200 hover:bg-slate-50 font-bold h-10 px-5">
            <Link href={isFounder ? `/founders/${user?.uid}` : `/investors/${user?.uid}`} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Public Profile
            </Link>
          </Button>
          <Button size="sm" asChild className="rounded-xl font-bold h-10 px-5 shadow-lg shadow-primary/20">
            <Link href="/dashboard/profile">Manage Roles</Link>
          </Button>
        </div>
      </div>

      {/* --- STATS GRID --- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Conversations</CardTitle>
            <div className="p-2 bg-blue-50 rounded-lg"><MessageSquare className="h-4 w-4 text-blue-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{chatsCount}</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Active communication channels</p>
          </CardContent>
        </Card>
        {isFounder && (
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Startup Views</CardTitle>
              <div className="p-2 bg-purple-50 rounded-lg"><Eye className="h-4 w-4 text-purple-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900">{viewsCount}</div>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Cumulative profile impressions</p>
            </CardContent>
          </Card>
        )}
        {isInvestor && (
          <Card className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Interests Sent</CardTitle>
              <div className="p-2 bg-rose-50 rounded-lg"><Heart className="h-4 w-4 text-rose-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black text-slate-900">{sentPitches.length}</div>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Venture outreach log</p>
            </CardContent>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          
          {/* --- RECENT INVESTOR INTEREST (UPGRADED) --- */}
          {isFounder && (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardHeader className="border-b border-slate-50 px-8 py-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-black flex items-center gap-3">
                      <Zap className="h-5 w-5 text-primary fill-primary/20" /> Recent Investor Interest
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-medium">Professional capital partners looking to connect.</CardDescription>
                  </div>
                  <Badge variant="outline" className="rounded-full px-3 py-1 font-bold text-[10px] uppercase border-slate-200">
                    {incomingPitches.filter(p => p.status === 'pending').length} Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-50">
                  {isPitchesLoading ? (
                    <div className="p-8 space-y-6">
                      {[1, 2].map(i => (
                        <div key={i} className="flex items-start gap-4">
                          <Skeleton className="h-14 w-14 rounded-2xl" />
                          <div className="flex-1 space-y-2">
                             <Skeleton className="h-4 w-1/3" />
                             <Skeleton className="h-3 w-1/2" />
                             <Skeleton className="h-10 w-full rounded-xl" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : incomingPitches.length > 0 ? (
                    incomingPitches.map((pitch: any) => {
                      const inv = investorProfiles[pitch.fromInvestorUid];
                      const isPending = pitch.status === 'pending';
                      const createdAt = pitch.createdAt?.toDate?.() || new Date();

                      return (
                        <div key={pitch.id} className="p-6 md:p-8 hover:bg-slate-50/50 transition-colors group">
                          <div className="flex flex-col md:flex-row md:items-start gap-6">
                            <Avatar className="h-16 w-16 rounded-2xl border-4 border-white shadow-md shadow-slate-200/50 shrink-0">
                              <AvatarImage src={inv?.imageUrl || `https://picsum.photos/seed/${pitch.fromInvestorUid}/200/200`} className="object-cover" />
                              <AvatarFallback className="bg-slate-100 font-black text-slate-400">
                                {inv?.fullName?.charAt(0) || 'I'}
                              </AvatarFallback>
                            </Avatar>
                            
                            <div className="flex-1 min-w-0 space-y-4">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xl font-black text-slate-900 truncate">{inv?.fullName || 'Professional Investor'}</h4>
                                    {inv?.isVerified && <CheckCircle2 className="h-4 w-4 text-primary fill-primary/10" />}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 mt-1">
                                    <p className="text-xs font-bold text-primary uppercase tracking-tight">
                                      {inv?.investorHeadline || inv?.headline || 'Capital Partner'}
                                    </p>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                      <Clock className="h-3 w-3" /> {formatDistanceToNow(createdAt, { addSuffix: true })}
                                    </div>
                                  </div>
                                </div>
                                <Badge className={cn(
                                  "w-fit rounded-lg px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest border-none shadow-sm",
                                  pitch.status === 'accepted' ? "bg-green-100 text-green-700" :
                                  pitch.status === 'rejected' ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                )}>
                                  {pitch.status}
                                </Badge>
                              </div>

                              <div className="bg-white/50 border border-slate-100 p-4 rounded-2xl relative overflow-hidden">
                                 <p className="text-sm text-slate-600 leading-relaxed font-medium line-clamp-2">
                                   "{pitch.message || inv?.investorBio || inv?.bio || 'Interested in learning more about your venture and exploring potential synergies.'}"
                                 </p>
                                 <div className="absolute top-0 right-0 p-2 opacity-5">
                                   <Zap className="h-8 w-8 text-primary" />
                                 </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-slate-400">
                                 <div className="flex items-center gap-1.5">
                                   <MapPin className="h-3.5 w-3.5 text-primary opacity-60" />
                                   {inv?.location || 'Remote'}
                                 </div>
                                 <div className="flex items-center gap-1.5">
                                   <Target className="h-3.5 w-3.5 text-primary opacity-60" />
                                   {Array.isArray(inv?.investmentFocus) ? inv.investmentFocus.slice(0, 2).join(', ') : 'Generalist'}
                                 </div>
                              </div>

                              <div className="pt-2 flex flex-wrap items-center gap-3">
                                {isPending ? (
                                  <>
                                    <Button 
                                      className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20 gap-2"
                                      disabled={processingPitchId === pitch.id}
                                      onClick={() => handlePitchStatus(pitch, 'accepted')}
                                    >
                                      {processingPitchId === pitch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                      Accept & Connect
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      className="rounded-xl h-10 px-4 font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 gap-2"
                                      disabled={processingPitchId === pitch.id}
                                      onClick={() => handlePitchStatus(pitch, 'rejected')}
                                    >
                                      <X className="h-4 w-4" /> Reject
                                    </Button>
                                  </>
                                ) : pitch.status === 'accepted' ? (
                                  <Button variant="outline" className="rounded-xl h-10 px-6 font-bold border-primary/20 text-primary gap-2" asChild>
                                    <Link href="/dashboard/messages">
                                      <MessageSquare className="h-4 w-4" /> Open Chat
                                    </Link>
                                  </Button>
                                ) : null}
                                
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" className="rounded-xl h-10 px-4 font-bold border-slate-200">
                                      View Profile
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-[600px] rounded-[2.5rem] p-0 overflow-hidden">
                                    <ScrollArea className="max-h-[85vh]">
                                      <div className="h-32 bg-gradient-to-r from-primary/20 to-accent/20" />
                                      <div className="px-8 pb-10 -mt-12 space-y-8">
                                        <div className="flex flex-col md:flex-row gap-6 items-end">
                                          <Avatar className="h-32 w-32 rounded-3xl border-8 border-background shadow-2xl">
                                            <AvatarImage src={inv?.imageUrl} className="object-cover" />
                                            <AvatarFallback className="text-3xl font-black">{inv?.fullName?.charAt(0)}</AvatarFallback>
                                          </Avatar>
                                          <div className="flex-1 space-y-1">
                                            <h2 className="text-3xl font-black text-slate-900">{inv?.fullName || 'Investor'}</h2>
                                            <p className="text-lg font-bold text-primary">{inv?.investorHeadline || inv?.headline || 'Venture Partner'}</p>
                                          </div>
                                        </div>

                                        <div className="space-y-6">
                                           <div className="space-y-2">
                                              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Investment Philosophy</h5>
                                              <p className="text-slate-600 font-medium leading-relaxed italic">
                                                "{inv?.investorBio || inv?.bio || 'Focused on supporting the next generation of founders in emerging markets.'}"
                                              </p>
                                           </div>

                                           <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                                              <div className="space-y-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Ticket Size</p>
                                                <p className="text-lg font-black text-slate-900">{inv?.ticketSize || 'Varies'}</p>
                                              </div>
                                              <div className="space-y-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Preferred Stage</p>
                                                <p className="text-lg font-black text-slate-900">{Array.isArray(inv?.preferredStage) ? inv.preferredStage.join(', ') : (inv?.preferredStage || 'Flexible')}</p>
                                              </div>
                                           </div>

                                           <div className="space-y-3">
                                              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vertical Focus</h5>
                                              <div className="flex flex-wrap gap-2">
                                                {(inv?.investmentFocus || ['SaaS', 'Fintech', 'AI']).map((f: string) => (
                                                  <Badge key={f} className="rounded-lg bg-primary/5 text-primary border-none px-3 py-1 font-bold">{f}</Badge>
                                                ))}
                                              </div>
                                           </div>
                                        </div>

                                        <div className="pt-6 border-t border-slate-100 flex gap-3">
                                           <Button className="flex-1 h-12 rounded-xl font-bold" onClick={() => router.push(`/investors/${pitch.fromInvestorUid}`)}>
                                              Full Public Profile
                                           </Button>
                                           {inv?.linkedinUrl && (
                                             <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl" asChild>
                                               <a href={inv.linkedinUrl} target="_blank" rel="noopener"><Globe className="h-5 w-5" /></a>
                                             </Button>
                                           )}
                                        </div>
                                      </div>
                                    </ScrollArea>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-6">
                      <div className="p-6 bg-slate-50 rounded-full">
                        <HandCoins className="h-12 w-12 text-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xl font-black text-slate-900">No investor outreach yet</h4>
                        <p className="text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                          Build momentum by completing your startup profile. Verified profiles with clear traction get 5x more investor interest.
                        </p>
                      </div>
                      <Button size="lg" className="rounded-full px-8 h-12 font-bold shadow-xl shadow-primary/20" asChild>
                        <Link href="/dashboard/startup">Complete Startup Profile</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
              {incomingPitches.length > 5 && (
                <CardFooter className="bg-slate-50/50 p-4 border-t border-slate-50 flex justify-center">
                  <Button variant="ghost" size="sm" className="font-bold text-xs text-primary uppercase tracking-widest gap-2">
                    View full history <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardFooter>
              )}
            </Card>
          )}

          {isInvestor && (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardHeader className="px-8 py-8">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <Rocket className="h-5 w-5 text-primary" /> Recommended Ventures
                </CardTitle>
                <CardDescription className="text-slate-400 font-medium">New startups matching your investment criteria.</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                <div className="grid gap-6 md:grid-cols-3">
                  {recommendedStartups.map(s => (
                    <Card key={s.id} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-300 rounded-[2rem] overflow-hidden bg-slate-50/50 flex flex-col">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest px-2">{s.industry}</Badge>
                        </div>
                        <CardTitle className="text-lg font-black truncate text-slate-900 group-hover:text-primary transition-colors">{s.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 pb-4">
                        <p className="text-xs text-slate-500 font-medium line-clamp-2 h-8 leading-relaxed mb-4 italic">
                          "{s.shortDescription || 'A promising venture building the future.'}"
                        </p>
                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                           <span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.stage}</span>
                           <Button variant="link" className="p-0 h-auto text-[11px] font-bold" asChild>
                             <Link href={`/startups/${s.ownerUid}`}>View <ArrowRight className="ml-1 h-3 w-3" /></Link>
                           </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* --- SIDEBAR WIDGETS --- */}
        <div className="space-y-6">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden group">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                 <div className="h-1 w-6 bg-primary rounded-full" />
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">System</span>
              </div>
              <CardTitle className="text-lg font-black">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-8">
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/community"><Globe className="h-4 w-4 text-primary" /> Community Feed</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/dashboard/profile"><Users className="h-4 w-4 text-primary" /> Multi-Role Settings</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/services"><Wrench className="h-4 w-4 text-primary" /> Startup Services</Link>
              </Button>
            </CardContent>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none" />
          </Card>

          {isFounder && !startup && (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-primary text-white overflow-hidden animate-bounce-subtle">
               <CardHeader>
                 <CardTitle className="flex items-center gap-2 text-white">
                   <ShieldAlert className="h-5 w-5" /> Incomplete Listing
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4 pb-8">
                  <p className="text-sm font-medium opacity-90 leading-relaxed">
                    You haven't listed your startup yet. Investors can't discover you without a professional profile.
                  </p>
                  <Button className="w-full rounded-xl h-11 bg-white text-primary hover:bg-slate-50 font-black shadow-lg" asChild>
                    <Link href="/dashboard/startup">Build My Profile</Link>
                  </Button>
               </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 overflow-hidden">
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Ecosystem Network</CardTitle>
             </CardHeader>
             <CardContent className="space-y-6 pb-6">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Avatar key={i} className="border-2 border-white h-10 w-10 ring-1 ring-slate-100 shadow-sm">
                      <AvatarImage src={`https://picsum.photos/seed/${i + 100}/40/40`} />
                      <AvatarFallback>U</AvatarFallback>
                    </Avatar>
                  ))}
                  <div className="h-10 w-10 rounded-full bg-slate-50 border-2 border-white flex items-center justify-center text-[10px] font-black text-slate-400 ring-1 ring-slate-100 shadow-sm">
                    +240
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Join 240+ builders and backers shaping the emerging startup ecosystem.
                </p>
                <Button variant="link" className="p-0 h-auto font-black text-[10px] uppercase tracking-[0.2em] text-primary" asChild>
                   <Link href="/founders">Explore Directory <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

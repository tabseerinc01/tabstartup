
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
   ArrowRight,
   Zap,
   ShieldAlert,
   Globe,
   MapPin,
   Clock,
   UserPlus,
   Wrench,
   HandCoins,
   CheckSquare,
   AlertCircle,
   Calendar
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { 
  doc, 
  collection, 
  query, 
  where, 
  limit, 
  updateDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  arrayUnion
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
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow, isToday, isPast } from 'date-fns';
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
  const [sentPitchesCount, setSentPitchesCount] = useState(0);
  const [chatsCount, setChatsCount] = useState(0);
  const [recommendedStartups, setRecommendedStartups] = useState<any[]>([]);
  const [investorProfiles, setInvestorProfiles] = useState<Record<string, any>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isPitchesLoading, setIsPitchesLoading] = useState(false);
  const [processingPitchId, setProcessingPitchId] = useState<string | null>(null);

  // Real-time Tasks Query
  const tasksQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: allTasks } = useCollection(tasksQ);

  const dashboardTasks = useMemo(() => {
    if (!allTasks) return { today: [], overdue: [], upcoming: [] };
    
    const active = allTasks.filter(t => t.status !== 'Completed');
    return {
      today: active.filter(t => t.dueDate && isToday(t.dueDate.toDate())),
      overdue: active.filter(t => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate())),
      upcoming: active.filter(t => t.dueDate && !isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate())).slice(0, 5)
    };
  }, [allTasks]);

  async function loadInitialData() {
    if (!firestore || !user?.uid) return;
    setIsLoading(true);

    try {
      const profileSnap = await getDoc(doc(firestore, 'users', user.uid));
      const profileData = profileSnap.exists() ? profileSnap.data() : null;
      setProfile(profileData);

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
        } catch (e) { }
        loadIncomingPitches();
      }

      if (isInvestor) {
        // Query connections and legacy pitches for count
        const connSentQ = query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'investor'));
        const pitchSentQ = query(collection(firestore, 'pitches'), where('fromInvestorUid', '==', user.uid));
        
        const [connSnap, pitchSnap] = await Promise.all([getDocs(connSentQ), getDocs(pitchSentQ)]);
        setSentPitchesCount(connSnap.size + pitchSnap.size);

        const recQ = query(collection(firestore, 'startups'), limit(3));
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
      // Fetch both new connections and legacy pitches
      const incomingConnQ = query(collection(firestore, 'connections'), where('recipientUid', '==', user.uid), where('type', '==', 'investor'));
      const incomingPitchQ = query(collection(firestore, 'pitches'), where('toFounderUid', '==', user.uid));
      
      const [connSnap, pitchSnap] = await Promise.all([getDocs(incomingConnQ), getDocs(incomingPitchQ)]);
      
      const connections = connSnap.docs.map(d => ({ id: d.id, ...d.data(), isLegacy: false }));
      const pitches = pitchSnap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(), 
        isLegacy: true, 
        initiatorUid: d.data().fromInvestorUid, 
        type: 'investor' 
      }));
      
      const combined = [...connections, ...pitches].sort((a: any, b: any) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      }).slice(0, 5);
      
      setIncomingPitches(combined);

      const uids = Array.from(new Set(combined.map((p: any) => p.initiatorUid || p.fromInvestorUid)));
      const profilesMap: Record<string, any> = { ...investorProfiles };
      
      for (const uid of uids) {
        if (!profilesMap[uid as string]) {
          const pSnap = await getDoc(doc(firestore, 'users', uid as string));
          if (pSnap.exists()) profilesMap[uid as string] = pSnap.data();
        }
      }
      setInvestorProfiles(profilesMap);
    } catch (e) {
      console.error("Error loading incoming interests:", e);
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
    const investorUid = pitch.initiatorUid || pitch.fromInvestorUid;
    const collectionName = pitch.isLegacy ? 'pitches' : 'connections';

    try {
      await updateDoc(doc(firestore, collectionName, pitch.id), { 
        status,
        updatedAt: serverTimestamp()
      });

      if (status === 'accepted') {
        const chatsQ = query(collection(firestore, "chats"), where("participants", "array-contains", user.uid));
        const chatsSnap = await getDocs(chatsQ);
        let existingChatId = null;
        chatsSnap.forEach(doc => {
          if (doc.data().participants?.includes(investorUid)) existingChatId = doc.id;
        });

        if (!existingChatId) {
          await addDoc(collection(firestore, 'chats'), {
            participants: [user.uid, investorUid],
            lastMessage: "Connection established!",
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          });
        }

        createNotification(firestore, {
          recipientUid: investorUid,
          actorUid: user.uid,
          type: 'connection',
          title: 'Interest Accepted',
          message: `${profile?.fullName || 'A founder'} accepted your interest request.`,
          targetId: user.uid,
          targetType: 'user'
        });

        toast({ title: "Connected!" });
      } else {
        createNotification(firestore, {
          recipientUid: investorUid,
          actorUid: user.uid,
          type: 'rejection',
          title: 'Pitch Declined',
          message: `${profile?.fullName || 'A founder'} declined your pitch for now.`,
          targetId: user.uid,
          targetType: 'user'
        });
        toast({ title: "Request Declined" });
      }

      setIncomingPitches(prev => prev.map(p => p.id === pitch.id ? { ...p, status } : p));
    } catch (error) {
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
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Workspace...</p>
        </div>
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "User";
  const rolesArr = (profile?.roles || (profile?.role ? [profile.role] : ['user'])).filter(Boolean) as string[];
  const isFounder = rolesArr.includes('founder') || rolesArr.includes('super_admin');
  const isInvestor = rolesArr.includes('investor') || rolesArr.includes('super_admin');

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
            {rolesArr.map(r => (
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        
        <Card className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Active Tasks</CardTitle>
            <div className="p-2 bg-amber-50 rounded-lg"><CheckSquare className="h-4 w-4 text-amber-600" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{allTasks?.filter(t => t.status !== 'Completed').length || 0}</div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Pending reminders</p>
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
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Profile impressions</p>
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
              <div className="text-3xl font-black text-slate-900">{sentPitchesCount}</div>
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tight">Venture outreach log</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Unified Action Panel */}
          <div className="grid gap-6 md:grid-cols-2">
             {/* Task Widget */}
             <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
               <CardHeader className="pb-4">
                 <CardTitle className="text-lg font-black flex items-center gap-2">
                   <Clock className="h-5 w-5 text-primary" /> Task Roadmap
                 </CardTitle>
                 <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Immediate focus areas</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                  {dashboardTasks.overdue.length > 0 && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100 space-y-3">
                       <div className="flex items-center gap-2 text-red-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-[10px] font-black uppercase">Overdue Actions ({dashboardTasks.overdue.length})</span>
                       </div>
                       <div className="space-y-2">
                          {dashboardTasks.overdue.slice(0, 2).map(t => (
                            <div key={t.id} className="text-xs font-bold text-slate-700 flex items-center gap-2">
                               <div className="h-1.5 w-1.5 rounded-full bg-red-500" /> {t.title}
                            </div>
                          ))}
                       </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Upcoming Today</p>
                    {dashboardTasks.today.length > 0 ? (
                       dashboardTasks.today.map(t => (
                         <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                            <span className="text-xs font-bold text-slate-700 truncate pr-4">{t.title}</span>
                            <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black bg-white border-slate-200">TODAY</Badge>
                         </div>
                       ))
                    ) : (
                      <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                         <p className="text-[10px] font-bold text-slate-400 uppercase italic">No tasks for today</p>
                      </div>
                    )}
                  </div>

                  <Button variant="outline" className="w-full rounded-xl h-11 border-slate-200 font-bold text-xs" asChild>
                    <Link href="/dashboard/tasks">Manage Full Roadmap <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
               </CardContent>
             </Card>

             {/* Pitch/Connection Widget (Founder Only) */}
             {isFounder && (
               <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                 <CardHeader className="pb-4">
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <Zap className="h-5 w-5 text-primary" /> Active Interests
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Inbound requests</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-4">
                    {incomingPitches.length > 0 ? (
                       incomingPitches.filter(p => p.status === 'pending').map(p => (
                         <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                            <Avatar className="h-8 w-8 rounded-lg border-2 border-white">
                               <AvatarImage src={investorProfiles[p.initiatorUid]?.imageUrl} />
                               <AvatarFallback className="font-bold text-[10px]">{investorProfiles[p.initiatorUid]?.fullName?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                               <p className="text-xs font-black text-slate-800 truncate">{investorProfiles[p.initiatorUid]?.fullName}</p>
                               <p className="text-[9px] font-bold text-primary uppercase">Investor</p>
                            </div>
                         </div>
                       ))
                    ) : (
                      <div className="py-12 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                         <HandCoins className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                         <p className="text-[10px] font-bold text-slate-400 uppercase italic">No new interests</p>
                      </div>
                    )}
                    <Button variant="outline" className="w-full rounded-xl h-11 border-slate-200 font-bold text-xs" asChild>
                      <Link href="/dashboard/connections">Manage Connections</Link>
                    </Button>
                 </CardContent>
               </Card>
             )}
          </div>

          {/* Recommendations or Pitch Deck Section */}
          {isInvestor && (
            <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardHeader className="px-8 py-8">
                <CardTitle className="text-xl font-black flex items-center gap-3">
                  <Rocket className="h-5 w-5 text-primary" /> Curated Ventures
                </CardTitle>
                <CardDescription className="text-slate-400 font-medium">New startups matching your investment criteria.</CardDescription>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                <div className="grid gap-6 md:grid-cols-3">
                  {recommendedStartups.map(s => (
                    <Card key={s.id} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-300 rounded-[2rem] overflow-hidden bg-slate-50/50 flex flex-col">
                      <CardHeader className="pb-2">
                        <Badge variant="secondary" className="text-[9px] font-black uppercase tracking-widest px-2 w-fit">{s.industry}</Badge>
                        <CardTitle className="text-lg font-black truncate text-slate-900 group-hover:text-primary transition-colors mt-2">{s.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 pb-4">
                        <p className="text-xs text-slate-500 font-medium line-clamp-2 h-8 leading-relaxed mb-4 italic">
                          "{s.shortDescription || 'A promising venture.'}"
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

        <div className="space-y-6">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden group relative">
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
                <Link href="/dashboard/tasks"><CheckSquare className="h-4 w-4 text-primary" /> Task Board</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/services"><Wrench className="h-4 w-4 text-primary" /> Startup Services</Link>
              </Button>
            </CardContent>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none" />
          </Card>

          {isFounder && !startup && (
            <Card className="border-none shadow-xl rounded-[2.5rem] bg-primary text-white overflow-hidden">
               <CardHeader>
                 <CardTitle className="flex items-center gap-2 text-white">
                   <ShieldAlert className="h-5 w-5" /> Incomplete Listing
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4 pb-8">
                  <p className="text-sm font-medium opacity-90 leading-relaxed">
                    Investors can't discover you without a professional profile.
                  </p>
                  <Button className="w-full rounded-xl h-11 bg-white text-primary hover:bg-slate-50 font-black shadow-lg" asChild>
                    <Link href="/dashboard/startup">Build Listing</Link>
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
                  Join 240+ builders and backers in the network.
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

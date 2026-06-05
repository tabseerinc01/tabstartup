
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
   Calendar,
   BarChart3,
   TrendingUp,
   Contact2,
   LayoutGrid,
   ChevronRight
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
  arrayUnion,
  orderBy
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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

  // --- Real-time Data Hooks ---
  
  // Tasks Query
  const tasksQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: allTasks } = useCollection(tasksQ);

  // Deals Query - Removing orderBy to avoid index requirement for permissions
  const dealsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: rawDeals } = useCollection(dealsQ);

  // Contacts Query - Removing limit/orderBy to avoid index requirement for permissions
  const contactsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: rawContacts } = useCollection(contactsQ);

  // --- Processed Data & Stats ---

  const deals = useMemo(() => {
    if (!rawDeals) return [];
    return [...rawDeals].sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() || 0;
      const tB = b.createdAt?.toMillis?.() || 0;
      return tB - tA;
    });
  }, [rawDeals]);

  const contacts = useMemo(() => {
    if (!rawContacts) return [];
    return [...rawContacts].sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() || 0;
      const tB = b.createdAt?.toMillis?.() || 0;
      return tB - tA;
    });
  }, [rawContacts]);

  const stats = useMemo(() => {
    const dealsList = deals || [];
    const tasksList = allTasks || [];
    
    const activeDeals = dealsList.filter(d => !['Won', 'Lost'].includes(d.stage));
    const wonDeals = dealsList.filter(d => d.stage === 'Won');
    
    const pipelineValue = dealsList.reduce((acc, d) => acc + (d.value || 0), 0);
    const wonRevenue = wonDeals.reduce((acc, d) => acc + (d.value || 0), 0);
    
    const pendingTasks = tasksList.filter(t => t.status !== 'Completed');
    const overdueTasks = pendingTasks.filter(t => t.dueDate && isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate()));
    
    return {
      totalContacts: contacts.length,
      activeDeals: activeDeals.length,
      pipelineValue,
      wonRevenue,
      pendingTasks: pendingTasks.length,
      overdueTasks: overdueTasks.length
    };
  }, [deals, allTasks, contacts]);

  const dashboardTasks = useMemo(() => {
    if (!allTasks) return { today: [], upcoming: [] };
    const active = allTasks.filter(t => t.status !== 'Completed');
    return {
      today: active.filter(t => t.dueDate && isToday(t.dueDate.toDate())),
      upcoming: active.filter(t => t.dueDate && !isPast(t.dueDate.toDate()) && !isToday(t.dueDate.toDate())).slice(0, 5)
    };
  }, [allTasks]);

  // --- Initial Data Load ---

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

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <span>Workspace</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-primary">Overview</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            Dashboard
          </h1>
          <p className="text-slate-500 font-medium mt-1">Strategic summary of your ecosystem workspace.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild className="rounded-xl font-bold h-10 px-5 shadow-lg shadow-primary/20">
            <Link href="/dashboard/profile">Manage Roles</Link>
          </Button>
        </div>
      </div>

      {/* Primary Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Contacts', value: stats.totalContacts, icon: Contact2, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Deals', value: stats.activeDeals, icon: LayoutGrid, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Pipeline Value', value: formatCurrency(stats.pipelineValue), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Won Revenue', value: formatCurrency(stats.wonRevenue), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pending Tasks', value: stats.pendingTasks, icon: CheckSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Overdue Tasks', value: stats.overdueTasks, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-2xl overflow-hidden bg-background ring-1 ring-slate-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={cn("p-1.5 rounded-lg", stat.bg)}>
                  <stat.icon className={cn("h-4 w-4", stat.color)} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-900 truncate">{stat.value}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Workspace Summary Column */}
        <div className="lg:col-span-2 space-y-6">
           <div className="grid gap-6 md:grid-cols-2">
              {/* Recent Deals Widget */}
              <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <LayoutGrid className="h-5 w-5 text-primary" /> Recent Deals
                    </CardTitle>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] font-bold uppercase tracking-widest text-primary">
                      <Link href="/dashboard/pipeline">View Pipeline</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {deals && deals.length > 0 ? (
                    deals.slice(0, 3).map(deal => (
                      <Link key={deal.id} href={`/dashboard/pipeline/${deal.id}`}>
                        <div className="p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 hover:ring-primary/20 transition-all flex items-center justify-between group mb-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate group-hover:text-primary transition-colors">{deal.title}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{deal.contactName}</p>
                          </div>
                          <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black bg-white border-slate-200">{deal.stage}</Badge>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase italic">No deals tracked yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Upcoming Tasks Widget */}
              <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardHeader className="pb-4">
                   <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-black flex items-center gap-2">
                        <Clock className="h-5 w-5 text-primary" /> Roadmap
                      </CardTitle>
                      <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] font-bold uppercase tracking-widest text-primary">
                        <Link href="/dashboard/tasks">View Tasks</Link>
                      </Button>
                   </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dashboardTasks.today.length > 0 ? (
                    dashboardTasks.today.map(t => (
                      <Link key={t.id} href={`/dashboard/tasks/${t.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 hover:ring-primary/20 transition-all mb-2">
                          <span className="text-xs font-bold text-slate-700 truncate pr-4">{t.title}</span>
                          <Badge variant="outline" className="h-5 px-1.5 text-[8px] font-black bg-white border-slate-200">TODAY</Badge>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase italic">No tasks for today</p>
                    </div>
                  )}
                </CardContent>
              </Card>
           </div>

           {/* Recent Contacts Feed */}
           <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardHeader className="px-8 py-8">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black flex items-center gap-3">
                      <Contact2 className="h-5 w-5 text-primary" /> Recent Contacts
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-medium">Lately added professional network members.</CardDescription>
                  </div>
                  <Button variant="outline" asChild className="rounded-xl h-10 border-slate-200 font-bold text-xs">
                    <Link href="/dashboard/contacts">All Contacts</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                <div className="grid gap-4 md:grid-cols-2">
                  {contacts && contacts.length > 0 ? (
                    contacts.slice(0, 4).map(c => (
                      <Link key={c.id} href={`/dashboard/contacts/${c.id}`}>
                        <div className="group p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-100 hover:ring-primary/20 transition-all flex items-center gap-4">
                           <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black">
                              {c.contactName.charAt(0)}
                           </div>
                           <div className="min-w-0">
                              <p className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{c.contactName}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{c.companyName || 'Private'}</p>
                           </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="col-span-2 py-12 text-center bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">
                       <p className="text-sm font-bold text-slate-400 uppercase">Start building your network</p>
                    </div>
                  )}
                </div>
              </CardContent>
           </Card>
        </div>

        {/* Side Actions Column */}
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
                <Link href="/dashboard/tasks"><CheckSquare className="h-4 w-4 text-primary" /> New Task</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/services"><Wrench className="h-4 w-4 text-primary" /> Startup Services</Link>
              </Button>
            </CardContent>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none" />
          </Card>

          <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 overflow-hidden">
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Network Reach</CardTitle>
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
                  Join builders and backers in the network.
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

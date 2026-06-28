
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
   ChevronRight,
   FileText,
   Share2,
   ShieldCheck,
   Search,
   Plus,
   AlertTriangle,
   Info,
   Lightbulb,
   Briefcase,
   Smartphone,
   CircleHelp,
   Compass
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
  orderBy,
  getCountFromServer
} from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { calculateProfileStrength, calculateTrustScore } from '@/lib/profile-utils';

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [startupViews, setStartupViews] = useState(0);

  // --- Real-time Collections Queries (Owner Scoped for Security Compliance) ---
  const tasksQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'tasks'), 
      where('ownerUid', '==', user.uid), 
      limit(5)
    );
  }, [firestore, user?.uid]);
  const { data: recentTasks } = useCollection(tasksQ);

  const notificationsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'notifications'),
      where('recipientUid', '==', user.uid),
      limit(15)
    );
  }, [firestore, user?.uid]);
  const { data: recentNotifications } = useCollection(notificationsQ);

  const invoicesQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'invoices'), 
      where('ownerUid', '==', user.uid), 
      limit(5)
    );
  }, [firestore, user?.uid]);
  const { data: recentInvoices } = useCollection(invoicesQ);

  // --- Summary Counts (Strictly Scoped Queries) ---
  const [stats, setStats] = useState({
    pendingConnections: 0,
    acceptedConnections: 0,
    unreadMessages: 0,
    investorInterests: 0,
    venturePitches: 0,
    totalContacts: 0,
    activeDeals: 0,
    pendingTasks: 0,
    totalInvoices: 0,
    connectedInvestors: 0,
    pendingInvestorConvs: 0,
    mentorMatches: 0,
    activeVenturePitches: 0
  });

  useEffect(() => {
    async function loadStats() {
      if (!firestore || !user?.uid) return;
      
      try {
        const [
          pSnap, aSnap, pitchSnap, intSnap, contactSnap, 
          dealSnap, taskSnap, invSnap, connInvSnap, pendInvSnap, mentorSnap, activePitchSnap
        ] = await Promise.all([
          getCountFromServer(query(collection(firestore, 'connections'), where('recipientUid', '==', user.uid), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(firestore, 'connections'), where('status', '==', 'accepted'), where('initiatorUid', '==', user.uid))),
          getCountFromServer(query(collection(firestore, 'venturePitches'), where('recipientUid', '==', user.uid))),
          getCountFromServer(query(collection(firestore, 'notifications'), where('recipientUid', '==', user.uid), where('type', '==', 'investor_interest'), where('read', '==', false))),
          getCountFromServer(query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid))),
          getCountFromServer(query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid))),
          getCountFromServer(query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid), where('status', '!=', 'Completed'))),
          getCountFromServer(query(collection(firestore, 'invoices'), where('ownerUid', '==', user.uid))),
          // Ecosystem Specifics
          getCountFromServer(query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'investor'), where('status', '==', 'accepted'))),
          getCountFromServer(query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'investor'), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), where('type', '==', 'mentor'), where('status', '==', 'accepted'))),
          getCountFromServer(query(collection(firestore, 'venturePitches'), where('senderUid', '==', user.uid), where('status', 'in', ['pending', 'reviewed'])))
        ]);

        setStats({
          pendingConnections: pSnap.data().count,
          acceptedConnections: aSnap.data().count,
          unreadMessages: 0, 
          investorInterests: intSnap.data().count,
          venturePitches: pitchSnap.data().count,
          totalContacts: contactSnap.data().count,
          activeDeals: dealSnap.data().count,
          pendingTasks: taskSnap.data().count,
          totalInvoices: invSnap.data().count,
          connectedInvestors: connInvSnap.data().count,
          pendingInvestorConvs: pendInvSnap.data().count,
          mentorMatches: mentorSnap.data().count,
          activeVenturePitches: activePitchSnap.data().count
        });
      } catch (e) {
        console.warn("Dashboard stats evaluation failed security check:", e);
      }
    }

    async function loadIdentity() {
      if (!firestore || !user?.uid) return;
      try {
        const [profileSnap, startupSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'startups', user.uid))
        ]);

        if (profileSnap.exists()) setProfile(profileSnap.data());
        if (startupSnap.exists()) {
          setStartup(startupSnap.data());
          const viewsSnap = await getCountFromServer(collection(firestore, 'startups', user.uid, 'views'));
          setStartupViews(viewsSnap.data().count);
        }
      } catch (e) {
        console.error("Identity Loading Error:", e);
      }
    }

    loadStats();
    loadIdentity();
  }, [firestore, user?.uid]);

  // Unified Categorized Timeline Data
  const timelineEvents = useMemo(() => {
    const events: any[] = [];
    
    recentNotifications?.forEach(n => {
      let category = 'Ecosystem';
      let icon = Globe;
      let color = 'text-primary';
      let bg = 'bg-primary/10';

      if (['connection', 'investor_interest', 'cofounder_interest'].includes(n.type)) {
        category = 'Networking';
        icon = Users;
        color = 'text-blue-600';
        bg = 'bg-blue-50';
      } else if (['venture_pitch', 'pitch'].includes(n.type)) {
        category = 'Funding';
        icon = Zap;
        color = 'text-amber-600';
        bg = 'bg-amber-50';
      } else if (n.type === 'message') {
        category = 'Networking';
        icon = MessageSquare;
      }

      events.push({
        id: n.id,
        category,
        title: n.title,
        description: n.message,
        timestamp: n.createdAt?.toDate() || new Date(),
        icon,
        color,
        bg
      });
    });

    recentTasks?.forEach(t => {
      if (t.status === 'Completed') {
        events.push({
          id: t.id,
          category: 'Workspace',
          title: 'Task Completed',
          description: t.title,
          timestamp: t.updatedAt?.toDate() || new Date(),
          icon: CheckCircle2,
          color: 'text-green-600',
          bg: 'bg-green-50'
        });
      }
    });

    recentInvoices?.forEach(i => {
      events.push({
        id: i.id,
        category: 'Billing',
        title: `Invoice ${i.status}`,
        description: `Client: ${i.contactName} - ${i.currency} ${i.amount}`,
        timestamp: i.updatedAt?.toDate() || new Date(),
        icon: FileText,
        color: i.status === 'Paid' ? 'text-emerald-600' : 'text-blue-600',
        bg: i.status === 'Paid' ? 'bg-emerald-50' : 'bg-blue-50'
      });
    });

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [recentNotifications, recentTasks, recentInvoices]);

  // Founder Growth Insights
  const recommendations = useMemo(() => {
    if (!profile) return [];
    const items = [];
    if (startup && !startup.website) items.push({ id: 'web', label: 'Complete Startup Website', href: '/dashboard/startup' });
    if (!user?.emailVerified) items.push({ id: 'email', label: 'Verify Primary Email', href: '/dashboard/profile' });
    if (startup && !startup.imageUrl) items.push({ id: 'logo', label: 'Upload Startup Logo', href: '/dashboard/startup' });
    if (startup && (!startup.shortDescription || startup.shortDescription.length < 20)) items.push({ id: 'desc', label: 'Improve Startup Description', href: '/dashboard/startup' });
    if (stats.connectedInvestors < 3) items.push({ id: 'pitch', label: 'Reach out to more Investors', href: '/investors' });
    if (profile && calculateProfileStrength(profile) < 100) items.push({ id: 'prof', label: 'Complete Founder Profile', href: '/dashboard/profile' });
    return items;
  }, [profile, startup, user, stats]);

  const strength = profile ? calculateProfileStrength(profile, startup) : 0;
  const trust = profile ? calculateTrustScore(profile, startup) : 0;
  const displayName = profile?.fullName || user?.displayName || user?.email?.split('@')[0];
  const role = profile?.primaryRole || profile?.role || 'Founder';

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[3rem] bg-slate-900 text-white p-8 md:p-12 shadow-2xl">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2 text-center md:text-left">
              <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3">
                {role} • {profile?.plan || 'Basic'} Plan
              </Badge>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
                Welcome back, <span className="text-primary">{displayName}</span>
              </h1>
              <p className="text-slate-400 font-medium text-lg">
                Your ecosystem presence is growing. Here's your mission for today.
              </p>
            </div>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <Button size="lg" className="rounded-xl font-bold h-12 gap-2" asChild>
                <Link href="/dashboard/startup"><Rocket className="h-4 w-4" /> Edit My Startup</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl font-bold h-12 gap-2 bg-white/5 border-white/10" asChild>
                <Link href={`/startups/${startup?.slug || user?.uid}`}><Eye className="h-4 w-4" /> View Public Listing</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10 rounded-3xl p-6 flex flex-col justify-between group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Profile Integrity</p>
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-3">
                 <p className="text-4xl font-black">{strength}%</p>
                 <Progress value={strength} className="h-1 bg-white/10" />
              </div>
            </Card>
            <Card className="bg-white/5 border-white/10 rounded-3xl p-6 flex flex-col justify-between group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Network Trust</p>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                 <p className="text-4xl font-black">{trust}/100</p>
                 <p className="text-[10px] font-bold text-slate-500 uppercase">Verification Level</p>
              </div>
            </Card>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
      </section>

      {/* Primary Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Intelligence & Actions */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Quick Actions Hub */}
          <section className="space-y-4">
             <div className="flex items-center gap-3 px-2">
                <Compass className="h-5 w-5 text-primary" />
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Ecosystem Quick Actions</h3>
             </div>
             <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: 'Find Investors', icon: Users, href: '/investors', bg: 'bg-blue-50', color: 'text-blue-600' },
                  { label: 'Browse Mentors', icon: GraduationCap, href: '/mentors', bg: 'bg-purple-50', color: 'text-purple-600' },
                  { label: 'New Pitch', icon: Zap, href: '/investors', bg: 'bg-amber-50', color: 'text-amber-600' },
                  { label: 'CRM Leads', icon: UserPlus, href: '/dashboard/contacts', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                  { label: 'Post Update', icon: MessageSquare, href: '/community', bg: 'bg-rose-50', color: 'text-rose-600' },
                  { label: 'Invite Peer', icon: Handshake, href: '/dashboard/billing', bg: 'bg-indigo-50', color: 'text-indigo-600' },
                ].map((action, i) => (
                  <Link key={i} href={action.href}>
                    <Card className="border-none shadow-sm hover:shadow-md hover:ring-1 hover:ring-primary/20 transition-all rounded-2xl bg-white p-4 h-full group">
                       <div className={cn("p-2 rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform", action.bg, action.color)}>
                          <action.icon className="h-5 w-5" />
                       </div>
                       <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{action.label}</p>
                    </Card>
                  </Link>
                ))}
             </div>
          </section>

          {/* Growth Recommendations */}
          {recommendations.length > 0 && (
            <Card className="border-none shadow-xl rounded-[2rem] bg-background ring-1 ring-primary/10 overflow-hidden">
               <CardHeader className="bg-primary/5 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg"><Lightbulb className="h-5 w-5 text-primary" /></div>
                    <CardTitle className="text-lg font-black">Founder Growth Insights</CardTitle>
                  </div>
               </CardHeader>
               <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {recommendations.map((rec) => (
                       <Link key={rec.id} href={rec.href}>
                         <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-sm transition-all group">
                            <CircleHelp className="h-4 w-4 text-slate-400 group-hover:text-primary" />
                            <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{rec.label}</span>
                            <ArrowRight className="h-3 w-3 ml-auto text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                         </div>
                       </Link>
                     ))}
                  </div>
               </CardContent>
            </Card>
          )}

          {/* Startup Health Snapshot */}
          <Card className="border-none shadow-xl rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
            <CardHeader className="bg-slate-50/50 px-8 py-6 border-b border-slate-100">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl"><Rocket className="h-5 w-5 text-primary" /></div>
                    <CardTitle className="text-xl font-black">Venture Overview</CardTitle>
                  </div>
                  {startup && (
                    <Badge variant="outline" className="rounded-xl px-4 py-1 font-bold bg-white text-primary border-primary/20">
                      {startup.stage} Stage
                    </Badge>
                  )}
               </div>
            </CardHeader>
            <CardContent className="p-8">
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-8">
                  {[
                    { label: 'Startup Name', value: startup?.name || 'Not Set', icon: Briefcase },
                    { label: 'Ecosystem Status', value: startup?.startupVerified ? 'Verified' : 'Pending', isBadge: true, success: startup?.startupVerified },
                    { label: 'Active Views', value: startupViews, icon: Eye },
                    { label: 'Funding Required', value: startup?.fundingNeed || 'Not Set', icon: HandCoins },
                    { label: 'Venture Pitches', value: stats.activeVenturePitches, icon: Zap },
                    { label: 'Connected Partners', value: stats.connectedInvestors, icon: ShieldCheck },
                  ].map((item, i) => (
                    <div key={i} className="space-y-2">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                       {item.isBadge ? (
                         <Badge className={cn(
                           "rounded-lg font-black text-[10px] uppercase h-7",
                           item.success ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                         )}>
                           {item.value}
                         </Badge>
                       ) : (
                         <div className="flex items-center gap-2">
                           {item.icon && <item.icon className="h-4 w-4 text-slate-300" />}
                           <p className="text-lg font-black text-slate-900">{item.value}</p>
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </CardContent>
            {!startup && (
              <CardFooter className="bg-slate-50 p-6 flex flex-col items-center justify-center text-center">
                 <Rocket className="h-10 w-10 text-slate-200 mb-2" />
                 <p className="text-sm font-bold text-slate-400">No startup data detected.</p>
                 <Button variant="link" className="text-primary font-black" asChild>
                   <Link href="/dashboard/startup">Create Your Venture Profile</Link>
                 </Button>
              </CardFooter>
            )}
          </Card>

          {/* Core Business Workspace */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Growth Workspace</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
               {[
                 { label: 'CRM Contacts', value: stats.totalContacts, icon: Contact2, href: '/dashboard/contacts', desc: 'Private network' },
                 { label: 'Sales Pipeline', value: stats.activeDeals, icon: LayoutGrid, href: '/dashboard/pipeline', desc: 'Active deal flow' },
                 { label: 'Action Items', value: stats.pendingTasks, icon: CheckSquare, href: '/dashboard/tasks', desc: 'Workspace tasks' },
                 { label: 'Billing', value: stats.totalInvoices, icon: FileText, href: '/dashboard/invoices', desc: 'Financial ledger' },
               ].map((item, i) => (
                 <Link key={i} href={item.href}>
                   <Card className="border-none shadow-sm p-5 bg-white ring-1 ring-slate-100 hover:ring-primary/40 hover:shadow-lg transition-all group h-full">
                      <div className="flex items-center justify-between mb-4">
                         <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                            <item.icon className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
                         </div>
                         <ArrowRight className="h-3 w-3 text-slate-200 group-hover:text-primary transition-all opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-3xl font-black text-slate-900">{item.value}</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight mt-1">{item.label}</p>
                      <p className="text-[9px] font-medium text-slate-400 mt-0.5">{item.desc}</p>
                   </Card>
                 </Link>
               ))}
            </div>
          </section>
        </div>

        {/* Right Column: Feed & Identity */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Account Tier Card */}
          <section className="space-y-4">
             <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
                <CardContent className="p-8 space-y-6">
                   <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                         <ShieldCheck className="h-7 w-7" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">Membership</p>
                         <p className="text-2xl font-black text-white">{profile?.plan || 'Basic'} Tier</p>
                      </div>
                   </div>
                   <div className="space-y-3">
                      <Progress value={userPlan === 'basic' ? 30 : 100} className="h-1.5 bg-white/10" />
                      <p className="text-[10px] font-bold text-slate-400">Expand your ecosystem capacity.</p>
                   </div>
                   <Button className="w-full rounded-xl font-bold h-11 shadow-lg shadow-primary/20" asChild>
                      <Link href="/dashboard/billing">Manage Rewards & Plan</Link>
                   </Button>
                </CardContent>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
             </Card>
          </section>

          {/* Categorized Ecosystem Feed */}
          <section className="space-y-4">
             <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                   <Activity className="h-5 w-5 text-primary" />
                   <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Ecosystem Activity</h3>
                </div>
                <Link href="/dashboard/notifications" className="text-[10px] font-black text-primary hover:underline uppercase tracking-tight">Expand View</Link>
             </div>
             
             <Card className="border-none shadow-xl rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
                <div className="p-4 space-y-4">
                  {timelineEvents.length > 0 ? (
                    timelineEvents.map((event, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50/50 border border-transparent hover:bg-white hover:border-slate-100 hover:shadow-sm transition-all group">
                         <div className={cn("mt-1 p-2 rounded-xl shrink-0 transition-transform group-hover:scale-110", event.bg, event.color)}>
                            <event.icon className="h-4 w-4" />
                         </div>
                         <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                               <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{event.category}</span>
                               <span className="text-[8px] font-bold text-slate-300 whitespace-nowrap">
                                  {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                               </span>
                            </div>
                            <p className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{event.title}</p>
                            <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{event.description}</p>
                         </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center space-y-4">
                       <div className="p-4 bg-slate-50 rounded-full w-fit mx-auto">
                          <Info className="h-8 w-8 text-slate-200" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-slate-900">No activity recorded</p>
                          <p className="text-xs text-slate-400 mt-1">Start by networking with the ecosystem.</p>
                       </div>
                       <Button variant="outline" size="sm" className="rounded-xl font-bold h-9" asChild>
                          <Link href="/investors">Find Investors</Link>
                       </Button>
                    </div>
                  )}
                </div>
                {timelineEvents.length > 0 && (
                   <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-center">
                      <Button variant="ghost" size="sm" className="text-[10px] font-black uppercase tracking-widest text-slate-400" asChild>
                         <Link href="/dashboard/notifications">View Comprehensive History</Link>
                      </Button>
                   </div>
                )}
             </Card>
          </section>

          {/* Quick Access to Support */}
          <Card className="border-none shadow-md rounded-3xl bg-primary/5 p-6 border border-primary/10">
             <div className="flex items-center gap-3 mb-3">
                <Users className="h-5 w-5 text-primary" />
                <h4 className="text-sm font-black text-primary uppercase tracking-widest">Founder Support</h4>
             </div>
             <p className="text-xs font-medium text-slate-600 leading-relaxed mb-6">
                Connect with our concierge team for personalized investor matching or fundraising advice.
             </p>
             <Button className="w-full rounded-xl h-10 font-bold bg-white text-primary border-none shadow-sm hover:bg-slate-50" variant="outline">
                Contact Concierge
             </Button>
          </Card>

        </div>
      </div>
    </div>
  );
}

function ArrowRight(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function Activity(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

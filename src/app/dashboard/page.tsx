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
   Info
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
      limit(10)
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

  // Unified Timeline Data
  const timelineEvents = useMemo(() => {
    const events: any[] = [];
    
    recentNotifications?.forEach(n => {
      events.push({
        id: n.id,
        type: 'ecosystem',
        title: n.title,
        description: n.message,
        timestamp: n.createdAt?.toDate() || new Date(),
        icon: Globe,
        color: 'text-primary',
        bg: 'bg-primary/10'
      });
    });

    recentTasks?.forEach(t => {
      if (t.status === 'Completed') {
        events.push({
          id: t.id,
          type: 'task',
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
        type: 'billing',
        title: `Invoice ${i.status}`,
        description: `Client: ${i.contactName} - ${i.currency} ${i.amount}`,
        timestamp: i.updatedAt?.toDate() || new Date(),
        icon: FileText,
        color: i.status === 'Paid' ? 'text-emerald-600' : 'text-blue-600',
        bg: i.status === 'Paid' ? 'bg-emerald-50' : 'bg-blue-50'
      });
    });

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);
  }, [recentNotifications, recentTasks, recentInvoices]);

  // Incomplete Startup Profile Check
  const incompleteItems = useMemo(() => {
    if (!startup) return ['No Startup Profile Found'];
    const items = [];
    if (!startup.fundingNeed) items.push('Set Funding Goal');
    if (!startup.website) items.push('Add Startup Website');
    if (!profile?.linkedinUrl) items.push('Verify LinkedIn');
    if (!startup.imageUrl && !profile?.imageUrl) items.push('Upload Logo/Photo');
    if (!startup.shortDescription) items.push('Complete Startup Description');
    return items;
  }, [startup, profile]);

  if (isUserLoading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

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
            <div className="space-y-2">
              <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3">
                {role} • {profile?.plan || 'Basic'} Plan
              </Badge>
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
                Welcome back, <span className="text-primary">{displayName}</span>
              </h1>
              <p className="text-slate-400 font-medium text-lg">
                Your ecosystem presence is growing. Here's what needs your attention today.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="rounded-xl font-bold h-12 gap-2" asChild>
                <Link href="/dashboard/startup"><Rocket className="h-4 w-4" /> Edit Startup</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-xl font-bold h-12 gap-2 bg-white/5 border-white/10" asChild>
                <Link href={`/startups/${startup?.slug || user?.uid}`}><Eye className="h-4 w-4" /> View Public Profile</Link>
              </Button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10 rounded-3xl p-6 flex flex-col justify-between group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Profile Strength</p>
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-3">
                 <p className="text-4xl font-black">{strength}%</p>
                 <Progress value={strength} className="h-1 bg-white/10" />
              </div>
            </Card>
            <Card className="bg-white/5 border-white/10 rounded-3xl p-6 flex flex-col justify-between group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Trust Score</p>
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-1">
                 <p className="text-4xl font-black">{trust}/100</p>
                 <p className="text-[10px] font-bold text-slate-500 uppercase">Verified Ecosystem Identity</p>
              </div>
            </Card>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
      </section>

      {/* Attention Card (Conditional) */}
      {incompleteItems.length > 0 && (
        <Card className="border-none shadow-xl rounded-[2rem] bg-amber-50 border-amber-100 p-6 flex items-start gap-4">
           <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
           <div className="flex-1 space-y-3">
              <h3 className="font-black text-amber-900 text-sm uppercase tracking-widest">Complete Your Ecosystem Profile</h3>
              <div className="flex flex-wrap gap-2">
                 {incompleteItems.map((item, i) => (
                    <Badge key={i} variant="outline" className="bg-white/50 border-amber-200 text-amber-700 font-bold text-[10px]">
                       {item}
                    </Badge>
                 ))}
              </div>
              <Button size="sm" variant="link" className="p-0 text-amber-700 font-black h-auto gap-1" asChild>
                 <Link href="/dashboard/startup">Finalize Now <ArrowRight className="h-3 w-3" /></Link>
              </Button>
           </div>
        </Card>
      )}

      {/* Startup Overview Card */}
      <Card className="border-none shadow-xl rounded-[3rem] bg-white ring-1 ring-slate-100 overflow-hidden">
        <CardHeader className="bg-slate-50/50 px-8 py-6 border-b border-slate-100">
           <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl"><Rocket className="h-5 w-5 text-primary" /></div>
              <CardTitle className="text-xl font-black">Startup Overview</CardTitle>
           </div>
        </CardHeader>
        <CardContent className="p-8">
           <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
              {[
                { label: 'Startup Name', value: startup?.name || 'Not Set' },
                { label: 'Current Stage', value: startup?.stage || 'Not Set' },
                { label: 'Verification', value: startup?.startupVerified ? 'Verified' : 'Pending', isBadge: true, success: startup?.startupVerified },
                { label: 'Visibility', value: startup?.status === 'active' ? 'Public' : 'Private', isBadge: true, primary: startup?.status === 'active' },
                { label: 'Profile Views', value: startupViews },
                { label: 'Funding Goal', value: startup?.fundingNeed || 'Not Set' },
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                   {item.isBadge ? (
                     <Badge className={cn(
                       "rounded-lg font-black text-[10px] uppercase",
                       item.success ? "bg-green-100 text-green-700" : 
                       item.primary ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                     )}>
                       {item.value}
                     </Badge>
                   ) : (
                     <p className="text-lg font-black text-slate-900">{item.value}</p>
                   )}
                </div>
              ))}
           </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (8 units) */}
        <div className="lg:col-span-8 space-y-12">
          
          {/* Funding & Investors Overview */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl"><HandCoins className="h-5 w-5 text-amber-600" /></div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Funding & Investors</h2>
              </div>
              <Button variant="ghost" size="sm" className="font-bold text-primary" asChild>
                <Link href="/dashboard/pitches">Venture Pipeline <ChevronRight className="h-4 w-4" /></Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
               {[
                 { label: 'Interested Investors', value: stats.investorInterests, icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50' },
                 { label: 'Connected Partners', value: stats.connectedInvestors, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                 { label: 'Pending Conversations', value: stats.pendingInvestorConvs, icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50' },
                 { label: 'Mentor Matches', value: stats.mentorMatches, icon: GraduationCap, color: 'text-purple-500', bg: 'bg-purple-50' },
                 { label: 'Active Pitches', value: stats.activeVenturePitches, icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
               ].map((stat, i) => (
                 <Card key={i} className="border-none shadow-sm p-4 text-center space-y-2 bg-white ring-1 ring-slate-100 hover:shadow-md transition-shadow">
                    <div className={cn("p-2 w-fit mx-auto rounded-xl", stat.bg)}>
                      <stat.icon className={cn("h-4 w-4", stat.color)} />
                    </div>
                    <p className="text-xl font-black text-slate-900">{stat.value || 0}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                 </Card>
               ))}
            </div>
          </section>

          {/* Business Workspace */}
          <section className="space-y-6 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-xl"><LayoutGrid className="h-5 w-5 text-slate-600" /></div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Business Workspace</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
               {[
                 { label: 'CRM Contacts', value: stats.totalContacts, icon: Contact2, href: '/dashboard/contacts' },
                 { label: 'Investor Pipeline', value: stats.activeDeals, icon: LayoutGrid, href: '/dashboard/pipeline' },
                 { label: 'Startup Tasks', value: stats.pendingTasks, icon: CheckSquare, href: '/dashboard/tasks' },
                 { label: 'Billing', value: stats.totalInvoices, icon: FileText, href: '/dashboard/invoices' },
               ].map((item, i) => (
                 <Link key={i} href={item.href}>
                   <Card className="border-none shadow-sm p-5 bg-white ring-1 ring-slate-100 hover:ring-primary/20 transition-all group">
                      <div className="flex items-center justify-between mb-3">
                         <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-primary/5 transition-colors">
                            <item.icon className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                         </div>
                         <ArrowUpRight className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                      <p className="text-2xl font-black text-slate-900">{item.value}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{item.label}</p>
                   </Card>
                 </Link>
               ))}
            </div>
          </section>

        </div>

        {/* Right Column (4 units) */}
        <div className="lg:col-span-4 space-y-12">
          
          {/* Account Status */}
          <section className="space-y-6">
             <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 px-2">Account Hub</h3>
             <Card className="border-none shadow-sm rounded-[2.5rem] bg-white ring-1 ring-slate-100 p-8 space-y-6">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <ShieldCheck className="h-6 w-6" />
                   </div>
                   <div>
                      <p className="text-lg font-black text-slate-900">{profile?.plan || 'Basic'} Plan</p>
                      <p className="text-xs font-medium text-slate-500">Active Membership</p>
                   </div>
                </div>
                <Button className="w-full rounded-xl font-bold h-11" asChild>
                   <Link href="/dashboard/billing">View Rewards & Upgrade</Link>
                </Button>
             </Card>
          </section>

          {/* Integrated Ecosystem Feed */}
          <section className="space-y-6">
             <div className="flex items-center justify-between px-2">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Ecosystem Feed</h3>
                <Link href="/dashboard/notifications" className="text-[10px] font-bold text-primary hover:underline">View All</Link>
             </div>
             <div className="space-y-4">
                {timelineEvents.length > 0 ? (
                  timelineEvents.map((event, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-white border border-slate-50 shadow-sm transition-all hover:border-primary/20 group">
                       <div className={cn("mt-1 p-2 rounded-lg shrink-0", event.bg, event.color)}>
                          <event.icon className="h-3 w-3" />
                       </div>
                       <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors">{event.title}</p>
                          <p className="text-[10px] text-slate-500 line-clamp-1">{event.description}</p>
                          <div className="flex items-center gap-1.5 mt-1 text-[9px] font-black text-slate-300 uppercase tracking-tight">
                             <Clock className="h-2 w-2" />
                             {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                          </div>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                     <Info className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                     <p className="text-[10px] font-bold text-slate-400 uppercase">No recent activity detected</p>
                  </div>
                )}
             </div>
          </section>

        </div>
      </div>
    </div>
  );
}

function ArrowUpRight(props: any) {
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
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  )
}

function GraduationCap(props: any) {
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
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  )
}

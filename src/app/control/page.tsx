
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import { collection, getCountFromServer, query, where, Timestamp, limit } from 'firebase/firestore';
import { 
  Users, 
  Rocket, 
  Server,
  Loader2,
  Activity,
  MessageSquare,
  Handshake,
  CreditCard,
  Gift,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function AdminOverviewPage() {
  const firestore = useFirestore();
  const { user: currentAdmin } = useUser();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<any>({
    users: 0,
    founders: 0,
    investors: 0,
    mentors: 0,
    startups: 0,
    posts: 0,
    proUsers: 0,
    growthUsers: 0,
    monthlyReferrals: 0,
    seoPages: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    if (!firestore || !currentAdmin) return;
    setIsLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Audited: Standardizing all admin broad queries to use filters where possible
      // to satisfy the "Rules are not filters" constraint in hardened security models.
      const [
        uCount, founders, investors, mentors, sCount, postCount, proCount, growthCount, refCount, seoCount
      ] = await Promise.all([
        getCountFromServer(query(collection(firestore, 'users'), limit(1000))),
        getCountFromServer(query(collection(firestore, 'users'), where('roles', 'array-contains', 'founder'))),
        getCountFromServer(query(collection(firestore, 'users'), where('roles', 'array-contains', 'investor'))),
        getCountFromServer(query(collection(firestore, 'users'), where('roles', 'array-contains', 'mentor'))),
        getCountFromServer(query(collection(firestore, 'startups'), where('status', '==', 'active'))),
        getCountFromServer(query(collection(firestore, 'communityPosts'), where('status', '==', 'active'))),
        getCountFromServer(query(collection(firestore, 'users'), where('plan', '==', 'pro'))),
        getCountFromServer(query(collection(firestore, 'users'), where('plan', '==', 'growth'))),
        getCountFromServer(query(collection(firestore, 'referrals'), where('createdAt', '>=', Timestamp.fromDate(monthStart)))),
        getCountFromServer(query(collection(firestore, 'seoPages'), where('status', '==', 'active')))
      ]);
      
      setStats({
        users: uCount.data().count,
        founders: founders.data().count,
        investors: investors.data().count,
        mentors: mentors.data().count,
        startups: sCount.data().count,
        posts: postCount.data().count,
        proUsers: proCount.data().count,
        growthUsers: growthCount.data().count,
        monthlyReferrals: refCount.data().count,
        seoPages: seoCount.data().count,
        // Private metrics are not queried globally
        pitches: 0,
        connections: 0,
        messages: 0,
        contacts: 0,
        deals: 0,
        tasks: 0,
        invoices: 0
      });
    } catch (error) {
      console.error("Admin stats fetch failed:", error);
      toast({ title: "Fetch Failed", description: "Global metrics restricted.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentAdmin) {
      fetchData();
    }
  }, [firestore, currentAdmin]);

  const metrics = [
    { label: 'Total Members', value: stats.users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Founders', value: stats.founders, icon: Rocket, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Investors', value: stats.investors, icon: ShieldCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Mentors', value: stats.mentors, icon: Handshake, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Active Pro', value: stats.proUsers, icon: CreditCard, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Growth Plan', value: stats.growthUsers, icon: TrendingUp, color: 'text-rose-600', bg: 'bg-rose-50' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-destructive font-bold text-sm tracking-widest uppercase">
            <Server className="h-4 w-4" /> Root Dashboard
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Ecosystem Control</h1>
          <p className="text-slate-500 font-medium">Global visibility into membership and public listings.</p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" className="rounded-xl h-11 gap-2">
            <Activity className="h-4 w-4" /> Refresh Data
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all rounded-[1.5rem] overflow-hidden group">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={cn("p-2 rounded-xl transition-colors group-hover:scale-110", stat.bg)}>
                  <stat.icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Global</div>
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin opacity-20" /> : stat.value}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 truncate">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-none shadow-sm rounded-[2rem] bg-slate-900 text-white overflow-hidden relative group">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Global Community
            </CardTitle>
            <CardDescription className="text-slate-400">Interaction density in the social layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {[
               { label: 'Community Updates', value: stats.posts, icon: MessageSquare },
               { label: 'SEO Directories', value: stats.seoPages, icon: Globe },
               { label: 'Active Startups', value: stats.startups, icon: Rocket },
               { label: 'Monthly Referrals', value: stats.monthlyReferrals, icon: Gift }
             ].map((m, i) => (
               <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <m.icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold">{m.label}</span>
                  </div>
                  <span className="text-xl font-black">{isLoading ? '...' : m.value}</span>
               </div>
             ))}
          </CardContent>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700" />
        </Card>

        <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 flex flex-col justify-center text-center p-8">
           <div className="space-y-4">
             <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                <ShieldCheck className="h-8 w-8 text-primary" />
             </div>
             <h3 className="text-xl font-black text-slate-900">Governance Policy</h3>
             <p className="text-sm text-slate-500 font-medium leading-relaxed px-4">
               Private deal flow and workspace tasks are protected by content-level ownership rules. Global stats reflect only active public records.
             </p>
             <div className="pt-4 flex justify-center gap-3">
                <Button variant="outline" className="rounded-xl font-bold" asChild>
                   <Link href="/control/users">User Directory</Link>
                </Button>
                <Button variant="outline" className="rounded-xl font-bold" asChild>
                   <Link href="/control/logs">Audit Logs</Link>
                </Button>
             </div>
           </div>
        </Card>
      </div>
    </div>
  );
}

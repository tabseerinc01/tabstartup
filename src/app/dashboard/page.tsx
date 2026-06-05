
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
   FileText
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
  
  // Real-time Collections
  const tasksQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: allTasks } = useCollection(tasksQ);

  const dealsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: rawDeals } = useCollection(dealsQ);

  const contactsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: rawContacts } = useCollection(contactsQ);

  const invoicesQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'invoices'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: rawInvoices } = useCollection(invoicesQ);

  // Financial Stats Calculation
  const stats = useMemo(() => {
    const dealsList = rawDeals || [];
    const tasksList = allTasks || [];
    const invoicesList = rawInvoices || [];
    
    const activeDeals = dealsList.filter(d => !['Won', 'Lost'].includes(d.stage));
    const paidInvoices = invoicesList.filter(i => i.status === 'Paid');
    const outstandingInvoices = invoicesList.filter(i => !['Paid', 'Cancelled', 'Draft'].includes(i.status));
    
    const pipelineValue = dealsList.reduce((acc, d) => acc + (d.value || 0), 0);
    const totalRevenue = paidInvoices.reduce((acc, i) => acc + (i.amount || 0), 0);
    const outstandingValue = outstandingInvoices.reduce((acc, i) => acc + (i.amount || 0), 0);
    
    const pendingTasks = tasksList.filter(t => t.status !== 'Completed');
    
    return {
      totalContacts: (rawContacts || []).length,
      activeDeals: activeDeals.length,
      pipelineValue,
      totalRevenue,
      outstandingValue,
      totalInvoices: invoicesList.length,
      pendingTasks: pendingTasks.length
    };
  }, [rawDeals, allTasks, rawContacts, rawInvoices]);

  useEffect(() => {
    async function checkAdmin() {
      if (!firestore || !user?.uid) return;
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
      }
    }
    checkAdmin();
  }, [firestore, user?.uid]);

  if (isUserLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <span>Workspace</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-primary">Overview</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 font-medium mt-1">Real-time summary of your startup engine.</p>
        </div>
        <Button size="sm" asChild className="rounded-xl font-bold h-10 px-5 shadow-lg shadow-primary/20">
          <Link href="/dashboard/invoices">Manage Invoices</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Contacts', value: stats.totalContacts, icon: Contact2, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Deals', value: stats.activeDeals, icon: LayoutGrid, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Pipeline', value: formatCurrency(stats.pipelineValue), icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), icon: HandCoins, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Invoices', value: stats.totalInvoices, icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Outstanding', value: formatCurrency(stats.outstandingValue), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
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
        <div className="lg:col-span-2 space-y-6">
           <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-black flex items-center gap-2">
                      <LayoutGrid className="h-5 w-5 text-primary" /> Active Deals
                    </CardTitle>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] font-bold uppercase tracking-widest text-primary">
                      <Link href="/dashboard/pipeline">Pipeline</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rawDeals && rawDeals.length > 0 ? (
                    rawDeals.slice(0, 3).map(deal => (
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
                       <p className="text-[10px] font-bold text-slate-400 uppercase italic">No active deals</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardHeader className="pb-4">
                   <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-black flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" /> Recent Invoices
                      </CardTitle>
                      <Button variant="ghost" size="sm" asChild className="h-8 text-[10px] font-bold uppercase tracking-widest text-primary">
                        <Link href="/dashboard/invoices">All Invoices</Link>
                      </Button>
                   </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rawInvoices && rawInvoices.length > 0 ? (
                    rawInvoices.slice(0, 3).map(inv => (
                      <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 hover:ring-primary/20 transition-all mb-2">
                          <div className="min-w-0">
                             <span className="text-xs font-bold text-slate-700 truncate">{inv.title}</span>
                             <p className="text-[8px] font-black text-primary uppercase">#{inv.invoiceNumber}</p>
                          </div>
                          <Badge variant="outline" className={cn(
                            "h-5 px-1.5 text-[8px] font-black border-slate-200",
                            inv.status === 'Paid' ? "bg-green-50 text-green-700" : "bg-white"
                          )}>{inv.status}</Badge>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="py-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase italic">No invoices issued</p>
                    </div>
                  )}
                </CardContent>
              </Card>
           </div>

           <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
              <CardHeader className="px-8 py-8">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black flex items-center gap-3">
                      <Contact2 className="h-5 w-5 text-primary" /> Network
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-medium">Lately added professional network members.</CardDescription>
                  </div>
                  <Button variant="outline" asChild className="rounded-xl h-10 border-slate-200 font-bold text-xs">
                    <Link href="/dashboard/contacts">Contacts</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-8 pb-10">
                <div className="grid gap-4 md:grid-cols-2">
                  {rawContacts && rawContacts.length > 0 ? (
                    rawContacts.slice(0, 4).map(c => (
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
                       <p className="text-sm font-bold text-slate-400 uppercase">Empty Workspace</p>
                    </div>
                  )}
                </div>
              </CardContent>
           </Card>
        </div>

        <div className="space-y-6">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden group relative">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 mb-2">
                 <div className="h-1 w-6 bg-primary rounded-full" />
                 <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Quick Actions</span>
              </div>
              <CardTitle className="text-lg font-black">Workspace Hub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-8">
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/dashboard/invoices"><FileText className="h-4 w-4 text-primary" /> Create Invoice</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/dashboard/tasks"><CheckSquare className="h-4 w-4 text-primary" /> Add Task</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white font-bold transition-all border-none" asChild>
                <Link href="/dashboard/pipeline"><LayoutGrid className="h-4 w-4 text-primary" /> Sales Pipeline</Link>
              </Button>
            </CardContent>
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none" />
          </Card>

          <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 overflow-hidden">
             <CardHeader className="pb-2">
               <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Roadmap Stats</CardTitle>
             </CardHeader>
             <CardContent className="space-y-6 pb-6">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                   <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">Tasks Pending</span>
                      <span className="text-lg font-black text-slate-900">{stats.pendingTasks}</span>
                   </div>
                   <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: '45%' }} />
                   </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">
                  Keep your workspace active to maintain growth velocity.
                </p>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

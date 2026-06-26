'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { collection, getDocs, updateDoc, doc, serverTimestamp, query, where, getCountFromServer } from 'firebase/firestore';
import { CreditCard, Loader2, Search, CheckCircle2, ShieldCheck, TrendingUp, Users, Zap, MoreVertical, Crown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from "@/components/ui/input";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { logAdminAction } from '@/lib/audit-logs';

export default function SubscriptionManagementPage() {
  const { user: admin } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({ basic: 0, pro: 0, growth: 0 });

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const [uSnap, bCount, pCount, gCount] = await Promise.all([
        getDocs(query(collection(firestore, 'users'), where('plan', 'in', ['pro', 'growth']))),
        getCountFromServer(query(collection(firestore, 'users'), where('plan', '==', 'basic'))),
        getCountFromServer(query(collection(firestore, 'users'), where('plan', '==', 'pro'))),
        getCountFromServer(query(collection(firestore, 'users'), where('plan', '==', 'growth')))
      ]);
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStats({
        basic: bCount.data().count,
        pro: pCount.data().count,
        growth: gCount.data().count
      });
    } catch (e) {
      toast({ title: "Fetch Failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const handleGrantPlan = async (userId: string, plan: 'pro' | 'growth') => {
    if (!firestore || !admin) return;
    try {
      await updateDoc(doc(firestore, 'users', userId), {
        plan,
        subscriptionStatus: 'active',
        updatedAt: serverTimestamp()
      });
      await logAdminAction(firestore, admin.uid, plan === 'pro' ? 'grant_pro' : 'grant_growth', userId);
      toast({ title: `${plan.toUpperCase()} Granted Successfully` });
      fetchData();
    } catch (e) {
      toast({ title: "Action Failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-primary" /> Subscription Registry
          </h1>
          <p className="text-slate-500 font-medium">Monitor active tiers and manually adjust membership plans.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Basic Users', value: stats.basic, icon: Users, color: 'text-slate-500', bg: 'bg-slate-50' },
          { label: 'Pro Members', value: stats.pro, icon: Zap, color: 'text-primary', bg: 'bg-primary/5' },
          { label: 'Growth Partners', value: stats.growth, icon: Crown, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm rounded-[2rem] overflow-hidden">
            <CardContent className="p-6 flex items-center justify-between">
               <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
                  <p className="text-3xl font-black text-slate-900">{isLoading ? '...' : s.value}</p>
               </div>
               <div className={cn("p-4 rounded-2xl", s.bg)}>
                  <s.icon className={cn("h-6 w-6", s.color)} />
               </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-none shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
             <CardTitle className="text-xl font-black">Premium Members</CardTitle>
             <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search premium users..." 
                  className="pl-10 h-11 rounded-xl bg-slate-50 border-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Member</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Current Tier</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right pr-8">Plan Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-32 text-center text-slate-400">No premium members found.</TableCell></TableRow>
              ) : (
                users.filter(u => u.fullName?.toLowerCase().includes(searchTerm.toLowerCase())).map((u) => (
                  <TableRow key={u.id} className="group border-b border-slate-50 hover:bg-slate-50/30">
                    <TableCell className="pl-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary">{u.fullName?.charAt(0)}</div>
                        <div>
                          <span className="font-bold text-slate-900 block truncate">{u.fullName}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-black">{u.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("rounded-lg text-[9px] font-black uppercase border-none", u.plan === 'growth' ? "bg-amber-50 text-amber-600" : "bg-primary/5 text-primary")}>
                         {u.plan} Tier
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                       <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-[9px] font-black uppercase" onClick={() => handleGrantPlan(u.id, 'pro')} disabled={u.plan === 'pro'}>Grant Pro</Button>
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-[9px] font-black uppercase" onClick={() => handleGrantPlan(u.id, 'growth')} disabled={u.plan === 'growth'}>Grant Growth</Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

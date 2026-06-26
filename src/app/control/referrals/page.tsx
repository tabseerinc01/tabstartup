'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { Gift, Users, Loader2, ShieldCheck, CheckCircle2, TrendingUp, Clock, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

export default function ReferralManagementPage() {
  const firestore = useFirestore();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, qualified: 0, rewarded: 0 });

  useEffect(() => {
    async function loadData() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const q = query(collection(firestore, 'referrals'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setReferrals(list);

        setStats({
          total: list.length,
          qualified: list.filter(r => r.referredProfileCompleted).length,
          rewarded: list.filter(r => r.rewardGranted).length
        });
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <Gift className="h-8 w-8 text-primary" /> Referral Network
          </h1>
          <p className="text-slate-500 font-medium">Audit qualified referrals and track bonus resource distribution.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Total Referrals', value: stats.total, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Qualified (Profile)', value: stats.qualified, icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Rewards Granted', value: stats.rewarded, icon: CheckCircle2, color: 'text-primary', bg: 'bg-primary/10' },
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
           <CardTitle className="text-xl font-black flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> Transmission History
           </CardTitle>
           <CardDescription>Review the latest referral cycles and qualification status.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-none hover:bg-transparent">
                <TableHead className="pl-8 h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Date</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Referrer ID</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest">Profile Complete</TableHead>
                <TableHead className="h-12 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right pr-8">Reward Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : referrals.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-32 text-center text-slate-400">No referral history found.</TableCell></TableRow>
              ) : (
                referrals.map((r) => (
                  <TableRow key={r.id} className="group border-b border-slate-50 hover:bg-slate-50/30">
                    <TableCell className="pl-8 py-5">
                       <span className="text-xs font-bold text-slate-500">
                          {r.createdAt?.toDate ? format(r.createdAt.toDate(), 'MMM d, p') : 'Recent'}
                       </span>
                    </TableCell>
                    <TableCell>
                       <code className="text-[10px] font-mono text-primary bg-primary/5 px-2 py-0.5 rounded">{r.referrerUid?.slice(0, 12)}...</code>
                    </TableCell>
                    <TableCell>
                       <Badge variant="secondary" className={cn("rounded-lg text-[9px] font-black uppercase", r.referredProfileCompleted ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400")}>
                          {r.referredProfileCompleted ? 'QUALIFIED' : 'PENDING'}
                       </Badge>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                       <Badge variant="outline" className={cn("rounded-lg text-[9px] font-black uppercase", r.rewardGranted ? "border-green-200 text-green-700" : "border-slate-200 text-slate-400")}>
                          {r.rewardGranted ? 'Bonus Applied' : 'No Bonus'}
                       </Badge>
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

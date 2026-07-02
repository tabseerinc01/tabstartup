
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Briefcase, 
  Loader2, 
  Rocket, 
  ShieldCheck, 
  ArrowRight, 
  TrendingUp, 
  Clock, 
  Calendar,
  MessageSquare,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

export default function MyDealsPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [startups, setStartups] = useState<Record<string, any>>({});

  const dealsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    
    // Multi-role logic for querying deals
    const role = user.displayName?.includes('Investor') ? 'investorUid' : 'founderUid';
    // We try both as we don't strictly know role from token alone without extra lookup
    // Simple approach for MVP: query based on both possibilities if role isn't clear,
    // or better: since we have profile data, we use that.
    return query(
      collection(firestore, 'dealRooms'),
      where(pathnameIncludes('investor') ? 'investorUid' : 'founderUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  // Robust path-agnostic role detection
  const dealsQueryFinal = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'dealRooms'),
      where('participants', 'array-contains', user.uid)
    );
  }, [firestore, user?.uid]);
  
  // Correction: DealRoom has explicit founderUid and investorUid. 
  // We'll use two separate queries and merge, or use one if we can identify role.
  const [isInvestor, setIsInvestor] = useState(false);
  useEffect(() => {
    async function checkRole() {
      if(!user?.uid || !firestore) return;
      const snap = await getDoc(doc(firestore, 'users', user.uid));
      if(snap.exists()) {
        const roles = snap.data().roles || [snap.data().role];
        setIsInvestor(roles.includes('investor'));
      }
    }
    checkRole();
  }, [user?.uid, firestore]);

  const q = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'dealRooms'),
      where(isInvestor ? 'investorUid' : 'founderUid', '==', user.uid)
    );
  }, [firestore, user?.uid, isInvestor]);

  const { data: deals, isLoading } = useCollection(q);

  useEffect(() => {
    async function hydrate() {
      if (!firestore || !deals) return;
      const newProfiles = { ...profiles };
      const newStartups = { ...startups };
      
      for (const d of deals) {
        const otherUid = isInvestor ? d.founderUid : d.investorUid;
        if (!newProfiles[otherUid]) {
          const snap = await getDoc(doc(firestore, 'users', otherUid));
          if (snap.exists()) newProfiles[otherUid] = snap.data();
        }
        if (!newStartups[d.startupId]) {
          const snap = await getDoc(doc(firestore, 'startups', d.startupId));
          if (snap.exists()) newStartups[d.startupId] = snap.data();
        }
      }
      setProfiles(newProfiles);
      setStartups(newStartups);
    }
    hydrate();
  }, [deals, firestore, isInvestor]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4">Syncing Deal Flow...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Briefcase className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Funding Deal Rooms</h1>
          <p className="text-sm font-medium text-slate-500">Secure workspaces for investment negotiations and due diligence.</p>
        </div>
      </div>

      <div className="grid gap-6">
        {deals && deals.length > 0 ? (
          deals.map((deal) => {
            const otherUid = isInvestor ? deal.founderUid : deal.investorUid;
            const otherUser = profiles[otherUid];
            const startup = startups[deal.startupId];
            const name = otherUser?.fullName || "Ecosystem Partner";
            const startupName = startup?.name || "Target Venture";
            const lastUpdate = deal.updatedAt?.toDate() || new Date();

            return (
              <Link key={deal.id} href={`/dashboard/deals/${deal.id}`}>
                <Card className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center">
                      <div className="p-8 flex items-center gap-6 flex-1 min-w-0">
                         <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary shrink-0 border border-primary/10">
                            <Rocket className="h-8 w-8" />
                         </div>
                         <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 mb-1">
                               <h3 className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{startupName}</h3>
                               <Badge className={cn(
                                 "text-[8px] font-black uppercase px-2 h-4 border-none",
                                 deal.status === 'Closed' ? "bg-green-500 text-white" : "bg-primary/10 text-primary"
                               )}>
                                 {deal.status}
                               </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-tight">
                               <span className="flex items-center gap-1.5">
                                 {isInvestor ? <Users className="h-3.5 w-3.5 text-primary" /> : <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />}
                                 {name}
                               </span>
                               <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}</span>
                            </div>
                         </div>
                      </div>

                      <div className="p-8 md:border-l border-slate-50 bg-slate-50/30 flex items-center justify-between gap-4 md:w-48">
                         <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">Enter Room</span>
                         <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        ) : (
          <div className="py-32 text-center space-y-6 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
             <Briefcase className="h-16 w-16 text-slate-100 mx-auto" />
             <div className="space-y-2">
                <p className="text-xl font-black text-slate-900">No active deal rooms</p>
                <p className="text-slate-500 font-medium max-w-xs mx-auto">
                   Deal rooms are automatically created when connection requests between founders and investors are accepted.
                </p>
             </div>
             <Button asChild variant="outline" className="rounded-full">
                <Link href="/investors">Find Capital Partners</Link>
             </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function pathnameIncludes(str: string) {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.includes(str);
}


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
  Users,
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
import type { RelationshipIdentity } from '@/lib/relationship-identity';

export default function MyDealsPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [identityState, setIdentityState] = useState<{
    ownerUid: string;
    dealKey: string;
    profiles: Record<string, RelationshipIdentity>;
  }>({
    ownerUid: '',
    dealKey: '',
    profiles: {},
  });
  const [startupState, setStartupState] = useState<{
    ownerUid: string;
    dealKey: string;
    data: Record<string, any>;
  }>({
    ownerUid: '',
    dealKey: '',
    data: {},
  });

  const founderQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'dealRooms'),
      where('founderUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const investorQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'dealRooms'),
      where('investorUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const { data: founderDeals, isLoading: founderLoading } =
    useCollection(founderQuery);

  const { data: investorDeals, isLoading: investorLoading } =
    useCollection(investorQuery);

  const deals = useMemo(() => {
    const unique = new Map<string, any>();

    for (const deal of [...(founderDeals || []), ...(investorDeals || [])]) {
      unique.set(deal.id, deal);
    }

    return Array.from(unique.values());
  }, [founderDeals, investorDeals]);

  const isLoading = founderLoading || investorLoading;

  const dealKey = useMemo(
    () => JSON.stringify(
      deals.map(d => [
        d.id,
        d.founderUid,
        d.investorUid,
        d.startupId,
        d.connectionId ?? null,
      ]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    ),
    [deals]
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const ownerUid = user?.uid ?? '';

    setIdentityState({ ownerUid: '', dealKey: '', profiles: {} });
    setStartupState({ ownerUid: '', dealKey: '', data: {} });

    async function hydrate() {
      if (!firestore || !user || isLoading || !deals.length) return;

      const newProfiles: Record<string, RelationshipIdentity> = {};
      const newStartups: Record<string, any> = {};

      try {
        const token = await user.getIdToken();
        if (cancelled) return;

        for (let i = 0; i < deals.length; i += 5) {
          if (cancelled) return;
          const batch = deals.slice(i, i + 5);
          try {
            const response = await fetch('/api/profile/relationship-identities', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                contexts: batch.map(d => ({
                  contextType: 'dealRoom',
                  contextId: d.id,
                })),
              }),
              cache: 'no-store',
              signal: controller.signal,
            });

            if (cancelled) return;
            if (response.status === 401 || response.status === 403) return;
            if (!response.ok) continue;

            const payload = await response.json();
            if (!Array.isArray(payload.results)) continue;

            for (const result of payload.results) {
              const deal = batch.find(d =>
                d.id === result?.context?.contextId &&
                result?.context?.contextType === 'dealRoom'
              );
              if (
                !deal ||
                result.status !== 'ok' ||
                !Array.isArray(result.participants) ||
                !deal.founderUid ||
                !deal.investorUid ||
                deal.founderUid === deal.investorUid ||
                (deal.founderUid !== ownerUid &&
                  deal.investorUid !== ownerUid)
              ) continue;

              const otherUid = deal.founderUid === ownerUid
                ? deal.investorUid : deal.founderUid;

              const identity = result.participants.find(
                (p: RelationshipIdentity) =>
                  p.uid === otherUid &&
                  p.isPubliclyAvailable === true &&
                  p.availability === 'published'
              );
              if (identity) newProfiles[deal.id] = identity;
            }
          } catch (error) {
            if (cancelled || controller.signal.aborted) return;
            console.error('Deal identity batch failed:', error);
          }
        }

        for (const deal of deals) {
          if (cancelled) return;
          if (!deal.startupId || newStartups[deal.startupId]) continue;
          try {
            const snap = await getDoc(
              doc(firestore, 'startups', deal.startupId)
            );
            if (snap.exists()) newStartups[deal.startupId] = snap.data();
          } catch {
            // Unavailable venture details remain hidden.
          }
        }

        if (!cancelled) {
          setIdentityState({ ownerUid, dealKey, profiles: newProfiles });
          setStartupState({ ownerUid, dealKey, data: newStartups });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          console.error('Deal Room identity loading failed:', error);
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deals, dealKey, firestore, user, isLoading]);

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
            const otherUid = deal.founderUid === user?.uid ? deal.investorUid : deal.founderUid;
            const otherUser =
              !isLoading &&
              identityState.ownerUid === user?.uid &&
              identityState.dealKey === dealKey
                ? identityState.profiles[deal.id]
                : undefined;
            const startup =
              !isLoading &&
              startupState.ownerUid === user?.uid &&
              startupState.dealKey === dealKey
                ? startupState.data[deal.startupId]
                : undefined;
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
                                 {deal.investorUid === user?.uid ? <Users className="h-3.5 w-3.5 text-primary" /> : <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />}
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

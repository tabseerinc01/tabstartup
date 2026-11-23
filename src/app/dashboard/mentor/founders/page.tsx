
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDoc, doc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, MessageSquare, Rocket, MapPin, ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';

export default function ActiveFoundersPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  // Phase 2: Querying activeMentorships instead of connections
  const mentorshipsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'activeMentorships'),
      where('mentorUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const { data: mentorships, isLoading } = useCollection(mentorshipsQuery);
  const [profiles, setProfiles] = useState<Record<string, {
    fullName: string | null;
    imageUrl: string | null;
  }>>({});
  const [startups, setStartups] = useState<Record<string, any>>({});

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setProfiles({});
    setStartups({});

    if (!firestore || !user || !mentorships) {
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    async function loadMetadata() {
      const nextProfiles: Record<string, {
        fullName: string | null;
        imageUrl: string | null;
      }> = {};
      const nextStartups: Record<string, any> = {};

      const validMentorships = (mentorships ?? []).filter(
        m => m.mentorUid === user!.uid && m.id && m.founderUid
      );

      for (let i = 0; i < validMentorships.length; i += 5) {
        if (cancelled) return;

        const batch = validMentorships.slice(i, i + 5);

        try {
          const token = await user!.getIdToken();
          if (cancelled) return;

          const response = await fetch('/api/profile/relationship-identities', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contexts: batch.map(m => ({
                contextType: 'activeMentorship',
                contextId: m.id,
              })),
            }),
            cache: 'no-store',
            signal: controller.signal,
          });

          if (response.ok && !cancelled) {
            const payload = await response.json();

            for (const m of batch) {
              const result = Array.isArray(payload.results)
                ? payload.results.find((r: any) =>
                    r?.context?.contextType === 'activeMentorship' &&
                    r?.context?.contextId === m.id &&
                    r?.status === 'ok'
                  )
                : null;

              const founder = result?.participants?.find(
                (p: import('@/lib/relationship-identity').RelationshipIdentity) =>
                  p.uid === m.founderUid &&
                  p.isPubliclyAvailable === true &&
                  p.availability === 'published'
              );

              if (founder) {
                nextProfiles[m.founderUid] = {
                  fullName: founder.fullName,
                  imageUrl: founder.imageUrl,
                };
              }
            }
          }
        } catch (error) {
          if (!cancelled && !controller.signal.aborted) {
            console.error('Founder identity loading failed:', error);
          }
        }
      }

      for (const m of validMentorships) {
        if (cancelled) return;
        if (!m.startupId || nextStartups[m.startupId]) continue;

        try {
          const snap = await getDoc(doc(firestore!, 'startups', m.startupId));
          if (!cancelled && snap.exists()) {
            nextStartups[m.startupId] = snap.data();
          }
        } catch {
          // Startup details unavailable.
        }
      }

      if (!cancelled) {
        setProfiles(nextProfiles);
        setStartups(nextStartups);
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [firestore, user, mentorships]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
          <Users className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Active Founders</h1>
          <p className="text-sm font-medium text-slate-500">Founders you are currently guiding in the ecosystem.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {mentorships && mentorships.length > 0 ? (
          mentorships.map((m) => {
            const founder = profiles[m.founderUid];
            const startup = startups[m.startupId];
            const name = founder?.fullName || "Founder";
            const startedAt = m.startedAt?.toDate ? m.startedAt.toDate() : new Date();

            return (
              <Card key={m.id} className="group border-none shadow-sm hover:shadow-xl transition-all rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardContent className="p-8">
                  <div className="flex items-start gap-5">
                    <Avatar className="h-16 w-16 rounded-2xl border-4 border-slate-50 shadow-md">
                      <AvatarImage src={founder?.imageUrl ?? undefined} className="object-cover" />
                      <AvatarFallback className="font-black bg-primary/5 text-primary">{name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{name}</h3>
                        <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary bg-primary/5">{m.status}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><Rocket className="h-3 w-3 text-primary/50" /> {startup?.name || 'Venture'}</span>
                        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Since {startedAt.toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-50">
                        <Button className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20 gap-2" asChild>
                           <Link href={`/dashboard/mentorship/active/${m.id}`}>
                              View Workspace <ArrowRight className="h-4 w-4" />
                           </Link>
                        </Button>
                        <Button variant="ghost" className="rounded-xl h-10 px-4 font-bold text-slate-400" asChild>
                           <Link href={`/dashboard/messages?startWith=${m.founderUid}`}>
                              <MessageSquare className="h-4 w-4" />
                           </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
            <CardContent className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
                <Users className="h-16 w-16 text-slate-200" />
              </div>
              <p className="text-xl font-black text-slate-900">No active mentorships</p>
              <p className="text-slate-500 font-medium max-w-sm mx-auto">Review mentorship requests to start supporting founders.</p>
              <Button asChild className="rounded-full px-8 h-12 font-bold">
                <Link href="/dashboard/mentorship/requests">Review Requests</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDoc, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, MessageSquare, Rocket, MapPin, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function ActiveFoundersPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const activeFoundersQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'connections'),
      where('recipientUid', '==', user.uid),
      where('type', '==', 'mentor'),
      where('status', '==', 'accepted')
    );
  }, [firestore, user?.uid]);

  const { data: connections, isLoading } = useCollection(activeFoundersQuery);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || !connections) return;
      const uids = connections.map(c => c.initiatorUid);
      const newProfiles = { ...profiles };
      for (const uid of uids) {
        if (!newProfiles[uid]) {
          const snap = await getDoc(doc(firestore, 'users', uid));
          if (snap.exists()) newProfiles[uid] = snap.data();
        }
      }
      setProfiles(newProfiles);
    }
    loadProfiles();
  }, [firestore, connections]);

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
        {connections && connections.length > 0 ? (
          connections.map((conn) => {
            const founder = profiles[conn.initiatorUid];
            const name = founder?.fullName || "Founder";
            return (
              <Card key={conn.id} className="group border-none shadow-sm hover:shadow-xl transition-all rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardContent className="p-8">
                  <div className="flex items-start gap-5">
                    <Avatar className="h-16 w-16 rounded-2xl border-4 border-slate-50 shadow-md">
                      <AvatarImage src={founder?.imageUrl} className="object-cover" />
                      <AvatarFallback className="font-black bg-primary/5 text-primary">{name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{name}</h3>
                      <p className="text-sm font-bold text-primary truncate mt-1 uppercase tracking-tight">{founder?.headline || "Building Venture"}</p>
                      
                      <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {founder?.location || 'Remote'}</span>
                        <span className="flex items-center gap-1.5"><Rocket className="h-3 w-3" /> Early Stage</span>
                      </div>

                      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-50">
                        <Button className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20 gap-2" asChild>
                           <Link href={`/dashboard/messages?startWith=${conn.initiatorUid}`}>
                              <MessageSquare className="h-4 w-4" /> Message
                           </Link>
                        </Button>
                        <Button variant="ghost" className="rounded-xl h-10 font-bold text-slate-400" asChild>
                           <Link href={`/founders/${conn.initiatorUid}`}>Full Profile</Link>
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
                <Link href="/dashboard/connections">Review Requests</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

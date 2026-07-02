
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, getDoc, doc } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, GraduationCap, MessageSquare, Briefcase, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function MyMentorsPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const mentorshipsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'activeMentorships'),
      where('founderUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const { data: mentorships, isLoading } = useCollection(mentorshipsQuery);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    async function loadMetadata() {
      if (!firestore || !mentorships) return;
      const newProfiles = { ...profiles };
      
      for (const m of mentorships) {
        if (!newProfiles[m.mentorUid]) {
          const uSnap = await getDoc(doc(firestore, 'users', m.mentorUid));
          if (uSnap.exists()) newProfiles[m.mentorUid] = uSnap.data();
        }
      }
      setProfiles(newProfiles);
    }
    loadMetadata();
  }, [firestore, mentorships]);

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
          <GraduationCap className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">My Mentors</h1>
          <p className="text-sm font-medium text-slate-500">Expert advisors supporting your venture journey.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {mentorships && mentorships.length > 0 ? (
          mentorships.map((m) => {
            const mentor = profiles[m.mentorUid];
            const name = mentor?.fullName || "Mentor";
            const startedAt = m.startedAt?.toDate ? m.startedAt.toDate() : new Date();

            return (
              <Card key={m.id} className="group border-none shadow-sm hover:shadow-xl transition-all rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
                <CardContent className="p-8">
                  <div className="flex items-start gap-5">
                    <Avatar className="h-16 w-16 rounded-2xl border-4 border-slate-50 shadow-md">
                      <AvatarImage src={mentor?.imageUrl} className="object-cover" />
                      <AvatarFallback className="font-black bg-primary/5 text-primary">{name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{name}</h3>
                        <Badge variant="outline" className="text-[10px] font-bold border-primary/20 text-primary bg-primary/5">{m.status}</Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><Briefcase className="h-3 w-3 text-primary/50" /> {mentor?.headline || 'Expert Advisor'}</span>
                        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Since {startedAt.toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-slate-50">
                        <Button className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20 gap-2" asChild>
                           <Link href={`/dashboard/mentorship/active/${m.id}`}>
                              Workspace <ArrowRight className="h-4 w-4" />
                           </Link>
                        </Button>
                        <Button variant="ghost" className="rounded-xl h-10 px-4 font-bold text-slate-400" asChild>
                           <Link href={`/dashboard/messages?startWith=${m.mentorUid}`}>
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
                <GraduationCap className="h-16 w-16 text-slate-200" />
              </div>
              <p className="text-xl font-black text-slate-900">No active advisors yet</p>
              <p className="text-slate-500 font-medium max-w-sm mx-auto">Request mentorship from experienced operators in our directory.</p>
              <Button asChild className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20">
                <Link href="/mentors">Browse Mentors</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

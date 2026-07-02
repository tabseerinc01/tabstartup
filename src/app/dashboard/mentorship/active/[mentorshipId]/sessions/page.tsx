
'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useCollection, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { 
  Calendar, 
  Loader2, 
  ArrowLeft, 
  Clock, 
  MapPin, 
  ExternalLink, 
  CheckCircle2, 
  ChevronRight,
  Plus,
  Rocket
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CreateSessionDialog } from '@/components/dashboard/mentorship/create-session-dialog';

export default function MentorshipSessionsListPage() {
  const { mentorshipId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const mentorshipRef = useMemoFirebase(() => {
    if (!firestore || !mentorshipId) return null;
    return doc(firestore, 'activeMentorships', mentorshipId as string);
  }, [firestore, mentorshipId]);
  const { data: mentorship, isLoading: isMLoading } = useDoc(mentorshipRef);

  const sessionsQ = useMemoFirebase(() => {
    if (!firestore || !mentorshipId) return null;
    return query(
      collection(firestore, 'mentorshipSessions'),
      where('mentorshipId', '==', mentorshipId),
      orderBy('scheduledAt', 'desc')
    );
  }, [firestore, mentorshipId]);

  const { data: sessions, isLoading: isSessionsLoading } = useCollection(sessionsQ);

  const isMentor = user?.uid === mentorship?.mentorUid;

  const upcoming = useMemo(() => 
    (sessions || []).filter(s => s.status === 'Scheduled' || s.status === 'In Progress')
  , [sessions]);

  const past = useMemo(() => 
    (sessions || []).filter(s => s.status === 'Completed' || s.status === 'Cancelled')
  , [sessions]);

  if (isMLoading || isSessionsLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4">Syncing Schedule...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2 -ml-4 hover:bg-slate-100 rounded-full font-bold text-slate-500 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Workspace
          </Button>
          <div className="flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl">
                <Calendar className="h-7 w-7" />
             </div>
             <h1 className="text-4xl font-black tracking-tight text-slate-900">Guidance Sessions</h1>
          </div>
        </div>

        {isMentor && (
          <CreateSessionDialog mentorship={mentorship} />
        )}
      </div>

      <Tabs defaultValue="upcoming" className="space-y-8">
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-fit h-auto flex gap-1">
          <TabsTrigger value="upcoming" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Upcoming {upcoming.length > 0 && <Badge variant="secondary" className="ml-2 h-4 px-1">{upcoming.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="past" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Past Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <div className="grid gap-6">
            {upcoming.length > 0 ? (
              upcoming.map(session => (
                <SessionRow key={session.id} session={session} mentorshipId={mentorshipId as string} />
              ))
            ) : (
              <Card className="border-2 border-dashed rounded-[3rem] bg-slate-50/50 py-32 text-center">
                 <div className="p-6 bg-white rounded-full w-fit mx-auto mb-6 shadow-sm">
                    <Calendar className="h-12 w-12 text-slate-200" />
                 </div>
                 <p className="text-xl font-bold text-slate-900">No upcoming meetings</p>
                 <p className="text-slate-500 font-medium max-w-sm mx-auto mt-2">
                   {isMentor ? "Initialize growth by scheduling your next deep-dive session." : "Waiting for your mentor to schedule the next deep-dive."}
                 </p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="past">
          <div className="grid gap-6">
            {past.length > 0 ? (
              past.map(session => (
                <SessionRow key={session.id} session={session} mentorshipId={mentorshipId as string} />
              ))
            ) : (
              <Card className="border-2 border-dashed rounded-[3rem] bg-slate-50/50 py-32 text-center">
                 <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">No session history found</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionRow({ session, mentorshipId }: { session: any, mentorshipId: string }) {
  const scheduledAt = session.scheduledAt?.toDate() || new Date();
  
  return (
    <Link href={`/dashboard/mentorship/active/${mentorshipId}/sessions/${session.id}`}>
      <Card className="group border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
        <CardContent className="p-0">
           <div className="flex flex-col md:flex-row md:items-center">
              <div className="p-8 flex items-center gap-6 flex-1 min-w-0">
                 <div className={cn(
                   "h-16 w-16 rounded-2xl flex flex-col items-center justify-center shrink-0 border",
                   session.status === 'Scheduled' ? "bg-primary/5 border-primary/10 text-primary" : "bg-slate-50 border-slate-100 text-slate-400"
                 )}>
                    <span className="text-[10px] font-black uppercase tracking-tighter">{format(scheduledAt, 'MMM')}</span>
                    <span className="text-2xl font-black leading-none">{format(scheduledAt, 'dd')}</span>
                 </div>
                 <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                       <h3 className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors truncate">{session.title}</h3>
                       <Badge className={cn(
                         "text-[8px] font-black uppercase tracking-widest border-none px-2 h-4",
                         session.status === 'Scheduled' ? "bg-primary/10 text-primary" :
                         session.status === 'Completed' ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"
                       )}>
                         {session.status}
                       </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400 uppercase tracking-tight">
                       <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {format(scheduledAt, 'p')} ({session.estimatedDuration}m)</span>
                       <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {session.meetingType}</span>
                    </div>
                 </div>
              </div>

              <div className="p-8 md:border-l border-slate-50 bg-slate-50/30 flex items-center justify-between gap-4 md:w-48">
                 <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">Details</span>
                 <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-colors" />
              </div>
           </div>
        </CardContent>
      </Card>
    </Link>
  );
}

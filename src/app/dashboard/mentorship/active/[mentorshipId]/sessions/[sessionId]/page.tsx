
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useDoc, useMemoFirebase, useCollection, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  doc, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  Loader2, 
  Calendar, 
  ArrowLeft, 
  Clock, 
  MapPin, 
  ExternalLink, 
  CheckCircle2, 
  Plus, 
  History,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  Video,
  Gavel,
  CheckSquare,
  Rocket,
  Trash2,
  AlertCircle,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SessionActionItems } from '@/components/dashboard/mentorship/session-action-items';
import { CompleteSessionDialog } from '@/components/dashboard/mentorship/complete-session-dialog';
import Link from 'next/link';

export default function MentorshipSessionDetailsPage() {
  const { mentorshipId, sessionId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isActionLoading, setIsActionLoading] = useState(false);

  // 1. Load Session Data
  const sessionRef = useMemoFirebase(() => {
    if (!firestore || !sessionId) return null;
    return doc(firestore, 'mentorshipSessions', sessionId as string);
  }, [firestore, sessionId]);
  const { data: session, isLoading: isSLoading } = useDoc(sessionRef);

  // 2. Load Profiles
  const [profiles, setProfiles] = useState<any>(null);
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || !session) return;
      const [mSnap, fSnap, sSnap] = await Promise.all([
        getDoc(doc(firestore, 'users', session.mentorUid)),
        getDoc(doc(firestore, 'users', session.founderUid)),
        getDoc(doc(firestore, 'startups', session.startupId))
      ]);
      setProfiles({
        mentor: mSnap.data(),
        founder: fSnap.data(),
        startup: sSnap.data()
      });
    }
    loadProfiles();
  }, [firestore, session]);

  const isMentor = user?.uid === session?.mentorUid;
  const isFounder = user?.uid === session?.founderUid;

  const handleUpdateStatus = async (status: string) => {
    if (!firestore || !sessionId || isActionLoading) return;
    setIsActionLoading(true);
    try {
      await updateDoc(doc(firestore, 'mentorshipSessions', sessionId as string), {
        status,
        updatedAt: serverTimestamp()
      });
      toast({ title: `Session marked as ${status}` });
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!firestore || !sessionId) return;
    if (!confirm("Permanently remove this session?")) return;

    try {
      await deleteDoc(doc(firestore, 'mentorshipSessions', sessionId as string));
      toast({ title: "Session Removed" });
      router.push(`/dashboard/mentorship/active/${mentorshipId}/sessions`);
    } catch (e) {
      toast({ title: "Delete Failed", variant: "destructive" });
    }
  };

  if (isSLoading || !profiles) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4">Retrieving Document...</p>
      </div>
    );
  }

  const scheduledAt = session.scheduledAt?.toDate() || new Date();
  const isCompleted = session.status === 'Completed';

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <Link href={`/dashboard/mentorship/active/${mentorshipId}`} className="hover:text-primary">Workspace</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/dashboard/mentorship/active/${mentorshipId}/sessions`} className="hover:text-primary">Sessions</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600">Meeting Log</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">{session.title}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {isMentor && !isCompleted && (
            <>
              <CompleteSessionDialog session={session} />
              <Button 
                variant="outline" 
                className="rounded-xl h-11 font-bold text-destructive border-slate-200"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </>
          )}
          {session.meetingLink && !isCompleted && (
            <Button className="rounded-xl h-11 font-black gap-2 shadow-lg shadow-primary/20" asChild>
              <a href={session.meetingLink.startsWith('http') ? session.meetingLink : `https://${session.meetingLink}`} target="_blank">
                <Video className="h-4 w-4" /> Join Meeting
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          
          <Card className="border-none shadow-xl rounded-[3rem] overflow-hidden bg-white ring-1 ring-slate-100">
             <CardHeader className="bg-slate-900 text-white p-10 flex flex-row justify-between items-center">
                <div className="space-y-2">
                   <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3">{session.status}</Badge>
                   <CardTitle className="text-2xl font-black">{format(scheduledAt, 'EEEE, MMMM do')}</CardTitle>
                   <CardDescription className="text-slate-400 font-medium flex items-center gap-4">
                      <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> {format(scheduledAt, 'p')} ({session.estimatedDuration}m)</span>
                      <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> {session.meetingType}</span>
                   </CardDescription>
                </div>
                <div className="h-16 w-16 rounded-[2rem] bg-white/10 flex items-center justify-center text-primary border border-white/10">
                   <Calendar className="h-8 w-8" />
                </div>
             </CardHeader>
             <CardContent className="p-10 space-y-12">
                <section className="space-y-4">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Gavel className="h-4 w-4" /> Session Agenda
                   </h3>
                   <div className="p-8 rounded-[2rem] bg-slate-50 border border-slate-100">
                      <p className="text-lg text-slate-700 leading-relaxed font-medium italic">
                        "{session.agenda || 'No agenda provided for this session.'}"
                      </p>
                   </div>
                </section>

                <SessionActionItems session={session} isMentor={isMentor} isFounder={isFounder} />

                {isCompleted && (
                  <section className="space-y-6 pt-12 border-t border-slate-100 animate-in fade-in duration-1000">
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 rounded-xl">
                           <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900">Post-Session Intelligence</h3>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Key Learnings</h4>
                           <p className="text-slate-600 leading-relaxed font-medium">{session.keyLearnings || 'Not recorded.'}</p>
                        </div>
                        <div className="space-y-3">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Next Steps</h4>
                           <p className="text-slate-600 leading-relaxed font-medium">{session.nextSteps || 'Not recorded.'}</p>
                        </div>
                     </div>

                     {session.summary && (
                       <div className="space-y-3 pt-6 border-t border-slate-50">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Executive Summary</h4>
                          <p className="text-slate-500 italic text-sm leading-relaxed">{session.summary}</p>
                       </div>
                     )}
                  </section>
                )}
             </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white p-8 space-y-8 relative overflow-hidden group">
              <div className="relative z-10 space-y-6">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Active Venture</p>
                    <p className="text-xl font-black flex items-center gap-2">
                       <Rocket className="h-5 w-5 text-primary" /> {profiles.startup.name}
                    </p>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                       <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {profiles.mentor.fullName[0]}
                       </div>
                       <div>
                          <p className="text-xs font-black">{profiles.mentor.fullName}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase">Primary Advisor</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                       <div className="h-10 w-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent font-bold">
                          {profiles.founder.fullName[0]}
                       </div>
                       <div>
                          <p className="text-xs font-black">{profiles.founder.fullName}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase">Venture Lead</p>
                       </div>
                    </div>
                 </div>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-700" />
           </Card>

           <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 p-8 space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-50 pb-4">
                 <ShieldCheck className="h-5 w-5 text-primary" />
                 <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Meeting Access</h3>
              </div>
              
              <div className="space-y-4">
                 <div className="space-y-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Conference URL</p>
                    {session.meetingLink ? (
                      <code className="block p-3 rounded-xl bg-slate-50 text-[10px] font-mono text-primary truncate border border-primary/10">
                        {session.meetingLink}
                      </code>
                    ) : (
                      <p className="text-xs italic text-slate-400">Offline or link pending</p>
                    )}
                 </div>
                 
                 <Button variant="outline" className="w-full h-12 rounded-xl font-bold gap-2" asChild>
                    <Link href={`/dashboard/messages?startWith=${isMentor ? session.founderUid : session.mentorUid}`}>
                       <MessageSquare className="h-4 w-4" /> Shared Chat
                    </Link>
                 </Button>
              </div>
           </Card>

           <div className="p-8 text-center space-y-4">
              <AlertCircle className="h-8 w-8 text-slate-200 mx-auto" />
              <p className="text-[10px] font-bold text-slate-400 leading-relaxed uppercase tracking-tighter">
                Sessions are strictly private and end-to-end encrypted within the TabStartup architecture.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

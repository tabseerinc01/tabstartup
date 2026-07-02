
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useDoc, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  doc, 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  getDoc 
} from 'firebase/firestore';
import { 
  Loader2, 
  GraduationCap, 
  Rocket, 
  MessageSquare, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Lock, 
  Users, 
  History,
  Send,
  Zap,
  LayoutGrid
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const PROGRESS_STAGES = ["Onboarding", "Discovery", "Growth Planning", "Execution", "Completed"];

export default function MentorshipWorkspacePage() {
  const { mentorshipId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<'shared' | 'private'>('shared');
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);

  // 1. Load Mentorship Base Data
  const mentorshipRef = useMemoFirebase(() => {
    if (!firestore || !mentorshipId) return null;
    return doc(firestore, 'activeMentorships', mentorshipId as string);
  }, [firestore, mentorshipId]);
  const { data: mentorship, isLoading: isMLoading } = useDoc(mentorshipRef);

  // 2. Fetch Profiles
  const [profiles, setProfiles] = useState<any>(null);
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || !mentorship) return;
      const [mSnap, fSnap, sSnap] = await Promise.all([
        getDoc(doc(firestore, 'users', mentorship.mentorUid)),
        getDoc(doc(firestore, 'users', mentorship.founderUid)),
        getDoc(doc(firestore, 'startups', mentorship.startupId))
      ]);
      setProfiles({
        mentor: mSnap.data(),
        founder: fSnap.data(),
        startup: sSnap.data()
      });
    }
    loadProfiles();
  }, [firestore, mentorship]);

  // 3. Fetch Notes & Timeline
  const notesQ = useMemoFirebase(() => {
    if (!firestore || !mentorshipId) return null;
    return query(collection(firestore, 'activeMentorships', mentorshipId as string, 'notes'), orderBy('createdAt', 'desc'));
  }, [firestore, mentorshipId]);
  const { data: notes } = useCollection(notesQ);

  const timelineQ = useMemoFirebase(() => {
    if (!firestore || !mentorshipId) return null;
    return query(collection(firestore, 'activeMentorships', mentorshipId as string, 'timeline'), orderBy('createdAt', 'desc'));
  }, [firestore, mentorshipId]);
  const { data: timeline } = useCollection(timelineQ);

  const isMentor = user?.uid === mentorship?.mentorUid;
  const isFounder = user?.uid === mentorship?.founderUid;

  const handleUpdateStatus = async (newStatus: string) => {
    if (!firestore || !mentorshipId || isStatusUpdating || !isMentor) return;
    setIsStatusUpdating(true);
    try {
      await updateDoc(doc(firestore, 'activeMentorships', mentorshipId as string), {
        status: newStatus,
        lastActivityAt: serverTimestamp()
      });

      await addDoc(collection(firestore, 'activeMentorships', mentorshipId as string, 'timeline'), {
        type: 'status_change',
        details: `Mentorship progress updated to ${newStatus}.`,
        createdAt: serverTimestamp()
      });

      createNotification(firestore, {
        recipientUid: mentorship.founderUid,
        actorUid: user!.uid,
        type: 'connection',
        title: 'Mentorship Progress Update',
        message: `Your mentor has updated the relationship status to ${newStatus}.`,
        targetId: mentorshipId as string,
        targetType: 'user'
      });

      toast({ title: "Status Updated" });
    } catch (e) {
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setIsStatusUpdating(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !mentorshipId || !newNote.trim() || isNoteSaving) return;

    setIsNoteSaving(true);
    const noteData = {
      content: newNote.trim(),
      type: noteType,
      authorUid: user!.uid,
      authorName: user!.displayName || 'User',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(firestore, 'activeMentorships', mentorshipId as string, 'notes'), noteData);
      
      if (noteType === 'shared') {
        await addDoc(collection(firestore, 'activeMentorships', mentorshipId as string, 'timeline'), {
          type: 'note',
          details: `${isMentor ? 'Mentor' : 'Founder'} added a shared note.`,
          createdAt: serverTimestamp()
        });

        const targetUid = isMentor ? mentorship.founderUid : mentorship.mentorUid;
        createNotification(firestore, {
          recipientUid: targetUid,
          actorUid: user!.uid,
          type: 'connection',
          title: 'New Shared Note',
          message: `${user!.displayName || 'Collaborator'} added a note to your shared workspace.`,
          targetId: mentorshipId as string,
          targetType: 'user'
        });
      }

      setNewNote('');
      toast({ title: "Note Saved" });
    } catch (e) {
      toast({ title: "Save Failed", variant: "destructive" });
    } finally {
      setIsNoteSaving(false);
    }
  };

  if (isMLoading || !profiles) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Workspace...</p>
      </div>
    );
  }

  if (!isMentor && !isFounder) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center space-y-6">
        <Lock className="h-12 w-12 text-destructive opacity-20" />
        <h2 className="text-2xl font-black">Private Workspace</h2>
        <p className="text-slate-500">You do not have permission to access this mentorship data.</p>
        <Button onClick={() => router.back()}>Return Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2 -ml-4 hover:bg-slate-100 rounded-full font-bold text-slate-500 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
          <div className="flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
                <GraduationCap className="h-7 w-7" />
             </div>
             <h1 className="text-4xl font-black tracking-tight text-slate-900">Mentorship Workspace</h1>
          </div>
        </div>

        <div className="flex gap-2">
           <Button variant="outline" className="rounded-xl font-bold border-slate-200" asChild>
             <Link href={`/dashboard/messages?startWith=${isMentor ? mentorship.founderUid : mentorship.mentorUid}`}>
                <MessageSquare className="h-4 w-4 mr-2" /> Open Conversation
             </Link>
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Relationship & Notes */}
        <div className="lg:col-span-8 space-y-8">
          
          <Card className="border-none shadow-xl rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
             <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-4">
                   <div className="flex items-center gap-4">
                      <div className="text-center space-y-1">
                         <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[10px] font-black uppercase">Mentor</Badge>
                         <p className="font-black text-slate-900">{profiles.mentor.fullName}</p>
                      </div>
                      <Zap className="h-4 w-4 text-slate-200" />
                      <div className="text-center space-y-1">
                         <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[10px] font-black uppercase">Founder</Badge>
                         <p className="font-black text-slate-900">{profiles.founder.fullName}</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <Badge className="bg-green-500 text-white border-none rounded-xl px-4 py-1.5 font-bold uppercase text-[10px] tracking-widest">{mentorship.status}</Badge>
                   </div>
                </div>
             </CardHeader>
             <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Startup</p>
                      <p className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-primary" /> {profiles.startup?.name || 'Venture'}
                      </p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Started At</p>
                      <p className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" /> {mentorship.startedAt?.toDate().toLocaleDateString()}
                      </p>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Sync</p>
                      <p className="text-sm font-bold text-slate-500">
                        {mentorship.lastActivityAt ? formatDistanceToNow(mentorship.lastActivityAt.toDate(), { addSuffix: true }) : 'Never'}
                      </p>
                   </div>
                </div>
             </CardContent>
          </Card>

          {/* Progress Section */}
          <div className="space-y-4">
             <h3 className="text-xl font-black text-slate-900 px-2 flex items-center gap-2">
               <TrendingUp className="h-5 w-5 text-primary" /> Relationship Progress
             </h3>
             <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 rounded-2xl ring-1 ring-slate-100">
                {PROGRESS_STAGES.map((stage) => {
                  const isActive = mentorship.status === stage;
                  return (
                    <Button 
                      key={stage}
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleUpdateStatus(stage)}
                      disabled={!isMentor || isStatusUpdating}
                      className={cn(
                        "rounded-xl h-10 px-4 text-[10px] font-black uppercase tracking-widest transition-all",
                        isActive ? "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary" : "text-slate-400 hover:bg-white"
                      )}
                    >
                      {isActive && <CheckCircle2 className="h-3 w-3 mr-1.5" />}
                      {stage}
                    </Button>
                  );
                })}
             </div>
          </div>

          {/* Notes Section */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-2">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-primary" /> Workspace Notes
                </h3>
                {isMentor && (
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                    <Button size="sm" variant={noteType === 'shared' ? 'default' : 'ghost'} className="h-7 text-[9px] font-black rounded-lg px-3" onClick={() => setNoteType('shared')}>SHARED</Button>
                    <Button size="sm" variant={noteType === 'private' ? 'destructive' : 'ghost'} className="h-7 text-[9px] font-black rounded-lg px-3" onClick={() => setNoteType('private')}>PRIVATE</Button>
                  </div>
                )}
             </div>

             <Card className="border-none shadow-xl rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
                <form onSubmit={handleAddNote}>
                  <CardContent className="p-0">
                    <Textarea 
                      placeholder={noteType === 'private' ? "Mentor's private log entry..." : "Add a shared note for current goals and updates..."}
                      className="min-h-[120px] p-8 rounded-none border-none shadow-none focus-visible:ring-0 text-lg placeholder:text-slate-300 font-medium italic"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                    />
                  </CardContent>
                  <CardFooter className="bg-slate-50/50 p-6 border-t border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {noteType === 'private' ? (
                        <div className="flex items-center gap-1.5 text-destructive font-black text-[9px] uppercase tracking-widest">
                          <Lock className="h-3 w-3" /> Visible only to you
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-primary font-black text-[9px] uppercase tracking-widest">
                          <Users className="h-3 w-3" /> Visible to both parties
                        </div>
                      )}
                    </div>
                    <Button type="submit" disabled={!newNote.trim() || isNoteSaving} className="rounded-xl h-10 px-6 font-bold gap-2 shadow-lg shadow-primary/20">
                      {isNoteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Post Entry
                    </Button>
                  </CardFooter>
                </form>
             </Card>

             <div className="space-y-4">
                {notes && notes.length > 0 ? (
                  notes.map((note) => {
                    const isPrivate = note.type === 'private';
                    if (isPrivate && !isMentor) return null;

                    return (
                      <Card key={note.id} className={cn(
                        "border-none shadow-sm rounded-[2rem] bg-background ring-1 ring-slate-100 overflow-hidden transition-all hover:shadow-md",
                        isPrivate && "ring-destructive/20 bg-destructive/[0.02]"
                      )}>
                        <CardContent className="p-6">
                           <div className="flex items-start justify-between mb-4">
                              <div className="flex items-center gap-2">
                                <Badge className={cn("rounded-lg px-2 h-5 text-[8px] font-black uppercase border-none", isPrivate ? "bg-destructive text-white" : "bg-primary/10 text-primary")}>
                                  {isPrivate ? "Private Log" : "Shared Note"}
                                </Badge>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">by {note.authorName}</span>
                              </div>
                              <span className="text-[9px] font-bold text-slate-300 uppercase">
                                {note.createdAt?.toDate ? formatDistanceToNow(note.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                              </span>
                           </div>
                           <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{note.content}</p>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                     <Clock className="h-10 w-10 text-slate-100 mx-auto mb-2" />
                     <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No workspace entries yet</p>
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Right Column: Timeline & Context */}
        <div className="lg:col-span-4 space-y-8">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
              <CardHeader className="pb-4">
                 <CardTitle className="text-lg font-black flex items-center gap-2">
                   <History className="h-5 w-5 text-primary" /> Activity Feed
                 </CardTitle>
                 <CardDescription className="text-slate-500">Chronicle of mentorship events.</CardDescription>
              </CardHeader>
              <CardContent>
                 <ScrollArea className="h-[400px] pr-4">
                    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-white/5">
                       {timeline && timeline.map((item, i) => (
                         <div key={item.id} className="relative flex items-start gap-6">
                            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-slate-900 z-10 ml-[13px]" />
                            <div className="min-w-0">
                               <p className="text-xs font-black text-white leading-tight">{item.details}</p>
                               <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                                  {item.createdAt?.toDate ? formatDistanceToNow(item.createdAt.toDate(), { addSuffix: true }) : 'Now'}
                               </p>
                            </div>
                         </div>
                       ))}
                       <div className="relative flex items-start gap-6">
                         <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-700 ring-4 ring-slate-900 z-10 ml-[13px]" />
                         <p className="text-[10px] font-bold text-slate-500">Record initialized</p>
                       </div>
                    </div>
                 </ScrollArea>
              </CardContent>
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
           </Card>

           <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-2">Collaborator Access</h4>
              <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 p-6 space-y-4">
                 <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50 ring-1 ring-slate-100 group">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                       <AvatarImage src={isMentor ? profiles.founder.imageUrl : profiles.mentor.imageUrl} />
                       <AvatarFallback className="font-bold">C</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                       <p className="text-sm font-black text-slate-900 truncate">{isMentor ? profiles.founder.fullName : profiles.mentor.fullName}</p>
                       <p className="text-[9px] font-bold text-slate-400 uppercase">{isMentor ? 'Founder' : 'Mentor'}</p>
                    </div>
                 </div>
              </Card>
           </div>
        </div>
      </div>
    </div>
  );
}

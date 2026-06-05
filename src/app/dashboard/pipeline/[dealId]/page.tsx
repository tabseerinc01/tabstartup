
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, useDoc, useMemoFirebase, errorEmitter, FirestorePermissionError, useCollection } from '@/firebase';
import { 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  collection, 
  addDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { 
  ArrowLeft, 
  Loader2, 
  Calendar, 
  Pencil, 
  Trash2, 
  Clock, 
  Save, 
  X,
  User,
  HandCoins,
  CheckCircle2,
  XCircle,
  Plus,
  MessageSquare,
  History,
  CheckSquare,
  MoreVertical,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NewTaskDialog } from '@/components/dashboard/tasks/new-task-dialog';
import { NewDealDialog } from '@/components/dashboard/pipeline/new-deal-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';

export default function DealDetailsPage() {
  const { dealId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isNoteAdding, setIsNoteAdding] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Fetch Deal Document
  const dealRef = useMemoFirebase(() => {
    if (!firestore || !dealId) return null;
    return doc(firestore, 'deals', dealId as string);
  }, [firestore, dealId]);
  const { data: deal, isLoading } = useDoc(dealRef);

  // 2. Fetch Notes
  const notesQuery = useMemoFirebase(() => {
    if (!firestore || !dealId) return null;
    return query(collection(firestore, 'deals', dealId as string, 'notes'), orderBy('createdAt', 'desc'));
  }, [firestore, dealId]);
  const { data: notes } = useCollection(notesQuery);

  // 3. Fetch Activities
  const activitiesQuery = useMemoFirebase(() => {
    if (!firestore || !dealId) return null;
    return query(collection(firestore, 'deals', dealId as string, 'activities'), orderBy('createdAt', 'desc'));
  }, [firestore, dealId]);
  const { data: activities } = useCollection(activitiesQuery);

  // 4. Fetch Linked Tasks
  const tasksQuery = useMemoFirebase(() => {
    if (!firestore || !dealId) return null;
    return query(collection(firestore, 'tasks'), where('dealId', '==', dealId));
  }, [firestore, dealId]);
  const { data: linkedTasks } = useCollection(tasksQuery);

  const logActivity = (type: string, details: string) => {
    if (!firestore || !dealId) return;
    addDoc(collection(firestore, 'deals', dealId as string, 'activities'), {
      type,
      details,
      createdAt: serverTimestamp()
    });
  };

  const handleUpdateStatus = async (status: string) => {
    if (!firestore || !dealId) return;
    const oldStage = deal?.stage;
    updateDoc(doc(firestore, 'deals', dealId as string), {
      stage: status,
      updatedAt: serverTimestamp()
    }).then(() => {
      logActivity('stage_change', `Stage changed from ${oldStage} to ${status}`);
      toast({ title: `Deal Marked as ${status}` });
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `deals/${dealId}`,
        operation: 'update',
        requestResourceData: { stage: status }
      }));
    });
  };

  const handleDelete = async () => {
    if (!firestore || !dealId || isDeleting) return;
    if (!confirm("Permanently delete this deal? This will also remove associated notes and history.")) return;

    setIsDeleting(true);
    deleteDoc(doc(firestore, 'deals', dealId as string))
      .then(() => {
        toast({ title: "Deal Deleted" });
        router.push('/dashboard/pipeline');
      })
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `deals/${dealId}`,
          operation: 'delete'
        }));
        setIsDeleting(false);
      });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !dealId || !newNote.trim()) return;

    const noteData = {
      content: newNote.trim(),
      createdAt: serverTimestamp(),
      authorName: user?.displayName || 'User'
    };

    addDoc(collection(firestore, 'deals', dealId as string, 'notes'), noteData)
      .then(() => {
        setNewNote('');
        setIsNoteAdding(false);
        toast({ title: "Note Added" });
        logActivity('note_added', 'New internal note was added to the deal');
      })
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `deals/${dealId}/notes`,
          operation: 'create',
          requestResourceData: noteData
        }));
      });
  };

  if (isLoading || !deal) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading Deal Intelligence...</p>
      </div>
    );
  }

  // Security Check
  if (deal.ownerUid !== user?.uid) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-black">Access Restricted</h2>
        <p className="text-slate-500 mb-6">This deal is private to its owner.</p>
        <Button onClick={() => router.push('/dashboard/pipeline')}>Back to Pipeline</Button>
      </div>
    );
  }

  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: deal.currency || 'USD', maximumFractionDigits: 0
  }).format(deal.value || 0);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Breadcrumbs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/dashboard/pipeline" className="hover:text-primary">Pipeline</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600">Deal: {deal.id.slice(0, 8)}</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">{deal.title}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <NewDealDialog 
            editingDeal={deal} 
            trigger={
              <Button variant="outline" className="rounded-xl h-11 gap-2 font-bold border-slate-200">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            } 
          />
          <Button 
            variant="outline" 
            className="rounded-xl h-11 gap-2 font-bold border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => handleUpdateStatus('Won')}
            disabled={deal.stage === 'Won'}
          >
            <CheckCircle2 className="h-4 w-4" /> Mark Won
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl h-11 gap-2 font-bold border-red-200 text-red-700 hover:bg-red-50"
            onClick={() => handleUpdateStatus('Lost')}
            disabled={deal.stage === 'Lost'}
          >
            <XCircle className="h-4 w-4" /> Mark Lost
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl h-11 gap-2 font-bold text-destructive hover:bg-destructive/5"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Core Info & Feed */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="p-3 bg-primary/10 rounded-2xl">
                        <HandCoins className="h-6 w-6 text-primary" />
                     </div>
                     <div>
                        <CardTitle className="text-xl font-black">Deal Summary</CardTitle>
                        <CardDescription>Strategic overview of this opportunity.</CardDescription>
                     </div>
                  </div>
                  <Badge className={cn(
                    "rounded-xl px-4 py-1.5 text-xs font-black uppercase tracking-widest border-none",
                    deal.stage === 'Won' ? "bg-green-500 text-white" :
                    deal.stage === 'Lost' ? "bg-red-500 text-white" : "bg-primary text-white"
                  )}>
                    {deal.stage}
                  </Badge>
               </div>
            </CardHeader>
            <CardContent className="p-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="space-y-4">
                     <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deal Value</Label>
                        <p className="text-3xl font-black text-slate-900">{formattedValue}</p>
                     </div>
                     <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Linked Contact</Label>
                        <Link href={`/dashboard/contacts/${deal.contactId}`} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 hover:ring-primary/20 transition-all group">
                           <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                              {deal.contactName.charAt(0)}
                           </div>
                           <span className="font-bold text-slate-700 group-hover:text-primary">{deal.contactName}</span>
                           <ChevronRight className="h-3 w-3 ml-auto text-slate-300" />
                        </Link>
                     </div>
                  </div>
                  <div className="space-y-4">
                     <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Closing Projection</Label>
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                           <Calendar className="h-4 w-4 text-primary" />
                           {deal.expectedCloseDate ? format(new Date(deal.expectedCloseDate), 'MMMM d, yyyy') : 'No date set'}
                        </div>
                     </div>
                     <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Confidence Probability</Label>
                        <div className="flex items-center gap-3">
                           <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${deal.probability || 50}%` }} />
                           </div>
                           <span className="text-sm font-black text-slate-900">{deal.probability || 50}%</span>
                        </div>
                     </div>
                  </div>
               </div>
               
               <div className="space-y-2 pt-8 border-t border-slate-50">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deal Context & Description</Label>
                  <p className="text-slate-600 leading-relaxed font-medium italic">
                    "{deal.description || 'No strategic description provided for this deal.'}"
                  </p>
               </div>
            </CardContent>
          </Card>

          {/* Notes Section */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-4">
                <h3 className="text-xl font-black flex items-center gap-2">
                   <MessageSquare className="h-5 w-5 text-primary" /> Internal Notes
                </h3>
                <Button variant="ghost" size="sm" className="rounded-xl gap-2 font-bold text-primary" onClick={() => setIsNoteAdding(!isNoteAdding)}>
                   {isNoteAdding ? <X className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Add Note</>}
                </Button>
             </div>

             {isNoteAdding && (
                <Card className="border-none shadow-lg rounded-[2rem] bg-primary/5 ring-1 ring-primary/10 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                   <form onSubmit={handleAddNote}>
                      <CardContent className="p-6">
                         <Textarea 
                           placeholder="Capture strategy insights, call logs or meeting minutes..."
                           className="min-h-[120px] rounded-2xl border-none shadow-none focus-visible:ring-0 bg-transparent text-lg placeholder:text-slate-400"
                           value={newNote}
                           onChange={e => setNewNote(e.target.value)}
                           autoFocus
                         />
                      </CardContent>
                      <CardFooter className="bg-white/50 p-4 border-t border-primary/5 flex justify-end gap-2">
                         <Button type="submit" disabled={!newNote.trim()} className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20">
                            Save Note
                         </Button>
                      </CardFooter>
                   </form>
                </Card>
             )}

             <div className="space-y-4">
                {notes && notes.length > 0 ? (
                   notes.map(note => (
                      <Card key={note.id} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-2xl bg-white ring-1 ring-slate-100">
                         <CardContent className="p-6 space-y-4">
                            <p className="text-slate-700 leading-relaxed font-medium">{note.content}</p>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                               <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                                     {note.authorName?.charAt(0)}
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">{note.authorName}</span>
                               </div>
                               <span className="text-[9px] font-black text-slate-300 uppercase">
                                  {note.createdAt?.toDate ? format(note.createdAt.toDate(), 'PPP p') : 'Recently'}
                               </span>
                            </div>
                         </CardContent>
                      </Card>
                   ))
                ) : !isNoteAdding && (
                  <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                     <p className="text-slate-300 font-bold italic uppercase text-xs tracking-widest">No internal notes captured</p>
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Right Column: Meta & Tasks */}
        <div className="lg:col-span-4 space-y-8">
           {/* Quick Stats */}
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
              <CardHeader className="pb-4">
                 <div className="flex items-center gap-2 mb-2">
                    <div className="h-1 w-6 bg-primary rounded-full" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Metadata</span>
                 </div>
                 <CardTitle className="text-lg font-black">History Log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-8">
                 <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Created</span>
                       <span className="text-xs font-bold">{deal.createdAt?.toDate ? format(deal.createdAt.toDate(), 'MMM d, yyyy') : 'Today'}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Last Update</span>
                       <span className="text-xs font-bold">{deal.updatedAt?.toDate ? format(deal.updatedAt.toDate(), 'MMM d, yyyy') : 'Recent'}</span>
                    </div>
                 </div>
              </CardContent>
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mb-16 pointer-events-none" />
           </Card>

           {/* Linked Tasks */}
           <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                 <h3 className="text-lg font-black flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-primary" /> Tasks
                 </h3>
                 <NewTaskDialog initialDealId={deal.id as string} trigger={
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary hover:bg-primary/5">
                       <Plus className="h-4 w-4" />
                    </Button>
                 } />
              </div>
              
              <div className="space-y-3">
                 {linkedTasks && linkedTasks.length > 0 ? (
                   linkedTasks.map(task => (
                      <Card key={task.id} className={cn(
                        "border-none shadow-sm rounded-2xl overflow-hidden ring-1 ring-slate-100 bg-white",
                        task.status === 'Completed' && "opacity-60"
                      )}>
                         <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                               <div className={cn(
                                 "mt-1 shrink-0 h-4 w-4 rounded-full border-2",
                                 task.status === 'Completed' ? "bg-green-500 border-green-500" : "border-slate-300"
                               )} />
                               <div className="min-w-0">
                                  <p className={cn("text-sm font-bold text-slate-800 truncate", task.status === 'Completed' && "line-through")}>
                                     {task.title}
                                  </p>
                                  <p className="text-[9px] font-black uppercase text-slate-400 mt-1">
                                     Due: {task.dueDate?.toDate ? format(task.dueDate.toDate(), 'MMM d') : 'No date'}
                                  </p>
                               </div>
                            </div>
                         </CardContent>
                      </Card>
                   ))
                 ) : (
                   <div className="py-12 text-center bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">No linked tasks</p>
                   </div>
                 )}
              </div>
           </div>

           {/* Activity Feed */}
           <div className="space-y-4">
              <h3 className="text-lg font-black flex items-center gap-2 px-2">
                 <History className="h-5 w-5 text-primary" /> Lifecycle
              </h3>
              <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100">
                 {activities && activities.map((activity, i) => (
                    <div key={activity.id} className="relative flex items-start gap-4">
                       <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-background z-10 ml-[13px]" />
                       <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 leading-tight">{activity.details}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">
                             {activity.createdAt?.toDate ? format(activity.createdAt.toDate(), 'MMM d, p') : 'Just now'}
                          </p>
                       </div>
                    </div>
                 ))}
                 <div className="relative flex items-start gap-4">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-4 ring-background z-10 ml-[13px]" />
                    <div className="flex-1 min-w-0">
                       <p className="text-xs font-bold text-slate-400">Deal record established</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

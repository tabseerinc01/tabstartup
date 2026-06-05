
'use client';

import { useState, useMemo } from 'react';
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
  CheckCircle2,
  XCircle,
  Plus,
  History,
  CheckSquare,
  ChevronRight,
  Briefcase,
  Flag,
  Circle,
  ArrowUpRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NewTaskDialog } from '@/components/dashboard/tasks/new-task-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import Link from 'next/link';

export default function TaskDetailsPage() {
  const { taskId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Fetch Task Document
  const taskRef = useMemoFirebase(() => {
    if (!firestore || !taskId) return null;
    return doc(firestore, 'tasks', taskId as string);
  }, [firestore, taskId]);
  const { data: task, isLoading } = useDoc(taskRef);

  // 2. Fetch Task Activities
  const activitiesQuery = useMemoFirebase(() => {
    if (!firestore || !taskId) return null;
    return query(collection(firestore, 'tasks', taskId as string, 'activities'), orderBy('createdAt', 'desc'));
  }, [firestore, taskId]);
  const { data: activities } = useCollection(activitiesQuery);

  const logActivity = (details: string) => {
    if (!firestore || !taskId) return;
    addDoc(collection(firestore, 'tasks', taskId as string, 'activities'), {
      details,
      createdAt: serverTimestamp()
    });
  };

  const handleUpdateStatus = async (status: string) => {
    if (!firestore || !taskId) return;
    updateDoc(doc(firestore, 'tasks', taskId as string), {
      status,
      completedAt: status === 'Completed' ? serverTimestamp() : null,
      updatedAt: serverTimestamp()
    }).then(() => {
      logActivity(`Status changed to ${status}`);
      toast({ title: `Task marked as ${status}` });
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `tasks/${taskId}`,
        operation: 'update',
        requestResourceData: { status }
      }));
    });
  };

  const handleDelete = async () => {
    if (!firestore || !taskId || isDeleting) return;
    if (!confirm("Permanently delete this task?")) return;

    setIsDeleting(true);
    deleteDoc(doc(firestore, 'tasks', taskId as string))
      .then(() => {
        toast({ title: "Task Deleted" });
        router.push('/dashboard/tasks');
      })
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `tasks/${taskId}`,
          operation: 'delete'
        }));
        setIsDeleting(false);
      });
  };

  if (isLoading || !task) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Synchronizing Workflow...</p>
      </div>
    );
  }

  // Security Check
  if (task.ownerUid !== user?.uid) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-black">Access Restricted</h2>
        <p className="text-slate-500 mb-6">This task is private to its owner.</p>
        <Button onClick={() => router.push('/dashboard/tasks')}>Back to Tasks</Button>
      </div>
    );
  }

  const isCompleted = task.status === 'Completed';

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <Link href="/dashboard" className="hover:text-primary">Dashboard</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/dashboard/tasks" className="hover:text-primary">Tasks</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-slate-600">Task Details</span>
          </nav>
          <div className="flex items-center gap-4">
             <div className={cn(
               "h-10 w-10 rounded-2xl flex items-center justify-center shadow-lg",
               isCompleted ? "bg-green-500 text-white" : "bg-primary text-white"
             )}>
                <CheckSquare className="h-6 w-6" />
             </div>
             <h1 className="text-4xl font-black tracking-tight text-slate-900">{task.title}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <NewTaskDialog 
            editingTask={task} 
            trigger={
              <Button variant="outline" className="rounded-xl h-11 gap-2 font-bold border-slate-200">
                <Pencil className="h-4 w-4" /> Edit Task
              </Button>
            } 
          />
          {isCompleted ? (
            <Button 
              variant="outline" 
              className="rounded-xl h-11 gap-2 font-bold border-slate-200"
              onClick={() => handleUpdateStatus('Pending')}
            >
              <Circle className="h-4 w-4" /> Reopen Task
            </Button>
          ) : (
            <Button 
              variant="outline" 
              className="rounded-xl h-11 gap-2 font-bold border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => handleUpdateStatus('Completed')}
            >
              <CheckCircle2 className="h-4 w-4" /> Mark Complete
            </Button>
          )}
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
        {/* Left Column: Details */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <div className="p-3 bg-primary/10 rounded-2xl">
                        <Clock className="h-6 w-6 text-primary" />
                     </div>
                     <div>
                        <CardTitle className="text-xl font-black">Action Item Overview</CardTitle>
                        <CardDescription>Core objective and description.</CardDescription>
                     </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={cn(
                      "rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none",
                      task.priority === 'High' ? "bg-red-500 text-white" :
                      task.priority === 'Medium' ? "bg-amber-500 text-white" : "bg-blue-500 text-white"
                    )}>
                      {task.priority} Priority
                    </Badge>
                    <Badge variant="secondary" className="rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none bg-primary/10 text-primary">
                      {task.status}
                    </Badge>
                  </div>
               </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                     <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deadline</Label>
                     <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                        <Calendar className="h-5 w-5 text-primary" />
                        <span className="font-black text-slate-800">
                          {task.dueDate?.toDate ? format(task.dueDate.toDate(), 'MMMM d, yyyy') : 'No deadline set'}
                        </span>
                     </div>
                  </div>
                  {task.completedAt && (
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Completed On</Label>
                       <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 ring-1 ring-green-100">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="font-black text-green-700">
                            {format(task.completedAt.toDate(), 'MMMM d, yyyy @ p')}
                          </span>
                       </div>
                    </div>
                  )}
               </div>

               <div className="space-y-2 pt-6 border-t border-slate-50">
                  <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Instructions & Context</Label>
                  <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
                    <p className="text-slate-600 leading-relaxed font-medium italic whitespace-pre-wrap">
                      "{task.description || 'No detailed instructions provided for this action item.'}"
                    </p>
                  </div>
               </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <div className="space-y-4 px-4">
             <h3 className="text-xl font-black flex items-center gap-2">
                <History className="h-5 w-5 text-primary" /> Task Lifecycle
             </h3>
             <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100">
                {activities && activities.map((activity, i) => (
                   <div key={activity.id} className="relative flex items-start gap-4">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-background z-10 ml-[13px]" />
                      <div className="flex-1 min-w-0">
                         <p className="text-sm font-bold text-slate-800 leading-tight">{activity.details}</p>
                         <p className="text-[10px] font-black text-slate-400 uppercase mt-1">
                            {activity.createdAt?.toDate ? format(activity.createdAt.toDate(), 'MMM d, p') : 'Just now'}
                         </p>
                      </div>
                   </div>
                ))}
                <div className="relative flex items-start gap-4">
                   <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-4 ring-background z-10 ml-[13px]" />
                   <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-400">Task registered in workspace</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column: Relationships */}
        <div className="lg:col-span-4 space-y-6">
           {/* Related Deal Card */}
           <div className="space-y-3">
              <Label className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Linked Opportunity</Label>
              {task.dealId && task.dealId !== 'none' ? (
                <Link href={`/dashboard/pipeline/${task.dealId}`}>
                  <Card className="border-none shadow-md hover:shadow-xl transition-all rounded-[2rem] bg-slate-900 text-white overflow-hidden group">
                    <CardContent className="p-6">
                       <div className="flex items-start justify-between mb-4">
                          <div className="p-2 bg-primary/20 rounded-xl">
                             <Briefcase className="h-5 w-5 text-primary" />
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-primary transition-colors" />
                       </div>
                       <h4 className="text-lg font-black truncate">{task.dealTitle}</h4>
                       <p className="text-[10px] font-bold text-primary uppercase mt-1">View Full Pipeline Deal</p>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="border-2 border-dashed rounded-[2rem] bg-slate-50/50 p-6 text-center border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase">No linked deal</p>
                </Card>
              )}
           </div>

           {/* Related Contact Card */}
           <div className="space-y-3">
              <Label className="px-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Target Contact</Label>
              {task.contactId && task.contactId !== 'none' ? (
                <Link href={`/dashboard/contacts/${task.contactId}`}>
                  <Card className="border-none shadow-md hover:shadow-xl transition-all rounded-[2rem] bg-white ring-1 ring-slate-100 group">
                    <CardContent className="p-6">
                       <div className="flex items-center gap-4 mb-4">
                          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-black text-xl">
                             {task.contactName?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                             <h4 className="font-black text-slate-900 truncate group-hover:text-primary transition-colors">{task.contactName}</h4>
                             <p className="text-[10px] font-bold text-slate-400 uppercase">Primary Contact</p>
                          </div>
                          <ChevronRight className="h-4 w-4 ml-auto text-slate-300 group-hover:text-primary" />
                       </div>
                    </CardContent>
                  </Card>
                </Link>
              ) : (
                <Card className="border-2 border-dashed rounded-[2rem] bg-slate-50/50 p-6 text-center border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase">No linked contact</p>
                </Card>
              )}
           </div>

           {/* Quick Metadata */}
           <Card className="border-none shadow-sm rounded-[2rem] bg-slate-50 p-6 space-y-4">
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-slate-400 uppercase">Created</p>
                 <p className="text-xs font-bold text-slate-700">{task.createdAt?.toDate ? format(task.createdAt.toDate(), 'PPP') : 'Today'}</p>
              </div>
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-slate-400 uppercase">Ownership</p>
                 <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-slate-400" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Private Workspace Task</span>
                 </div>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}

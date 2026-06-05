
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, doc, updateDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { 
  CheckSquare, 
  Loader2, 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  Clock, 
  MoreVertical, 
  Trash2, 
  Pencil, 
  CheckCircle2, 
  Circle,
  AlertCircle,
  Flag,
  User,
  Briefcase,
  ArrowUpRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { NewTaskDialog } from '@/components/dashboard/tasks/new-task-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, isToday, isFuture, isPast } from 'date-fns';
import Link from 'next/link';

export default function TasksPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const tasksQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: rawTasks, isLoading } = useCollection(tasksQuery);

  const tasks = useMemo(() => {
    if (!rawTasks) return [];
    const filtered = rawTasks.filter(t => 
      t.title.toLowerCase().includes(search.toLowerCase()) || 
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.contactName?.toLowerCase().includes(search.toLowerCase()) ||
      t.dealTitle?.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.sort((a, b) => {
      if (a.status === 'Completed' && b.status !== 'Completed') return 1;
      if (b.status === 'Completed' && a.status !== 'Completed') return -1;
      
      const dateA = a.dueDate?.toDate?.() || new Date(8640000000000000);
      const dateB = b.dueDate?.toDate?.() || new Date(8640000000000000);
      return dateA.getTime() - dateB.getTime();
    });
  }, [rawTasks, search]);

  const logTaskActivity = (taskId: string, details: string) => {
    if (!firestore) return;
    addDoc(collection(firestore, 'tasks', taskId, 'activities'), {
      details,
      createdAt: serverTimestamp()
    });
  };

  const handleToggleComplete = async (task: any) => {
    if (!firestore) return;
    const newStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
    const taskRef = doc(firestore, 'tasks', task.id);
    
    updateDoc(taskRef, { 
      status: newStatus, 
      completedAt: newStatus === 'Completed' ? serverTimestamp() : null,
      updatedAt: serverTimestamp() 
    }).then(() => {
      logTaskActivity(task.id, `Status marked as ${newStatus}`);
    }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: taskRef.path,
        operation: 'update',
        requestResourceData: { status: newStatus }
      }));
    });
  };

  const handleDeleteTask = async (id: string) => {
    if (!firestore || !confirm("Delete this task?")) return;
    deleteDoc(doc(firestore, 'tasks', id))
      .then(() => toast({ title: "Task Removed" }))
      .catch(err => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `tasks/${id}`,
          operation: 'delete'
        }));
      });
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Workflow...</p>
      </div>
    );
  }

  const todayTasks = tasks.filter(t => t.status !== 'Completed' && t.dueDate && isToday(t.dueDate.toDate()));
  const upcomingTasks = tasks.filter(t => t.status !== 'Completed' && t.dueDate && isFuture(t.dueDate.toDate()));
  const completedTasks = tasks.filter(t => t.status === 'Completed');

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Workspace Reminders</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
             Tasks
          </h1>
          <p className="text-slate-500 font-medium">Organize your actions for contacts and business deals.</p>
        </div>

        <NewTaskDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 space-y-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search tasks, contacts or notes..." 
              className="pl-11 h-12 rounded-2xl border-none shadow-sm bg-background text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="bg-slate-100/50 p-1 rounded-2xl w-fit h-auto flex gap-1 mb-6">
              <TabsTrigger value="all" className="rounded-xl px-6 py-2 font-bold data-[state=active]:bg-white shadow-sm">All</TabsTrigger>
              <TabsTrigger value="today" className="rounded-xl px-6 py-2 font-bold data-[state=active]:bg-white">Today</TabsTrigger>
              <TabsTrigger value="upcoming" className="rounded-xl px-6 py-2 font-bold data-[state=active]:bg-white">Upcoming</TabsTrigger>
              <TabsTrigger value="completed" className="rounded-xl px-6 py-2 font-bold data-[state=active]:bg-white">Completed</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-0">
               <TaskList items={tasks} onToggle={handleToggleComplete} onDelete={handleDeleteTask} />
            </TabsContent>
            <TabsContent value="today" className="mt-0">
               <TaskList items={todayTasks} onToggle={handleToggleComplete} onDelete={handleDeleteTask} />
            </TabsContent>
            <TabsContent value="upcoming" className="mt-0">
               <TaskList items={upcomingTasks} onToggle={handleToggleComplete} onDelete={handleDeleteTask} />
            </TabsContent>
            <TabsContent value="completed" className="mt-0">
               <TaskList items={completedTasks} onToggle={handleToggleComplete} onDelete={handleDeleteTask} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="md:col-span-4 space-y-6">
           <Card className="border-none shadow-sm rounded-[2.5rem] bg-slate-900 text-white overflow-hidden group">
              <CardHeader className="pb-4">
                 <div className="flex items-center gap-2 mb-2">
                    <div className="h-1 w-6 bg-primary rounded-full" />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Summary</span>
                 </div>
                 <CardTitle className="text-lg font-black">Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pb-8">
                 <div className="flex justify-between items-center p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="space-y-1">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Completion Rate</p>
                       <p className="text-2xl font-black">
                         {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                       </p>
                    </div>
                    <div className="p-3 bg-primary/20 rounded-xl"><CheckSquare className="h-6 w-6 text-primary" /></div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Today</p>
                       <p className="text-xl font-black">{todayTasks.length}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Upcoming</p>
                       <p className="text-xl font-black">{upcomingTasks.length}</p>
                    </div>
                 </div>
              </CardContent>
           </Card>

           <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100">
              <CardHeader className="pb-2">
                 <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Task Priorities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                 {['High', 'Medium', 'Low'].map(p => {
                    const count = tasks.filter(t => t.priority === p && t.status !== 'Completed').length;
                    return (
                      <div key={p} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                         <div className="flex items-center gap-2">
                            <Flag className={cn(
                              "h-3.5 w-3.5",
                              p === 'High' ? 'text-red-500' : p === 'Medium' ? 'text-amber-500' : 'text-blue-500'
                            )} />
                            <span className="text-sm font-bold text-slate-600">{p} Priority</span>
                         </div>
                         <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-black border-slate-200">{count}</Badge>
                      </div>
                    );
                 })}
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}

function TaskList({ items, onToggle, onDelete }: { items: any[], onToggle: (task: any) => void, onDelete: (id: string) => void }) {
  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-24 text-center border-slate-200">
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-full w-fit mx-auto">
            <CheckSquare className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-slate-400 font-bold italic">No tasks found in this view.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((task) => (
        <TaskItem key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete }: { task: any, onToggle: (task: any) => void, onDelete: (id: string) => void }) {
  const isCompleted = task.status === 'Completed';
  const dueDate = task.dueDate?.toDate?.();
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && !isCompleted;

  return (
    <Card className={cn(
      "group border-none shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden ring-1 ring-slate-100 bg-background",
      isCompleted && "opacity-60 grayscale-[0.5]"
    )}>
      <CardContent className="p-4 sm:p-5 flex items-start gap-4">
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(task);
          }}
          className={cn(
            "mt-1 rounded-full p-0.5 transition-colors",
            isCompleted ? "text-green-500 hover:text-green-600" : "text-slate-300 hover:text-primary"
          )}
        >
          {isCompleted ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
               <Link href={`/dashboard/tasks/${task.id}`}>
                 <h4 className={cn(
                   "text-lg font-black text-slate-900 transition-all group-hover:text-primary flex items-center gap-1.5",
                   isCompleted && "line-through text-slate-400"
                 )}>
                   {task.title}
                   <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-all text-primary" />
                 </h4>
               </Link>
               <div className="flex flex-wrap items-center gap-3">
                  {task.contactName && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                       <User className="h-3.5 w-3.5" /> {task.contactName}
                    </div>
                  )}
                  {task.dealTitle && (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                       <Briefcase className="h-3.5 w-3.5" /> {task.dealTitle}
                    </div>
                  )}
               </div>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
               {task.priority === 'High' && !isCompleted && (
                 <Badge variant="destructive" className="h-5 px-1.5 text-[8px] font-black uppercase tracking-widest bg-red-50 text-red-600 border-none">High Priority</Badge>
               )}
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                     <MoreVertical className="h-4 w-4 text-slate-400" />
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end" className="rounded-xl">
                    <NewTaskDialog 
                      editingTask={task} 
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2 cursor-pointer rounded-lg m-1">
                          <Pencil className="h-4 w-4" /> Edit Task
                        </DropdownMenuItem>
                      } 
                    />
                    <DropdownMenuItem onClick={() => onDelete(task.id)} className="gap-2 cursor-pointer text-destructive focus:text-destructive rounded-lg m-1">
                      <Trash2 className="h-4 w-4" /> Delete Task
                    </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 pt-4 border-t border-slate-50">
             {dueDate && (
                <div className={cn(
                  "flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tight",
                  isOverdue ? "text-red-500" : isCompleted ? "text-slate-400" : "text-slate-400"
                )}>
                   <CalendarIcon className="h-3 w-3" />
                   {isOverdue ? 'Overdue: ' : 'Due: '}
                   {format(dueDate, 'MMM d, yyyy')}
                </div>
             )}
             
             <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize h-5 px-2 text-[9px] font-black tracking-widest bg-primary/5 text-primary border-none">
                  {task.status}
                </Badge>
                {task.description && (
                  <>
                    <div className="h-1 w-1 bg-slate-200 rounded-full" />
                    <span className="text-[10px] font-medium text-slate-400 truncate max-w-[200px]">{task.description}</span>
                  </>
                )}
             </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

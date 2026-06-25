
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Calendar as CalendarIcon, User, Briefcase, Zap } from 'lucide-react';
import { createNotification } from '@/lib/notifications';
import Link from 'next/link';

const STATUSES = ["Pending", "In Progress", "Completed"];
const PRIORITIES = ["Low", "Medium", "High"];
const BASIC_PLAN_TASK_LIMIT = 5;

interface NewTaskDialogProps {
  editingTask?: any;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  initialDealId?: string;
  initialContactId?: string;
}

export function NewTaskDialog({ editingTask, onSuccess, trigger, initialDealId, initialContactId }: NewTaskDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [totalTasksCount, setTotalTasksCount] = useState(0);
  const [userPlan, setUserPlan] = useState('basic');
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dealId: initialDealId || '',
    contactId: initialContactId || '',
    status: 'Pending',
    priority: 'Medium',
    dueDate: ''
  });

  const isLimitReached = !editingTask && userPlan === 'basic' && totalTasksCount >= BASIC_PLAN_TASK_LIMIT;

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      return;
    }

    if (isOpen && !isInitialized) {
      if (editingTask) {
        setFormData({
          title: editingTask.title || '',
          description: editingTask.description || '',
          dealId: editingTask.dealId || '',
          contactId: editingTask.contactId || '',
          status: editingTask.status || 'Pending',
          priority: editingTask.priority || 'Medium',
          dueDate: editingTask.dueDate ? new Date(editingTask.dueDate.seconds * 1000).toISOString().split('T')[0] : ''
        });
      } else {
        setFormData({
          title: '',
          description: '',
          dealId: initialDealId || '',
          contactId: initialContactId || '',
          status: 'Pending',
          priority: 'Medium',
          dueDate: ''
        });
      }
      setIsInitialized(true);
    }
  }, [isOpen, editingTask, isInitialized, initialDealId, initialContactId]);

  useEffect(() => {
    async function loadWorkspaceData() {
      if (!firestore || !user?.uid || !isOpen) return;
      try {
        const [dealsSnap, contactsSnap, userSnap, tasksSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid))),
          getDocs(query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid))),
          getDoc(doc(firestore, 'users', user.uid)),
          getDocs(query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid)))
        ]);
        
        setDeals(dealsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setContacts(contactsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setTotalTasksCount(tasksSnap.size);
        
        if (userSnap.exists()) {
          setUserPlan(userSnap.data().plan || 'basic');
        }
      } catch (e) {
        console.error("Error loading workspace data for task:", e);
      }
    }
    loadWorkspaceData();
  }, [firestore, user?.uid, isOpen]);

  const logActivity = (taskId: string, details: string) => {
    if (!firestore) return;
    addDoc(collection(firestore, 'tasks', taskId, 'activities'), {
      details,
      createdAt: serverTimestamp()
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    if (isLimitReached) {
      toast({ title: "Limit Reached", description: `You have reached your Basic Plan limit of ${BASIC_PLAN_TASK_LIMIT} tasks.`, variant: "destructive" });
      return;
    }

    setIsSaving(true);
    
    const selectedContact = contacts.find(c => c.id === formData.contactId);
    const selectedDeal = deals.find(d => d.id === formData.dealId);

    const taskData = {
      ...formData,
      ownerUid: user.uid,
      contactName: selectedContact?.contactName || null,
      dealTitle: selectedDeal?.title || null,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : null,
      updatedAt: serverTimestamp(),
      ...(editingTask ? {} : { createdAt: serverTimestamp() }),
      completedAt: formData.status === 'Completed' ? serverTimestamp() : null
    };

    try {
      if (editingTask) {
        await updateDoc(doc(firestore, 'tasks', editingTask.id), taskData);
        logActivity(editingTask.id, "Task details updated");
        toast({ title: "Task Updated" });
      } else {
        const newDoc = await addDoc(collection(firestore, 'tasks'), taskData);
        logActivity(newDoc.id, "Task created and added to workspace");
        toast({ title: "Task Created" });
        
        createNotification(firestore, {
          recipientUid: user.uid,
          actorUid: user.uid,
          type: 'system',
          title: 'Task Created',
          message: `Task: "${formData.title}" added for ${taskData.contactName || 'Workspace'}.`,
          targetId: 'tasks',
          targetType: 'user'
        });
      }
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: editingTask ? `tasks/${editingTask.id}` : 'tasks',
        operation: editingTask ? 'update' : 'create',
        requestResourceData: taskData
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> New Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-[2.5rem]">
        {isLimitReached ? (
           <div className="py-12 text-center space-y-6">
              <div className="p-4 bg-primary/10 rounded-full w-fit mx-auto">
                <Zap className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Task Limit Reached</h3>
                <p className="text-slate-500 font-medium px-4">
                  You have reached your Basic Plan limit of {BASIC_PLAN_TASK_LIMIT} tasks. 
                  Complete your current items or upgrade to Pro for unlimited workspace tasks.
                </p>
              </div>
              <Button className="rounded-xl h-12 px-8 font-bold" asChild>
                <Link href="/dashboard/billing">View Plans & Upgrade</Link>
              </Button>
           </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">{editingTask ? 'Edit Task' : 'Add New Task'}</DialogTitle>
              <DialogDescription>Set reminders for contacts and deals to stay on top of your workflow.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskTitle">Task Title</Label>
                  <Input 
                    id="taskTitle" 
                    required 
                    placeholder="e.g. Call client for follow-up"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact">Related Contact (Who is this for?)</Label>
                    <Select value={formData.contactId} onValueChange={v => setFormData({...formData, contactId: v})}>
                      <SelectTrigger id="contact">
                        <SelectValue placeholder="Select Contact" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.contactName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deal">Related Deal (Optional)</Label>
                    <Select value={formData.dealId} onValueChange={v => setFormData({...formData, dealId: v})}>
                      <SelectTrigger id="deal">
                        <SelectValue placeholder="No Deal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Deal</SelectItem>
                        {deals.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input 
                        id="dueDate" 
                        type="date"
                        className="pl-10"
                        value={formData.dueDate}
                        onChange={e => setFormData({...formData, dueDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={v => setFormData({...formData, priority: v})}>
                      <SelectTrigger id="priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v})}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desc">Notes & Description</Label>
                  <Textarea 
                    id="desc" 
                    rows={3}
                    placeholder="What needs to be discussed or done?"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSaving} className="w-full rounded-xl h-12 font-black">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  {editingTask ? 'Update Task' : 'Add Task'}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

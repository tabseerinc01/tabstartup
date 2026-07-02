
'use client';

import { useState } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { 
  CheckSquare, 
  Plus, 
  Loader2, 
  Circle, 
  CheckCircle2, 
  Trash2,
  ListTodo
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';

export function SessionActionItems({ session, isMentor, isFounder }: { session: any, isMentor: boolean, isFounder: boolean }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [newItem, setNewItem] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const actionItemsQ = useMemoFirebase(() => {
    if (!firestore || !session.id) return null;
    return query(
      collection(firestore, 'mentorshipSessions', session.id, 'actionItems'),
      orderBy('createdAt', 'asc')
    );
  }, [firestore, session.id]);

  const { data: items, isLoading } = useCollection(actionItemsQ);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !newItem.trim() || isAdding) return;

    setIsAdding(true);
    try {
      await addDoc(collection(firestore, 'mentorshipSessions', session.id, 'actionItems'), {
        title: newItem.trim(),
        status: 'Pending',
        authorUid: user!.uid,
        createdAt: serverTimestamp()
      });
      setNewItem('');
    } catch (e) {
      toast({ title: "Failed to add item", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const toggleStatus = async (item: any) => {
    if (!firestore) return;
    const newStatus = item.status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await updateDoc(doc(firestore, 'mentorshipSessions', session.id, 'actionItems', item.id), {
        status: newStatus
      });

      if (newStatus === 'Completed' && isFounder) {
        createNotification(firestore, {
          recipientUid: session.mentorUid,
          actorUid: user!.uid,
          type: 'connection',
          title: 'Action Item Completed',
          message: `Founder completed: ${item.title}`,
          targetId: session.id,
          targetType: 'user'
        });
      }
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <section className="space-y-6">
       <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
             <ListTodo className="h-4 w-4" /> Shared Action Items
          </h3>
          <span className="text-[10px] font-bold text-slate-300 uppercase">
            {items?.filter(i => i.status === 'Completed').length || 0} / {items?.length || 0} Done
          </span>
       </div>

       <div className="space-y-3">
          {items && items.map((item) => (
            <div 
              key={item.id} 
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl ring-1 ring-slate-100 transition-all",
                item.status === 'Completed' ? "bg-green-50/30 opacity-60" : "bg-white hover:ring-primary/20"
              )}
            >
               <button 
                onClick={() => toggleStatus(item)}
                className={cn(
                  "shrink-0 transition-colors",
                  item.status === 'Completed' ? "text-green-600" : "text-slate-200 hover:text-primary"
                )}
               >
                 {item.status === 'Completed' ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
               </button>
               <span className={cn(
                 "flex-1 text-sm font-bold truncate",
                 item.status === 'Completed' ? "line-through text-slate-400" : "text-slate-700"
               )}>
                 {item.title}
               </span>
            </div>
          ))}

          {isLoading && <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary opacity-20" />}
          
          {!isLoading && (!items || items.length === 0) && (
            <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
               <p className="text-[10px] font-bold text-slate-300 uppercase">No action items defined</p>
            </div>
          )}
       </div>

       {session.status !== 'Completed' && (
         <form onSubmit={handleAddItem} className="flex gap-2">
            <Input 
              placeholder="Assign a task..." 
              value={newItem} 
              onChange={e => setNewItem(e.target.value)} 
              className="h-11 rounded-xl bg-slate-50/50 border-slate-100 focus-visible:ring-primary/20"
            />
            <Button type="submit" size="icon" disabled={!newItem.trim() || isAdding} className="rounded-xl h-11 w-11 shrink-0">
               {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
            </Button>
         </form>
       )}
    </section>
  );
}

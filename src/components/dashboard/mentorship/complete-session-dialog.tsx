
'use client';

import { useState } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Rocket, Lightbulb, Target } from 'lucide-react';
import { createNotification } from '@/lib/notifications';

export function CompleteSessionDialog({ session }: { session: any }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    summary: '',
    keyLearnings: '',
    nextSteps: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || isSaving) return;

    setIsSaving(true);
    const updateData = {
      ...formData,
      status: 'Completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await updateDoc(doc(firestore, 'mentorshipSessions', session.id), updateData);
      
      // Notify Founder
      createNotification(firestore, {
        recipientUid: session.founderUid,
        actorUid: session.mentorUid,
        type: 'connection',
        title: 'Session Summary Ready',
        message: `Your session summary for "${session.title}" is now available.`,
        targetId: session.id,
        targetType: 'user'
      });

      toast({ title: "Session Completed", description: "Summary shared with the founder." });
      setIsOpen(false);
    } catch (error: any) {
      toast({ title: "Update Failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl h-11 gap-2 font-black bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-200">
          <CheckCircle2 className="h-4 w-4" /> Finalize Session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] rounded-[2.5rem]">
        <DialogHeader>
           <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-xl">
                 <Rocket className="h-5 w-5 text-green-600" />
              </div>
              <DialogTitle className="text-2xl font-black">Session Intelligence</DialogTitle>
           </div>
           <DialogDescription>Capture the impact and strategic next steps from this meeting.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
           <div className="space-y-4">
              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5" /> Key Learnings
                 </Label>
                 <Textarea required placeholder="What were the main breakthroughs?" rows={3} value={formData.keyLearnings} onChange={e => setFormData({...formData, keyLearnings: e.target.value})} className="rounded-xl p-4" />
              </div>
              
              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                    <Target className="h-3.5 w-3.5" /> Next Strategic Steps
                 </Label>
                 <Textarea required placeholder="Immediate actions for the founder..." rows={3} value={formData.nextSteps} onChange={e => setFormData({...formData, nextSteps: e.target.value})} className="rounded-xl p-4" />
              </div>

              <div className="space-y-2">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Executive Summary</Label>
                 <Textarea placeholder="High-level overview of the discussion..." rows={2} value={formData.summary} onChange={e => setFormData({...formData, summary: e.target.value})} className="rounded-xl p-4 bg-slate-50/50" />
              </div>
           </div>

           <DialogFooter>
              <Button type="submit" disabled={isSaving} className="w-full h-12 rounded-xl font-black shadow-xl">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Archive & Share Summary
              </Button>
           </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

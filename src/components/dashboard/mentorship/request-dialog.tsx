
'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
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
import { Loader2, GraduationCap, Rocket, Send, ShieldCheck } from 'lucide-react';
import { createNotification } from '@/lib/notifications';

interface MentorshipRequestDialogProps {
  mentor: any;
  existingRequest?: any;
  trigger?: React.ReactNode;
}

export function MentorshipRequestDialog({ mentor, existingRequest, trigger }: MentorshipRequestDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startups, setStartups] = useState<any[]>([]);
  const [isLoadingStartups, setIsLoadingStartups] = useState(false);

  const [formData, setFormData] = useState({
    startupId: '',
    subject: '',
    message: '',
    goals: ''
  });

  useEffect(() => {
    async function loadStartups() {
      if (!firestore || !user?.uid || !isOpen) return;
      setIsLoadingStartups(true);
      try {
        const q = query(collection(firestore, 'startups'), where('ownerUid', '==', user.uid));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setStartups(list);
        if (list.length === 1) {
          setFormData(prev => ({ ...prev, startupId: list[0].id }));
        }
      } catch (e) {
        console.error("Error loading startups:", e);
      } finally {
        setIsLoadingStartups(false);
      }
    }
    loadStartups();
  }, [firestore, user?.uid, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSubmitting) return;

    if (!formData.startupId) {
      toast({ title: "Selection Required", description: "Please select your startup.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const requestData = {
      mentorUid: mentor.id,
      founderUid: user.uid,
      startupId: formData.startupId,
      subject: formData.subject,
      message: formData.message,
      goals: formData.goals,
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(firestore, 'mentorshipRequests'), requestData);
      
      // Notify Mentor
      createNotification(firestore, {
        recipientUid: mentor.id,
        actorUid: user.uid,
        type: 'connection',
        title: 'New Mentorship Request',
        message: `${user.displayName || 'A founder'} requested your mentorship for their venture.`,
        targetId: docRef.id,
        targetType: 'user'
      });

      toast({ title: "Request Sent", description: "The mentor has been notified of your inquiry." });
      setIsOpen(false);
      setFormData({ startupId: '', subject: '', message: '', goals: '' });
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'mentorshipRequests',
        operation: 'create',
        requestResourceData: requestData
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-xl h-11 gap-2 shadow-lg shadow-primary/20">
            <GraduationCap className="h-4 w-4" /> Request Mentorship
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] rounded-[2.5rem]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-xl">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black">Request Guidance</DialogTitle>
          </div>
          <DialogDescription>
            Share your vision and goals with {mentor.fullName} to start a mentorship relationship.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="startup" className="text-xs font-bold uppercase tracking-widest text-slate-400">Target Venture</Label>
              <Select 
                value={formData.startupId} 
                onValueChange={val => setFormData({ ...formData, startupId: val })}
              >
                <SelectTrigger id="startup" className="h-12 rounded-xl">
                  <SelectValue placeholder={isLoadingStartups ? "Loading ventures..." : "Select your startup"} />
                </SelectTrigger>
                <SelectContent>
                  {startups.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                  {startups.length === 0 && !isLoadingStartups && (
                    <SelectItem value="none" disabled>No active startups found. Please create one first.</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject" className="text-xs font-bold uppercase tracking-widest text-slate-400">Request Subject</Label>
              <Input 
                id="subject" 
                required 
                placeholder="e.g. Fundraising Strategy & Market Expansion"
                className="h-12 rounded-xl"
                value={formData.subject}
                onChange={e => setFormData({ ...formData, subject: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="text-xs font-bold uppercase tracking-widest text-slate-400">Introduction</Label>
              <Textarea 
                id="message" 
                required 
                placeholder="Why are you seeking mentorship from this specific expert?"
                rows={3}
                className="rounded-xl p-4"
                value={formData.message}
                onChange={e => setFormData({ ...formData, message: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goals" className="text-xs font-bold uppercase tracking-widest text-slate-400">Specific Goals</Label>
              <Textarea 
                id="goals" 
                required 
                placeholder="What 2-3 specific outcomes are you hoping for?"
                rows={3}
                className="rounded-xl p-4"
                value={formData.goals}
                onChange={e => setFormData({ ...formData, goals: e.target.value })}
              />
            </div>
          </div>

          <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-start gap-3">
             <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
             <p className="text-[11px] text-slate-600 leading-relaxed">
               Requests are private and visible only to you and the mentor. Once accepted, you'll be able to schedule sessions and message directly.
             </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || startups.length === 0} className="w-full h-12 rounded-xl font-bold shadow-xl shadow-primary/20">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Mentorship Inquiry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

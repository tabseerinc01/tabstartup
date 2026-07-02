
'use client';

import { useState } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
import { Loader2, Calendar, Plus, Video, Clock, Target } from 'lucide-react';
import { createNotification } from '@/lib/notifications';

const MEETING_TYPES = ["Video Call", "Google Meet", "Zoom", "Phone Call", "In Person", "Other"];

export function CreateSessionDialog({ mentorship, startup }: { mentorship: any, startup?: any }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    agenda: '',
    scheduledAt: '',
    estimatedDuration: '45',
    meetingType: 'Google Meet' as any,
    meetingLink: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid || isSaving) return;

    setIsSaving(true);
    const sessionData = {
      mentorshipId: mentorship.id,
      mentorUid: mentorship.mentorUid,
      founderUid: mentorship.founderUid,
      startupId: mentorship.startupId,
      title: formData.title,
      agenda: formData.agenda,
      scheduledAt: new Date(formData.scheduledAt),
      estimatedDuration: parseInt(formData.estimatedDuration),
      meetingType: formData.meetingType,
      meetingLink: formData.meetingLink,
      status: 'Scheduled',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(firestore, 'mentorshipSessions'), sessionData);
      
      // Notify Founder
      createNotification(firestore, {
        recipientUid: mentorship.founderUid,
        actorUid: user.uid,
        type: 'connection',
        title: 'New Session Scheduled',
        message: `Your mentor scheduled a new session: ${formData.title}.`,
        targetId: mentorship.id,
        targetType: 'user'
      });

      toast({ title: "Session Scheduled" });
      setIsOpen(false);
      setFormData({
        title: '',
        agenda: '',
        scheduledAt: '',
        estimatedDuration: '45',
        meetingType: 'Google Meet',
        meetingLink: ''
      });
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'mentorshipSessions',
        operation: 'create',
        requestResourceData: sessionData
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl h-11 gap-2 font-black shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> Schedule Meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] rounded-[2.5rem]">
        <DialogHeader>
           <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                 <Calendar className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-2xl font-black">Plan Guidance Session</DialogTitle>
           </div>
           <DialogDescription>Initialize a deep-dive session with your founder.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
           <div className="grid gap-4">
              <div className="space-y-2">
                 <Label htmlFor="title" className="text-xs font-bold uppercase tracking-widest text-slate-400">Session Title</Label>
                 <Input id="title" required placeholder="e.g. Fundraising Strategy Sync" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="h-12 rounded-xl" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label htmlFor="date" className="text-xs font-bold uppercase tracking-widest text-slate-400">Scheduled At</Label>
                    <Input id="date" type="datetime-local" required value={formData.scheduledAt} onChange={e => setFormData({...formData, scheduledAt: e.target.value})} className="h-12 rounded-xl" />
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="duration" className="text-xs font-bold uppercase tracking-widest text-slate-400">Duration (Min)</Label>
                    <Input id="duration" type="number" required value={formData.estimatedDuration} onChange={e => setFormData({...formData, estimatedDuration: e.target.value})} className="h-12 rounded-xl" />
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label htmlFor="type" className="text-xs font-bold uppercase tracking-widest text-slate-400">Platform</Label>
                    <Select value={formData.meetingType} onValueChange={v => setFormData({...formData, meetingType: v})}>
                       <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                       <SelectContent>
                          {MEETING_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                       </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-2">
                    <Label htmlFor="link" className="text-xs font-bold uppercase tracking-widest text-slate-400">Meeting URL</Label>
                    <Input id="link" placeholder="https://..." value={formData.meetingLink} onChange={e => setFormData({...formData, meetingLink: e.target.value})} className="h-12 rounded-xl" />
                 </div>
              </div>

              <div className="space-y-2">
                 <Label htmlFor="agenda" className="text-xs font-bold uppercase tracking-widest text-slate-400">Meeting Agenda</Label>
                 <Textarea id="agenda" required placeholder="What will be covered in this session?" rows={3} value={formData.agenda} onChange={e => setFormData({...formData, agenda: e.target.value})} className="rounded-xl" />
              </div>
           </div>

           <DialogFooter>
              <Button type="submit" disabled={isSaving} className="w-full h-12 rounded-xl font-black shadow-xl shadow-primary/20">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                Confirm Schedule
              </Button>
           </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, addDoc, serverTimestamp, getDocs, doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Plus, Clock, CheckCircle2, User, MoreVertical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

export default function MentorshipSessionsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeFounders, setActiveFounders] = useState<any[]>([]);
  const [isLoadingFounders, setIsLoadingFounders] = useState(false);
  
  const [formData, setFormData] = useState({ 
    founderUid: '', 
    founderName: '', 
    scheduledAt: '', 
    notes: '' 
  });

  // Scoped query for security rule compliance
  // Temporarily removing orderBy to avoid index-related permission issues during prototyping
  const sessionsQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'mentorshipSessions'),
      where('mentorUid', '==', user.uid)
    );
  }, [firestore, user?.uid]);

  const { data: rawSessions, isLoading } = useCollection(sessionsQuery);

  // Client-side sorting
  const sessions = useMemo(() => {
    if (!rawSessions) return [];
    return [...rawSessions].sort((a, b) => {
      const dateA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const dateB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [rawSessions]);

  // Load active founders for selection
  useEffect(() => {
    async function loadFounders() {
      if (!firestore || !user?.uid || !isAddOpen) return;
      setIsLoadingFounders(true);
      try {
        const q = query(
          collection(firestore, 'connections'),
          where('recipientUid', '==', user.uid),
          where('type', '==', 'mentor'),
          where('status', '==', 'accepted')
        );
        const snap = await getDocs(q);
        setActiveFounders(snap.docs.map(d => ({ id: d.data().initiatorUid, ...d.data() })));
      } catch (e) {
        console.error("Founders fetch failed:", e);
      } finally {
        setIsLoadingFounders(false);
      }
    }
    loadFounders();
  }, [firestore, user?.uid, isAddOpen]);

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid) return;
    
    if (!formData.founderUid) {
      toast({ title: "Selection Required", description: "Please select a founder.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(firestore, 'mentorshipSessions'), {
        mentorUid: user.uid,
        founderUid: formData.founderUid,
        founderName: formData.founderName,
        scheduledAt: formData.scheduledAt,
        notes: formData.notes,
        status: 'scheduled',
        createdAt: serverTimestamp()
      });
      toast({ title: "Session Scheduled" });
      setIsAddOpen(false);
      setFormData({ founderUid: '', founderName: '', scheduledAt: '', notes: '' });
    } catch (e) {
      console.error("Session creation failed:", e);
      toast({ title: "Error", description: "Could not schedule session.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Sessions...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <Calendar className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Guidance Sessions</h1>
            <p className="text-sm font-medium text-slate-500">Log and schedule your mentorship interactions.</p>
          </div>
        </div>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl h-11 gap-2 font-bold shadow-lg shadow-primary/20">
               <Plus className="h-4 w-4" /> Log Session
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2rem]">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Record Session</DialogTitle>
              <DialogDescription>Add details for an upcoming or past mentorship session.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddSession} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Founder</Label>
                <Select 
                  value={formData.founderUid} 
                  onValueChange={(val) => {
                    const f = activeFounders.find(f => f.id === val);
                    setFormData({...formData, founderUid: val, founderName: f?.initiatorName || 'Founder'});
                  }}
                >
                   <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={isLoadingFounders ? "Loading..." : "Choose a founder"} />
                   </SelectTrigger>
                   <SelectContent>
                      {activeFounders.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.initiatorName || `Founder (${f.id.slice(0,5)})`}</SelectItem>
                      ))}
                      {activeFounders.length === 0 && !isLoadingFounders && (
                        <SelectItem value="manual" disabled>No active connections found</SelectItem>
                      )}
                   </SelectContent>
                </Select>
              </div>

              {!formData.founderUid && (
                <div className="space-y-2">
                  <Label>Founder Name (Fallback)</Label>
                  <Input 
                    value={formData.founderName} 
                    onChange={e => setFormData({...formData, founderName: e.target.value})} 
                    placeholder="Manually enter name if not in list" 
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Scheduled Time</Label>
                <Input type="datetime-local" value={formData.scheduledAt} onChange={e => setFormData({...formData, scheduledAt: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Private Notes</Label>
                <Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Key takeaways..." />
              </div>
              <DialogFooter className="pt-4">
                <Button type="submit" className="w-full h-12 rounded-xl font-bold" disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Confirm Entry
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <Card key={session.id} className="border-none shadow-sm hover:shadow-md transition-all rounded-3xl bg-background ring-1 ring-slate-100 overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-6">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/5 rounded-xl text-primary">
                         <Clock className="h-5 w-5" />
                      </div>
                      <div>
                         <h3 className="font-black text-slate-900">{session.founderName}</h3>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                           {session.scheduledAt ? format(new Date(session.scheduledAt), 'PPP p') : 'Pending'}
                         </p>
                      </div>
                   </div>
                   <Badge variant="outline" className="rounded-lg bg-green-50 text-green-700 border-none font-bold text-[10px] h-6 px-3">{session.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-32 text-center space-y-6 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-100">
             <Calendar className="h-12 w-12 text-slate-200 mx-auto" />
             <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">No sessions logged yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

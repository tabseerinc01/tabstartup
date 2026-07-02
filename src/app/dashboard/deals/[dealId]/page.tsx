
'use client';

import { useState, useEffect } from 'react';
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
  getDoc,
  deleteDoc,
  limit
} from 'firebase/firestore';
import { 
  Loader2, 
  Briefcase, 
  ArrowLeft, 
  Clock, 
  ShieldCheck, 
  Rocket, 
  MessageSquare, 
  Plus, 
  History,
  FileText,
  CheckCircle2,
  Lock,
  ChevronRight,
  TrendingUp,
  LayoutGrid,
  CheckSquare,
  FileUp,
  Send,
  Trash2,
  ExternalLink,
  Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const STAGES = ["Discovery", "Due Diligence", "Negotiation", "Committed", "Closed", "Cancelled"];

export default function DealRoomPage() {
  const { dealId } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('overview');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // 1. Load Deal Room Data
  const dealRef = useMemoFirebase(() => {
    if (!firestore || !dealId) return null;
    return doc(firestore, 'dealRooms', dealId as string);
  }, [firestore, dealId]);
  const { data: deal, isLoading: isDLoading } = useDoc(dealRef);

  // 2. Load Profiles
  const [profiles, setProfiles] = useState<any>(null);
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || !deal) return;
      const [fSnap, iSnap, sSnap] = await Promise.all([
        getDoc(doc(firestore, 'users', deal.founderUid)),
        getDoc(doc(firestore, 'users', deal.investorUid)),
        getDoc(doc(firestore, 'startups', deal.startupId))
      ]);
      setProfiles({
        founder: fSnap.data(),
        investor: iSnap.data(),
        startup: sSnap.data()
      });
    }
    loadProfiles();
  }, [firestore, deal]);

  const isFounder = user?.uid === deal?.founderUid;
  const isInvestor = user?.uid === deal?.investorUid;

  const handleUpdateStatus = async (status: string) => {
    if (!firestore || !dealId || isUpdating) return;
    setIsUpdating(true);
    try {
      await updateDoc(doc(firestore, 'dealRooms', dealId as string), {
        status,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(firestore, 'dealRooms', dealId as string, 'timeline'), {
        type: 'stage_change',
        details: `Deal progressed to ${status}.`,
        createdAt: serverTimestamp()
      });

      const targetUid = isFounder ? deal.investorUid : deal.founderUid;
      createNotification(firestore, {
        recipientUid: targetUid,
        actorUid: user!.uid,
        type: 'connection',
        title: 'Deal Stage Updated',
        message: `The funding deal has moved to: ${status}`,
        targetId: dealId as string,
        targetType: 'user'
      });

      toast({ title: "Stage Updated" });
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isDLoading || !profiles) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4">Securing Workspace...</p>
      </div>
    );
  }

  if (!isFounder && !isInvestor) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center space-y-6">
        <Lock className="h-12 w-12 text-destructive opacity-20" />
        <h2 className="text-2xl font-black text-slate-900">Private Deal Room</h2>
        <p className="text-slate-500">Only the involved founder and investor have access to this room.</p>
        <Button onClick={() => router.push('/dashboard')}>Return to Safety</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <Button variant="ghost" onClick={() => router.push('/dashboard/deals')} className="gap-2 -ml-4 hover:bg-slate-100 rounded-full font-bold text-slate-500 mb-2">
            <ArrowLeft className="h-4 w-4" /> My Deals
          </Button>
          <div className="flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl">
                <Briefcase className="h-7 w-7" />
             </div>
             <h1 className="text-4xl font-black tracking-tight text-slate-900">{profiles.startup.name} Deal Room</h1>
          </div>
        </div>

        <div className="flex gap-2">
           <Button variant="outline" className="rounded-xl font-bold border-slate-200" asChild>
             <Link href={`/dashboard/messages?startWith=${isFounder ? deal.investorUid : deal.founderUid}`}>
                <MessageSquare className="h-4 w-4 mr-2" /> Open Chat
             </Link>
           </Button>
           <div className="flex bg-slate-100 p-1 rounded-xl">
              {STAGES.map(s => (
                <Button 
                  key={s} 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleUpdateStatus(s)}
                  className={cn(
                    "h-8 text-[9px] font-black rounded-lg px-3 transition-all",
                    deal.status === s ? "bg-white text-primary shadow-sm" : "text-slate-400"
                  )}
                >
                  {s.toUpperCase()}
                </Button>
              ))}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-12">
          <Tabs defaultValue="notes" className="space-y-8" onValueChange={setActiveTab}>
             <TabsList className="bg-slate-100 p-1 rounded-2xl w-fit h-auto flex gap-1">
                <TabsTrigger value="notes" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">Notes</TabsTrigger>
                <TabsTrigger value="documents" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">Documents</TabsTrigger>
                <TabsTrigger value="checklist" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">DD Checklist</TabsTrigger>
                <TabsTrigger value="timeline" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">Timeline</TabsTrigger>
             </TabsList>

             <TabsContent value="notes">
                <DealNotes dealId={deal.id} user={user} />
             </TabsContent>
             <TabsContent value="documents">
                <DealDocuments dealId={deal.id} user={user} isFounder={isFounder} />
             </TabsContent>
             <TabsContent value="checklist">
                <DealChecklist dealId={deal.id} user={user} isFounder={isFounder} isInvestor={isInvestor} />
             </TabsContent>
             <TabsContent value="timeline">
                <DealTimeline dealId={deal.id} />
             </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-4 space-y-8">
           <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white p-8 space-y-8 relative overflow-hidden group">
              <div className="relative z-10 space-y-6">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">Active Deal Room</p>
                    <p className="text-xl font-black flex items-center gap-2">
                       <Rocket className="h-5 w-5 text-primary" /> {profiles.startup.name}
                    </p>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10">
                       <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold">
                          {profiles.investor.fullName[0]}
                       </div>
                       <div>
                          <p className="text-xs font-black">{profiles.investor.fullName}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase">Capital Partner</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10">
                       <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {profiles.founder.fullName[0]}
                       </div>
                       <div>
                          <p className="text-xs font-black">{profiles.founder.fullName}</p>
                          <p className="text-[8px] font-bold text-slate-500 uppercase">Founder Lead</p>
                       </div>
                    </div>
                 </div>
              </div>
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-16 -mt-16" />
           </Card>

           <Card className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 p-8 space-y-6">
              <div className="space-y-2">
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Relationship Status</p>
                 <Badge className="w-full justify-center h-10 rounded-xl font-black bg-primary text-white border-none shadow-lg shadow-primary/20">{deal.status}</Badge>
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Created</p>
                 <p className="text-sm font-bold text-slate-700">{deal.createdAt?.toDate().toLocaleDateString()}</p>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
}

function DealNotes({ dealId, user }: any) {
  const firestore = useFirestore();
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const notesQ = useMemoFirebase(() => query(collection(firestore, 'dealRooms', dealId, 'notes'), orderBy('createdAt', 'desc')), [dealId]);
  const { data: notes } = useCollection(notesQ);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await addDoc(collection(firestore, 'dealRooms', dealId, 'notes'), {
        content: newNote.trim(),
        authorUid: user.uid,
        authorName: user.displayName || 'User',
        createdAt: serverTimestamp()
      });
      setNewNote('');
    } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-xl rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
        <form onSubmit={handleAddNote}>
          <Textarea 
            placeholder="Capture strategy insights or meeting summaries..." 
            className="min-h-[120px] p-8 border-none shadow-none focus-visible:ring-0 text-lg font-medium italic"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
          />
          <CardFooter className="bg-slate-50/50 p-6 border-t flex justify-end">
            <Button type="submit" disabled={!newNote.trim() || isSaving} className="rounded-xl h-10 px-6 font-bold gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Save Note
            </Button>
          </CardFooter>
        </form>
      </Card>

      <div className="space-y-4">
        {notes?.map(n => (
          <Card key={n.id} className="border-none shadow-sm rounded-2xl bg-white p-6">
            <div className="flex justify-between items-start mb-2">
               <span className="text-[10px] font-black text-slate-400 uppercase">By {n.authorName}</span>
               <span className="text-[10px] font-bold text-slate-300 uppercase">{n.createdAt?.toDate ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true }) : 'Now'}</span>
            </div>
            <p className="text-slate-700 leading-relaxed font-medium">{n.content}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DealDocuments({ dealId, user, isFounder }: any) {
  const firestore = useFirestore();
  const [isAdding, setIsAdding] = useState(false);
  const [docData, setDocData] = useState({ name: '', url: '', type: 'Pitch Deck' });

  const docsQ = useMemoFirebase(() => query(collection(firestore, 'dealRooms', dealId, 'documents'), orderBy('createdAt', 'desc')), [dealId]);
  const { data: docs } = useCollection(docsQ);

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(firestore, 'dealRooms', dealId, 'documents'), {
        ...docData,
        authorUid: user.uid,
        createdAt: serverTimestamp()
      });
      await addDoc(collection(firestore, 'dealRooms', dealId, 'timeline'), {
        type: 'doc_upload',
        details: `${isFounder ? 'Founder' : 'Investor'} linked ${docData.type}: ${docData.name}`,
        createdAt: serverTimestamp()
      });
      setDocData({ name: '', url: '', type: 'Pitch Deck' });
      setIsAdding(false);
      toast({ title: "Document Linked" });
    } catch (e) { toast({ title: "Failed to link", variant: "destructive" }); }
  };

  const types = ["Pitch Deck", "Financial Model", "Cap Table", "Business Plan", "Term Sheet", "Other"];

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Shared Assets</h3>
          <Button onClick={() => setIsAdding(!isAdding)} variant="outline" className="rounded-xl font-bold gap-2">
             {isAdding ? <X className="h-4 w-4" /> : <><Plus className="h-4 w-4" /> Link Document</>}
          </Button>
       </div>

       {isAdding && (
         <Card className="border-none shadow-xl rounded-3xl p-8 bg-white ring-1 ring-slate-100">
            <form onSubmit={handleAddDoc} className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                     <Label className="text-[10px] uppercase font-black text-slate-400">Resource Type</Label>
                     <Select value={docData.type} onValueChange={v => setDocData({...docData, type: v})}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                           {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-1">
                     <Label className="text-[10px] uppercase font-black text-slate-400">Display Name</Label>
                     <Input required placeholder="e.g. Q4 Growth Model" className="rounded-xl" value={docData.name} onChange={e => setDocData({...docData, name: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                     <Label className="text-[10px] uppercase font-black text-slate-400">Document URL</Label>
                     <Input required placeholder="https://..." className="rounded-xl" value={docData.url} onChange={e => setDocData({...docData, url: e.target.value})} />
                  </div>
               </div>
               <Button type="submit" className="w-full rounded-xl font-black h-12 shadow-lg shadow-primary/20">Initialize Link</Button>
            </form>
         </Card>
       )}

       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {docs?.map(d => (
            <Card key={d.id} className="border-none shadow-sm hover:ring-1 hover:ring-primary/20 transition-all rounded-2xl bg-white p-5 group">
               <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-primary/10 rounded-xl text-primary"><FileText className="h-5 w-5" /></div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-slate-200">{d.type}</Badge>
               </div>
               <h4 className="font-black text-slate-900 truncate mb-1">{d.name}</h4>
               <p className="text-[10px] font-bold text-slate-400 uppercase mb-4">Added {d.createdAt?.toDate ? formatDistanceToNow(d.createdAt.toDate(), { addSuffix: true }) : 'Recently'}</p>
               <Button variant="outline" className="w-full rounded-xl font-bold h-9 text-xs" asChild>
                  <a href={d.url.startsWith('http') ? d.url : `https://${d.url}`} target="_blank">Access Resource <ExternalLink className="h-3 w-3 ml-2" /></a>
               </Button>
            </Card>
          ))}
       </div>
    </div>
  );
}

function DealChecklist({ dealId, user, isFounder, isInvestor }: any) {
  const firestore = useFirestore();
  const [newItem, setNewItem] = useState('');

  const checklistQ = useMemoFirebase(() => query(collection(firestore, 'dealRooms', dealId, 'checklist'), orderBy('createdAt', 'asc')), [dealId]);
  const { data: items } = useCollection(checklistQ);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim() || !isFounder) return;
    try {
      await addDoc(collection(firestore, 'dealRooms', dealId, 'checklist'), {
        title: newItem.trim(),
        status: 'Pending',
        createdAt: serverTimestamp()
      });
      setNewItem('');
    } catch (e) {}
  };

  const toggleStatus = async (item: any) => {
    const newStatus = item.status === 'Completed' ? 'Pending' : 'Completed';
    try {
      await updateDoc(doc(firestore, 'dealRooms', dealId, 'checklist', item.id), { status: newStatus });
      
      await addDoc(collection(firestore, 'dealRooms', dealId, 'timeline'), {
        type: 'checklist_update',
        details: `${isFounder ? 'Founder' : 'Investor'} marked "${item.title}" as ${newStatus}`,
        createdAt: serverTimestamp()
      });

      // Notification
      createNotification(firestore, {
        recipientUid: isFounder ? deal.investorUid : deal.founderUid,
        actorUid: user.uid,
        type: 'connection',
        title: 'Checklist Progress',
        message: `${user.displayName} updated the due diligence checklist.`,
        targetId: dealId,
        targetType: 'user'
      });
    } catch (e) {}
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center px-2">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2"><CheckSquare className="h-5 w-5 text-primary" /> Due Diligence</h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{items?.filter(i => i.status === 'Completed').length || 0} / {items?.length || 0} Verified</span>
       </div>

       {isFounder && (
         <form onSubmit={handleAddItem} className="flex gap-2">
            <Input placeholder="Define DD requirement (e.g. Audit Reports)..." className="rounded-xl h-11" value={newItem} onChange={e => setNewItem(e.target.value)} />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl shrink-0"><Plus className="h-5 w-5" /></Button>
         </form>
       )}

       <div className="space-y-3">
          {items?.map(item => (
            <div key={item.id} className={cn(
              "flex items-center gap-4 p-4 rounded-2xl ring-1 ring-slate-100 transition-all",
              item.status === 'Completed' ? "bg-green-50/30 opacity-60" : "bg-white"
            )}>
               <button onClick={() => toggleStatus(item)} className={cn("shrink-0", item.status === 'Completed' ? "text-green-600" : "text-slate-200 hover:text-primary")}>
                 {item.status === 'Completed' ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-5 w-5 rounded-full border-2 border-current" />}
               </button>
               <span className={cn("text-sm font-bold", item.status === 'Completed' && "line-through text-slate-400")}>{item.title}</span>
            </div>
          ))}
       </div>
    </div>
  );
}

function DealTimeline({ dealId }: any) {
  const firestore = useFirestore();
  const timelineQ = useMemoFirebase(() => query(collection(firestore, 'dealRooms', dealId, 'timeline'), orderBy('createdAt', 'desc')), [dealId]);
  const { data: timeline } = useCollection(timelineQ);

  return (
    <div className="relative space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100 px-4">
       {timeline?.map(evt => (
         <div key={evt.id} className="relative flex items-start gap-6">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-background z-10 ml-[13px]" />
            <div className="min-w-0">
               <p className="text-sm font-black text-slate-900 leading-tight">{evt.details}</p>
               <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                 {evt.createdAt?.toDate ? formatDistanceToNow(evt.createdAt.toDate(), { addSuffix: true }) : 'Now'}
               </p>
            </div>
         </div>
       ))}
       <div className="relative flex items-start gap-6">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-4 ring-background z-10 ml-[13px]" />
          <p className="text-[10px] font-bold text-slate-400">Deal initiated by system.</p>
       </div>
    </div>
  );
}

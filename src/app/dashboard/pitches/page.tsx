
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Zap, 
  Loader2, 
  Check, 
  X, 
  Eye, 
  Clock, 
  Rocket, 
  User, 
  MessageSquare, 
  ArrowRight,
  ShieldCheck,
  Send,
  Inbox,
  Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function VenturePitchesPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // 1. Received: Opportunities founders initiated toward me
  const receivedQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'venturePitches'), where('recipientUid', '==', user.uid));
  }, [firestore, user?.uid]);

  // 2. Sent: Startups where I expressed interest (connection type: investor)
  const sentQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(
      collection(firestore, 'connections'), 
      where('initiatorUid', '==', user.uid),
      where('type', '==', 'investor')
    );
  }, [firestore, user?.uid]);

  const { data: rawReceived, isLoading: isReceivedLoading } = useCollection(receivedQuery);
  const { data: rawSent, isLoading: isSentLoading } = useCollection(sentQuery);

  // Auto-clear notifications when entering
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    const clearNotifications = async () => {
      const q = query(
        collection(firestore, 'notifications'),
        where('recipientUid', '==', user.uid),
        where('read', '==', false),
        where('type', 'in', ['venture_pitch', 'investor_interest'])
      );
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestore);
          snap.docs.forEach(d => batch.update(d.ref, { read: true }));
          await batch.commit();
        }
      } catch (e) { console.warn(e); }
    };
    clearNotifications();
  }, [firestore, user?.uid]);

  const handleUpdateStatus = async (id: string, collectionName: string, status: string) => {
    if (!firestore || isActionLoading) return;
    setIsActionLoading(id);

    try {
      await updateDoc(doc(firestore, collectionName, id), {
        status,
        updatedAt: serverTimestamp()
      });
      toast({ title: `Record marked as ${status}` });
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `${collectionName}/${id}`,
        operation: 'update',
        requestResourceData: { status }
      }));
    } finally {
      setIsActionLoading(null);
    }
  };

  const handleWithdraw = async (id: string) => {
    if (!firestore || isActionLoading) return;
    if (!confirm("Withdraw your interest in this startup?")) return;
    
    setIsActionLoading(id);
    try {
      await deleteDoc(doc(firestore, 'connections', id));
      toast({ title: "Interest Withdrawn" });
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `connections/${id}`,
        operation: 'delete'
      }));
    } finally {
      setIsActionLoading(null);
    }
  };

  const isLoading = isUserLoading || isReceivedLoading || isSentLoading;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Venture Pipeline...</p>
      </div>
    );
  }

  const received = (rawReceived || []).sort((a, b) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.());
  const sent = (rawSent || []).sort((a, b) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.());

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Opportunity Hub</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Interests & Pitches</h1>
          <p className="text-slate-500 font-medium">Manage incoming opportunities and your outgoing pipeline.</p>
        </div>
      </div>

      <Tabs defaultValue="received" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-full sm:w-auto h-auto flex gap-1">
          <TabsTrigger value="received" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Received {received.filter(p => p.status === 'pending').length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1">{received.filter(p => p.status === 'pending').length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Sent Pitches</TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          <div className="grid gap-6">
            {received.length > 0 ? (
              received.map((pitch) => (
                <ReceivedPitchCard 
                  key={pitch.id} 
                  pitch={pitch} 
                  onAction={handleUpdateStatus}
                  isLoading={isActionLoading === pitch.id}
                />
              ))
            ) : (
              <EmptyState message="No founders have contacted you yet." icon={Inbox} />
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="sent">
          <div className="grid gap-6">
            {sent.length > 0 ? (
              sent.map((interest) => (
                <SentInterestCard 
                  key={interest.id} 
                  interest={interest} 
                  onWithdraw={handleWithdraw}
                  isLoading={isActionLoading === interest.id}
                />
              ))
            ) : (
              <EmptyState message="You haven't expressed interest in any startups yet." icon={Send} />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceivedPitchCard({ pitch, onAction, isLoading }: any) {
  const createdAt = pitch.createdAt?.toDate ? pitch.createdAt.toDate() : new Date();
  
  return (
    <Card className="group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background ring-1 ring-slate-100">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-900">{pitch.startupName}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-primary uppercase tracking-widest">{pitch.senderName}</p>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    Received {formatDistanceToNow(createdAt, { addSuffix: true })}
                  </span>
                </div>
              </div>
              <Badge className={cn(
                "rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none",
                pitch.status === 'pending' ? "bg-amber-100 text-amber-700" :
                pitch.status === 'accepted' ? "bg-green-500 text-white" :
                pitch.status === 'reviewed' ? "bg-blue-100 text-blue-700" :
                "bg-slate-100 text-slate-400"
              )}>
                {pitch.status === 'pending' ? 'New' : pitch.status}
              </Badge>
            </div>

            <div className="bg-slate-50/50 p-6 rounded-[2rem] ring-1 ring-slate-100 relative">
               <p className="text-slate-600 leading-relaxed font-medium italic">
                 "{pitch.pitchMessage}"
               </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm" className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20" asChild>
                <Link href={`/startups/${pitch.startupId}`}>View Startup</Link>
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl h-10 px-6 font-bold border-slate-200" asChild>
                <Link href={`/founders/${pitch.senderUid}`}>View Founder</Link>
              </Button>
              <Button variant="ghost" size="sm" className="rounded-xl h-10 px-6 font-bold text-primary gap-2" asChild>
                <Link href={`/dashboard/messages?startWith=${pitch.senderUid}`}>
                   <MessageSquare className="h-4 w-4" /> Message
                </Link>
              </Button>
              
              <div className="flex-1" />

              {pitch.status !== 'accepted' && pitch.status !== 'rejected' && (
                <div className="flex gap-2">
                   <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-10 w-10 rounded-xl border-green-200 text-green-600 hover:bg-green-50"
                    onClick={() => onAction(pitch.id, 'venturePitches', 'accepted')}
                    disabled={isLoading}
                   >
                     {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                   </Button>
                   <Button 
                    size="icon" 
                    variant="outline" 
                    className="h-10 w-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => onAction(pitch.id, 'venturePitches', 'rejected')}
                    disabled={isLoading}
                   >
                     <X className="h-4 w-4" />
                   </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SentInterestCard({ interest, onWithdraw, isLoading }: any) {
  const firestore = useFirestore();
  const [startup, setStartup] = useState<any>(null);
  const [founder, setFounder] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !interest.recipientUid) return;
      const [sSnap, fSnap] = await Promise.all([
        getDoc(doc(firestore, 'startups', interest.recipientUid)),
        getDoc(doc(firestore, 'users', interest.recipientUid))
      ]);
      if (sSnap.exists()) setStartup(sSnap.data());
      if (fSnap.exists()) setFounder(fSnap.data());
    }
    loadData();
  }, [firestore, interest.recipientUid]);

  const createdAt = interest.createdAt?.toDate ? interest.createdAt.toDate() : new Date();

  return (
    <Card className="group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background ring-1 ring-slate-100">
      <CardContent className="p-8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center text-primary font-black text-2xl shadow-inner border border-primary/5">
              {startup?.name?.charAt(0) || <Rocket className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors">{startup?.name || "Loading..."}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-tight">{founder?.fullName || "Founder"}</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Interested {formatDistanceToNow(createdAt, { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
          
          <Badge className={cn(
            "rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none",
            interest.status === 'pending' ? "bg-amber-100 text-amber-700" :
            interest.status === 'accepted' ? "bg-green-100 text-green-700" :
            "bg-red-100 text-red-700"
          )}>
            {interest.status}
          </Badge>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 pt-6 border-t border-slate-50">
           <Button size="sm" className="rounded-xl h-10 px-6 font-bold" asChild>
             <Link href={`/startups/${startup?.slug || interest.recipientUid}`}>View Startup</Link>
           </Button>
           <Button variant="outline" size="sm" className="rounded-xl h-10 px-6 font-bold border-slate-200" asChild>
             <Link href={`/founders/${interest.recipientUid}`}>View Founder</Link>
           </Button>
           
           {interest.status === 'accepted' && (
             <Button variant="ghost" size="sm" className="rounded-xl h-10 px-6 font-bold text-primary gap-2" asChild>
                <Link href={`/dashboard/messages?startWith=${interest.recipientUid}`}>
                   <MessageSquare className="h-4 w-4" /> Message
                </Link>
             </Button>
           )}

           <div className="flex-1" />

           {interest.status === 'pending' && (
             <Button 
               variant="ghost" 
               size="sm" 
               className="rounded-xl h-10 px-4 font-bold text-slate-400 hover:text-destructive hover:bg-destructive/5 gap-2"
               onClick={() => onWithdraw(interest.id)}
               disabled={isLoading}
             >
               {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
               Withdraw
             </Button>
           )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message, icon: Icon }: { message: string, icon: any }) {
  return (
    <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center border-slate-200">
      <CardContent className="space-y-6">
        <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
          <Icon className="h-16 w-16 text-slate-200" />
        </div>
        <div>
          <p className="text-xl font-black text-slate-900">{message}</p>
          <p className="text-slate-500 font-medium max-w-sm mx-auto">
            Opportunities will appear here once interactions are initiated.
          </p>
        </div>
        <Button variant="outline" asChild className="rounded-full">
          <Link href="/startups">Discover Startups</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

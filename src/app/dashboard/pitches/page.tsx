
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
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
  Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function VenturePitchesPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // 1. Sent Pitches (I am the founder)
  const sentQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'venturePitches'), where('senderUid', '==', user.uid));
  }, [firestore, user?.uid]);

  // 2. Received Pitches (I am the investor)
  const receivedQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'venturePitches'), where('recipientUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: sentPitches, isLoading: isSentLoading } = useCollection(sentQuery);
  const { data: receivedPitches, isLoading: isReceivedLoading } = useCollection(receivedQuery);

  const handleUpdateStatus = async (pitchId: string, status: string) => {
    if (!firestore || isActionLoading) return;
    setIsActionLoading(pitchId);

    try {
      await updateDoc(doc(firestore, 'venturePitches', pitchId), {
        status,
        updatedAt: serverTimestamp()
      });
      toast({ title: `Pitch marked as ${status}` });
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `venturePitches/${pitchId}`,
        operation: 'update',
        requestResourceData: { status }
      }));
    } finally {
      setIsActionLoading(null);
    }
  };

  const isLoading = isUserLoading || isSentLoading || isReceivedLoading;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Venture Pipeline...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
             <div className="h-1 w-8 bg-primary rounded-full" />
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Opportunity Management</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Venture Pitches</h1>
          <p className="text-slate-500 font-medium">Manage and review official startup opportunity submissions.</p>
        </div>
      </div>

      <Tabs defaultValue="received" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-full sm:w-auto h-auto flex gap-1">
          <TabsTrigger value="received" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Received {receivedPitches && receivedPitches.length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1">{receivedPitches.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Sent Pitches</TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          <PitchList 
            items={receivedPitches || []} 
            isIncoming={true} 
            onUpdateStatus={handleUpdateStatus}
            loadingId={isActionLoading}
          />
        </TabsContent>
        
        <TabsContent value="sent">
          <PitchList 
            items={sentPitches || []} 
            isIncoming={false} 
            onUpdateStatus={handleUpdateStatus}
            loadingId={isActionLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PitchList({ items, isIncoming, onUpdateStatus, loadingId }: any) {
  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
        <CardContent className="space-y-6">
          <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
            <Zap className="h-16 w-16 text-slate-200" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">No pitches recorded</p>
            <p className="text-slate-500 font-medium">
              {isIncoming ? "You haven't received any venture pitches yet." : "You haven't submitted any pitches to investors yet."}
            </p>
          </div>
          <Button variant="outline" asChild className="rounded-full">
            <Link href="/investors">Explore Investors</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {items.sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis()).map((pitch: any) => (
        <PitchCard 
          key={pitch.id} 
          pitch={pitch} 
          isIncoming={isIncoming} 
          onUpdateStatus={onUpdateStatus}
          isLoading={loadingId === pitch.id}
        />
      ))}
    </div>
  );
}

function PitchCard({ pitch, isIncoming, onUpdateStatus, isLoading }: any) {
  const [senderProfile, setSenderProfile] = useState<any>(null);
  const firestore = useFirestore();

  useEffect(() => {
    async function loadSender() {
      if (!firestore || !pitch.senderUid) return;
      const snap = await getDoc(doc(firestore, 'users', pitch.senderUid));
      if (snap.exists()) setSenderProfile(snap.data());
    }
    loadSender();
  }, [firestore, pitch.senderUid]);

  const createdAt = pitch.createdAt?.toDate ? pitch.createdAt.toDate() : new Date();

  return (
    <Card className="group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background ring-1 ring-slate-100">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 rounded-2xl border-4 border-slate-50 shadow-md">
                   <AvatarImage src={senderProfile?.imageUrl} />
                   <AvatarFallback className="font-black bg-primary/10 text-primary">{pitch.senderName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                   <h3 className="text-xl font-black text-slate-900">{pitch.startupName}</h3>
                   <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs font-bold text-primary uppercase tracking-widest">{pitch.senderName}</p>
                      <div className="h-1 w-1 bg-slate-300 rounded-full" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                        {formatDistanceToNow(createdAt, { addSuffix: true })}
                      </span>
                   </div>
                </div>
              </div>
              <Badge className={cn(
                "rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none",
                pitch.status === 'pending' ? "bg-amber-100 text-amber-700" :
                pitch.status === 'accepted' ? "bg-green-500 text-white" :
                pitch.status === 'reviewed' ? "bg-blue-100 text-blue-700" :
                "bg-slate-100 text-slate-400"
              )}>
                {pitch.status}
              </Badge>
            </div>

            <div className="bg-slate-50/50 p-6 rounded-[2rem] ring-1 ring-slate-100 relative">
               <p className="text-slate-600 leading-relaxed font-medium italic">
                 "{pitch.pitchMessage}"
               </p>
               <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Rocket className="h-12 w-12 text-primary" />
               </div>
            </div>

            <div className="flex items-center gap-4 pt-4">
              {isIncoming && pitch.status === 'pending' && (
                <>
                  <Button 
                    className="rounded-xl h-11 px-6 font-bold gap-2 shadow-lg shadow-primary/20"
                    onClick={() => onUpdateStatus(pitch.id, 'reviewed')}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Mark Reviewed
                  </Button>
                  <Button 
                    variant="outline"
                    className="rounded-xl h-11 px-6 font-bold border-green-200 text-green-700 hover:bg-green-50 gap-2"
                    onClick={() => onUpdateStatus(pitch.id, 'accepted')}
                    disabled={isLoading}
                  >
                    <Check className="h-4 w-4" /> Accept
                  </Button>
                </>
              )}
              
              {isIncoming && pitch.status === 'reviewed' && (
                <Button 
                  className="rounded-xl h-11 px-6 font-bold bg-green-500 hover:bg-green-600 gap-2 shadow-lg shadow-green-200"
                  onClick={() => onUpdateStatus(pitch.id, 'accepted')}
                  disabled={isLoading}
                >
                  <Check className="h-4 w-4" /> Official Accept
                </Button>
              )}

              <Button variant="ghost" asChild className="rounded-xl h-11 px-6 font-bold text-slate-400 gap-2">
                <Link href={`/startups/${pitch.startupId}`}>
                   View Venture Profile <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          
          <div className="w-full md:w-64 bg-slate-900 text-white p-8 flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-800">
             <div className="space-y-6">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opportunity Ref</p>
                   <code className="text-xs font-mono text-primary">{pitch.id.slice(0, 12)}</code>
                </div>
                <div className="space-y-3">
                   <Button variant="outline" className="w-full justify-start h-10 rounded-xl bg-white/5 border-none hover:bg-white/10 text-white text-xs font-bold gap-2" asChild>
                      <Link href={`/dashboard/messages?startWith=${isIncoming ? pitch.senderUid : pitch.recipientUid}`}>
                         <MessageSquare className="h-3.5 w-3.5" /> Direct Message
                      </Link>
                   </Button>
                   <Button variant="outline" className="w-full justify-start h-10 rounded-xl bg-white/5 border-none hover:bg-white/10 text-white text-xs font-bold gap-2" asChild>
                      <Link href={isIncoming ? `/founders/${pitch.senderUid}` : `/investors/${pitch.recipientUid}`}>
                         <User className="h-3.5 w-3.5" /> View {isIncoming ? 'Founder' : 'Investor'}
                      </Link>
                   </Button>
                </div>
             </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

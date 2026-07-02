
'use client';

import { useState, useMemo } from 'react';
import { useFirestore, useUser, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, query, where, updateDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';
import { 
  GraduationCap, 
  Loader2, 
  Check, 
  X, 
  Clock, 
  User, 
  Rocket, 
  MessageSquare, 
  ArrowRight,
  ShieldCheck,
  Send,
  Inbox,
  AlertCircle
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createNotification } from '@/lib/notifications';

export default function MentorshipRequestsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // Incoming Requests (for Mentors)
  const incomingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'mentorshipRequests'), where('mentorUid', '==', user.uid));
  }, [firestore, user?.uid]);

  // Outgoing Requests (for Founders)
  const outgoingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'mentorshipRequests'), where('founderUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: rawIncoming, isLoading: isIncomingLoading } = useCollection(incomingQuery);
  const { data: rawOutgoing, isLoading: isOutgoingLoading } = useCollection(outgoingQuery);

  const handleUpdateStatus = async (id: string, status: 'Accepted' | 'Declined' | 'Cancelled') => {
    if (!firestore || !user || isActionLoading) return;
    setIsActionLoading(id);

    const request = [...(rawIncoming || []), ...(rawOutgoing || [])].find(r => r.id === id);
    if (!request) return;

    try {
      await updateDoc(doc(firestore, 'mentorshipRequests', id), {
        status,
        updatedAt: serverTimestamp()
      });

      // Phase 2: Create Active Mentorship on Acceptance
      if (status === 'Accepted') {
        const mentorshipData = {
          mentorUid: request.mentorUid,
          founderUid: request.founderUid,
          startupId: request.startupId,
          requestId: id,
          status: 'Onboarding',
          startedAt: serverTimestamp(),
          lastActivityAt: serverTimestamp()
        };
        const mRef = await addDoc(collection(firestore, 'activeMentorships'), mentorshipData);
        
        // Add Initial Timeline Event
        await addDoc(collection(firestore, 'activeMentorships', mRef.id, 'timeline'), {
          type: 'start',
          details: 'Mentorship relationship established.',
          createdAt: serverTimestamp()
        });

        toast({ title: "Mentorship Activated", description: "Relationship moved to Active Workspace." });
      }

      // Notify the other party
      const targetUid = status === 'Cancelled' ? request.mentorUid : (status === 'Accepted' ? request.founderUid : request.founderUid);
      createNotification(firestore, {
        recipientUid: targetUid,
        actorUid: user.uid,
        type: 'connection',
        title: `Mentorship Request ${status}`,
        message: status === 'Accepted' 
          ? 'Your mentorship request has been accepted! Access your new workspace under My Mentors.' 
          : status === 'Cancelled' 
            ? 'A founder has withdrawn their mentorship request.' 
            : 'Your mentorship request was not accepted at this time.',
        targetId: id,
        targetType: 'user'
      });

      toast({ title: `Request ${status}` });
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `mentorshipRequests/${id}`,
        operation: 'update',
        requestResourceData: { status }
      }));
    } finally {
      setIsActionLoading(null);
    }
  };

  const isLoading = isUserLoading || isIncomingLoading || isOutgoingLoading;

  if (isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Mentorship Hub...</p>
      </div>
    );
  }

  const incoming = (rawIncoming || []).sort((a, b) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.());
  const outgoing = (rawOutgoing || []).sort((a, b) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.());

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Mentorship Requests</h1>
            <p className="text-slate-500 font-medium">Manage incoming expertise inquiries and your outgoing requests.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={incoming.length > 0 ? "incoming" : "outgoing"} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-full sm:w-auto h-auto flex gap-1">
          <TabsTrigger value="incoming" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Incoming {incoming.filter(r => r.status === 'Pending').length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1">{incoming.filter(r => r.status === 'Pending').length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Sent Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          <div className="grid gap-6">
            {incoming.length > 0 ? (
              incoming.map((req) => (
                <RequestCard 
                  key={req.id} 
                  req={req} 
                  mode="incoming"
                  onAction={handleUpdateStatus}
                  isLoading={isActionLoading === req.id}
                />
              ))
            ) : (
              <EmptyState message="No incoming requests yet." sub="Your profile is visible in the directory. Founders will contact you soon." icon={Inbox} />
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="outgoing">
          <div className="grid gap-6">
            {outgoing.length > 0 ? (
              outgoing.map((req) => (
                <RequestCard 
                  key={req.id} 
                  req={req} 
                  mode="outgoing"
                  onAction={handleUpdateStatus}
                  isLoading={isActionLoading === req.id}
                />
              ))
            ) : (
              <EmptyState 
                message="You haven't requested mentorship yet." 
                sub="Connect with industry experts to accelerate your startup growth." 
                icon={Send} 
                cta={{ label: "Find a Mentor", href: "/mentors" }}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RequestCard({ req, mode, onAction, isLoading }: any) {
  const firestore = useFirestore();
  const [otherUser, setOtherUser] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);

  const otherUid = mode === 'incoming' ? req.founderUid : req.mentorUid;

  useEffect(() => {
    async function loadData() {
      if (!firestore || !otherUid) return;
      const [uSnap, sSnap] = await Promise.all([
        getDoc(doc(firestore, 'users', otherUid)),
        req.startupId ? getDoc(doc(firestore, 'startups', req.startupId)) : Promise.resolve(null)
      ]);
      if (uSnap.exists()) setOtherUser(uSnap.data());
      if (sSnap && sSnap.exists()) setStartup(sSnap.data());
    }
    loadData();
  }, [firestore, otherUid, req.startupId]);

  const createdAt = req.createdAt?.toDate ? req.createdAt.toDate() : new Date();

  return (
    <Card className="group overflow-hidden rounded-[2.5rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background ring-1 ring-slate-100">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          <div className="flex-1 p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 rounded-2xl border-4 border-slate-50 shadow-md">
                  <AvatarImage src={otherUser?.imageUrl} className="object-cover" />
                  <AvatarFallback className="font-black bg-primary/5 text-primary">{(otherUser?.fullName || 'U')[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-black text-slate-900 truncate">
                    {mode === 'incoming' ? otherUser?.fullName : `Mentor: ${otherUser?.fullName || 'Loading...'}`}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    <Clock className="h-3 w-3" />
                    Requested {formatDistanceToNow(createdAt, { addSuffix: true })}
                  </div>
                </div>
              </div>
              <Badge className={cn(
                "rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border-none",
                req.status === 'Pending' ? "bg-amber-100 text-amber-700" :
                req.status === 'Accepted' ? "bg-green-500 text-white" :
                req.status === 'Declined' ? "bg-red-100 text-red-700" :
                "bg-slate-100 text-slate-400"
              )}>
                {req.status}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="p-6 bg-slate-50/50 rounded-[2rem] ring-1 ring-slate-100 relative">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">{req.subject}</p>
                <p className="text-slate-600 leading-relaxed font-medium italic mb-4">
                  "{req.message}"
                </p>
                {req.goals && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Specific Goals</p>
                    <p className="text-xs text-slate-500 font-medium">{req.goals}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {startup && (
                <Button variant="outline" size="sm" className="rounded-xl h-10 px-6 font-bold border-slate-200" asChild>
                  <Link href={`/startups/${startup.slug || startup.id}`}>View Startup: {startup.name}</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" className="rounded-xl h-10 px-6 font-bold text-primary gap-2" asChild>
                <Link href={mode === 'incoming' ? `/founders/${req.founderUid}` : `/mentors/${req.mentorUid}`}>
                   <User className="h-4 w-4" /> View Profile
                </Link>
              </Button>
              
              <div className="flex-1" />

              {req.status === 'Pending' && mode === 'incoming' && (
                <div className="flex gap-2">
                   <Button 
                    className="rounded-xl h-10 px-6 font-bold shadow-lg shadow-primary/20"
                    onClick={() => onAction(req.id, 'Accepted')}
                    disabled={isLoading}
                   >
                     {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                     Accept
                   </Button>
                   <Button 
                    variant="outline" 
                    className="rounded-xl h-10 px-6 font-bold border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => onAction(req.id, 'Declined')}
                    disabled={isLoading}
                   >
                     Decline
                   </Button>
                </div>
              )}

              {req.status === 'Pending' && mode === 'outgoing' && (
                <Button 
                  variant="ghost" 
                  className="rounded-xl h-10 px-6 font-bold text-slate-400 hover:text-destructive hover:bg-destructive/5"
                  onClick={() => onAction(req.id, 'Cancelled')}
                  disabled={isLoading}
                >
                  Cancel Request
                </Button>
              )}

              {req.status === 'Accepted' && (
                <Button 
                  variant="outline" 
                  className="rounded-xl h-10 px-6 font-bold border-primary/20 text-primary gap-2" 
                  asChild
                >
                  <Link href={`/dashboard/messages?startWith=${otherUid}`}>
                    <MessageSquare className="h-4 w-4" /> Message
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message, sub, icon: Icon, cta }: any) {
  return (
    <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center border-slate-200">
      <CardContent className="space-y-6">
        <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
          <Icon className="h-16 w-16 text-slate-200" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-black text-slate-900">{message}</p>
          <p className="text-slate-500 font-medium max-w-sm mx-auto">{sub}</p>
        </div>
        {cta && (
          <Button asChild className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

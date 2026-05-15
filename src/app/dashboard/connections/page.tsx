
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError, useMemoFirebase, useCollection } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDoc, 
  doc,
  addDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Loader2, 
  MessageSquare, 
  Check, 
  X, 
  Clock, 
  MapPin, 
  Briefcase, 
  Zap, 
  ShieldCheck, 
  GraduationCap, 
  Wrench,
  ChevronRight,
  Filter,
  Eye,
  Rocket
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

type ConnType = 'all' | 'investor' | 'mentor' | 'cofounder' | 'service' | 'founder';

export default function ConnectionsManagerPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [activeType, setActiveType] = useState<ConnType>('all');
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // Fetch all connections where user is either initiator or recipient
  const incomingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('recipientUid', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user?.uid]);

  const outgoingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [firestore, user?.uid]);

  const { data: incoming, isLoading: isIncomingLoading } = useCollection(incomingQuery);
  const { data: outgoing, isLoading: isOutgoingLoading } = useCollection(outgoingQuery);

  const allConns = useMemo(() => {
    return [...(incoming || []), ...(outgoing || [])].sort((a, b) => 
      (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
  }, [incoming, outgoing]);

  // Load profiles for all participants
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || allConns.length === 0) return;
      const uids = new Set<string>();
      allConns.forEach(c => {
        uids.add(c.initiatorUid);
        uids.add(c.recipientUid);
      });

      const newProfiles = { ...profiles };
      let changed = false;
      for (const uid of Array.from(uids)) {
        if (!newProfiles[uid] && uid !== user?.uid) {
          const snap = await getDoc(doc(firestore, 'users', uid));
          if (snap.exists()) {
            newProfiles[uid] = snap.data();
            changed = true;
          }
        }
      }
      if (changed) setProfiles(newProfiles);
    }
    loadProfiles();
  }, [firestore, allConns, user?.uid]);

  const handleStatus = async (conn: any, status: 'accepted' | 'rejected') => {
    if (!firestore || !user || isActionLoading) return;
    setIsActionLoading(conn.id);
    try {
      await updateDoc(doc(firestore, 'connections', conn.id), { 
        status,
        updatedAt: serverTimestamp() 
      });

      if (status === 'accepted') {
        // Create Chat
        const otherUid = conn.initiatorUid;
        const chatsQ = query(collection(firestore, 'chats'), where('participants', 'array-contains', user.uid));
        const chatsSnap = await getDocs(chatsQ);
        let existingChatId = null;
        chatsSnap.forEach(d => {
          if (d.data().participants?.includes(otherUid)) existingChatId = d.id;
        });

        if (!existingChatId) {
          const chatRef = await addDoc(collection(firestore, 'chats'), {
            participants: [user.uid, otherUid],
            lastMessage: `You are now connected for ${conn.type}!`,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }

        // Notify Initiator
        createNotification(firestore, {
          recipientUid: otherUid,
          actorUid: user.uid,
          type: 'connection',
          title: 'Request Accepted',
          message: `${user.displayName || 'A member'} accepted your ${conn.type} request.`,
          targetId: conn.id,
          targetType: 'user'
        });

        toast({ title: "Relationship established", description: "You can now message each other." });
      } else {
        toast({ title: "Request declined" });
      }
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setIsActionLoading(null);
    }
  };

  const filtered = allConns.filter(c => activeType === 'all' || c.type === activeType);

  const pending = filtered.filter(c => c.recipientUid === user?.uid && c.status === 'pending');
  const accepted = filtered.filter(c => c.status === 'accepted');
  const sent = filtered.filter(c => c.initiatorUid === user?.uid && c.status === 'pending');
  const rejected = filtered.filter(c => c.status === 'rejected');

  if (isUserLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Relationships</h1>
          <p className="text-slate-500 font-medium">Manage your ecosystem connections and collaboration requests.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-100 overflow-x-auto">
          {(['all', 'investor', 'mentor', 'cofounder', 'service', 'founder'] as ConnType[]).map(t => (
            <Button 
              key={t}
              variant="ghost" 
              size="sm" 
              onClick={() => setActiveType(t)}
              className={cn(
                "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest",
                activeType === t ? "bg-primary text-white hover:bg-primary" : "text-slate-400"
              )}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-full sm:w-auto h-auto grid grid-cols-4 sm:flex sm:gap-1">
          <TabsTrigger value="pending" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Pending {pending.length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="accepted" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Accepted</TabsTrigger>
          <TabsTrigger value="sent" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Sent</TabsTrigger>
          <TabsTrigger value="rejected" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <ConnectionsList items={pending} profiles={profiles} onAction={handleStatus} isIncoming loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="accepted" className="space-y-4">
          <ConnectionsList items={accepted} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="sent" className="space-y-4">
          <ConnectionsList items={sent} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="rejected" className="space-y-4">
          <ConnectionsList items={rejected} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionsList({ items, profiles, onAction, isIncoming, loadingAction, currentUserId }: any) {
  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-24 text-center">
        <CardContent className="space-y-6">
          <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
            <Users className="h-12 w-12 text-slate-200" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">No requests found</p>
            <p className="text-slate-500 font-medium">Relationships will appear here when you or others reach out.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((c: any) => {
        const otherUid = c.initiatorUid === currentUserId ? c.recipientUid : c.initiatorUid;
        const profile = profiles[otherUid];
        return (
          <ConnectionCard 
            key={c.id} 
            conn={c} 
            profile={profile} 
            onAction={onAction} 
            isIncoming={isIncoming}
            isLoading={loadingAction === c.id}
          />
        );
      })}
    </div>
  );
}

function ConnectionCard({ conn, profile, onAction, isIncoming, isLoading }: any) {
  const router = useRouter();
  const name = profile?.fullName || "Member";
  const headline = profile?.headline || profile?.investorHeadline || "Ecosystem Participant";
  const avatarUrl = profile?.imageUrl || `https://picsum.photos/seed/${profile?.uid || 'user'}/200/200`;
  
  const typeIcons = {
    investor: ShieldCheck,
    mentor: GraduationCap,
    cofounder: Users,
    service: Wrench,
    founder: Rocket
  };
  const Icon = typeIcons[conn.type as keyof typeof typeIcons] || Users;

  return (
    <Card className="border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2rem] overflow-hidden bg-background ring-1 ring-slate-100 group">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 rounded-2xl border-4 border-slate-50 shadow-md">
            <AvatarImage src={avatarUrl} className="object-cover" />
            <AvatarFallback className="font-black bg-slate-100 text-slate-400">{name.charAt(0)}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-black text-slate-900 truncate">{name}</h4>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">
                  <Icon className="h-3 w-3" /> {conn.type} request
                </div>
              </div>
              <Badge className={cn(
                "rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter border-none",
                conn.status === 'pending' ? "bg-amber-100 text-amber-700" :
                conn.status === 'accepted' ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-400"
              )}>
                {conn.status}
              </Badge>
            </div>
            
            <p className="text-xs text-slate-500 font-medium line-clamp-2 mt-3 leading-relaxed italic">
              "{conn.message || "I'd like to connect and explore potential collaboration opportunities within the ecosystem."}"
            </p>

            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-50">
              {conn.status === 'pending' && isIncoming ? (
                <>
                  <Button 
                    size="sm" 
                    className="rounded-xl h-9 px-4 font-bold gap-2" 
                    onClick={() => onAction(conn, 'accepted')}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Accept
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="rounded-xl h-9 px-4 font-bold text-slate-400 hover:text-destructive hover:bg-destructive/5 gap-2"
                    onClick={() => onAction(conn, 'rejected')}
                    disabled={isLoading}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                </>
              ) : conn.status === 'accepted' ? (
                <Button variant="outline" size="sm" className="rounded-xl h-9 px-4 font-bold border-primary/20 text-primary gap-2" onClick={() => router.push('/dashboard/messages')}>
                   <MessageSquare className="h-3.5 w-3.5" /> Send Message
                </Button>
              ) : (
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                   <Clock className="h-3 w-3" /> 
                   {conn.createdAt?.toDate ? formatDistanceToNow(conn.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                </div>
              )}
              
              <div className="flex-1" />

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="h-4 w-4 text-slate-400" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] rounded-[2.5rem] p-0 overflow-hidden">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{name}'s Profile</DialogTitle>
                    <DialogDescription>Full details of the ecosystem member requesting connection.</DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[80vh]">
                    <div className="h-24 bg-primary/10" />
                    <div className="px-8 pb-10 -mt-10 space-y-6">
                      <Avatar className="h-24 w-24 rounded-2xl border-4 border-background shadow-xl">
                        <AvatarImage src={avatarUrl} className="object-cover" />
                        <AvatarFallback className="text-xl font-black">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <h2 className="text-2xl font-black text-slate-900">{name}</h2>
                        <p className="text-sm font-bold text-primary">{headline}</p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                         <div className="space-y-1">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Connection Message</p>
                           <p className="text-sm text-slate-600 font-medium italic leading-relaxed">
                             "{conn.message || "No custom message provided."}"
                           </p>
                         </div>
                      </div>
                      <Button className="w-full h-12 rounded-xl font-bold" asChild>
                        <Link href={profile?.role === 'investor' ? `/investors/${otherUid}` : `/founders/${otherUid}`}>View Full Public Profile</Link>
                      </Button>
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

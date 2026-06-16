'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser, useMemoFirebase, useCollection, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  getDoc, 
  doc,
  updateDoc,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
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
  ShieldCheck, 
  GraduationCap, 
  Wrench,
  Eye,
  Rocket,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

type ConnType = 'all' | 'investor' | 'mentor' | 'cofounder' | 'service' | 'founder';

export default function ConnectionsManagerPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [activeType, setActiveType] = useState<ConnType>('all');
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

  // 1. Unified Connections Queries - Only loading networking connections here
  // Pitches are now handled in /dashboard/pitches
  const incomingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('recipientUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const outgoingQuery = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid));
  }, [firestore, user?.uid]);

  const { data: incoming, isLoading: isIncomingLoading } = useCollection(incomingQuery);
  const { data: outgoing, isLoading: isOutgoingLoading } = useCollection(outgoingQuery);

  // Auto-clear connection notifications when entering this page
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    
    const clearNotifications = async () => {
      const q = query(
        collection(firestore, 'notifications'),
        where('recipientUid', '==', user.uid),
        where('read', '==', false),
        where('type', 'in', ['connection', 'investor_interest', 'cofounder_interest', 'rejection'])
      );
      
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestore);
          snap.docs.forEach(d => {
            batch.update(d.ref, { read: true });
          });
          batch.commit();
        }
      } catch (e) {
        console.warn("Could not auto-clear notifications", e);
      }
    };
    
    clearNotifications();
  }, [firestore, user?.uid]);

  // Merge and Normalize Data
  const allConns = useMemo(() => {
    const combined = [...(incoming || []), ...(outgoing || [])];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
    
    return unique.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || 0;
      const timeB = b.createdAt?.toMillis?.() || 0;
      return timeB - timeA;
    });
  }, [incoming, outgoing]);

  // Load profiles
  useEffect(() => {
    async function loadProfiles() {
      if (!firestore || allConns.length === 0) return;
      const uidsToFetch = new Set<string>();
      allConns.forEach(c => {
        if (c.initiatorUid && c.initiatorUid !== user?.uid) uidsToFetch.add(c.initiatorUid);
        if (c.recipientUid && c.recipientUid !== user?.uid) uidsToFetch.add(c.recipientUid);
      });

      const fetchPromises = Array.from(uidsToFetch)
        .filter(uid => !profiles[uid])
        .map(async (uid) => {
          try {
            const snap = await getDoc(doc(firestore, 'users', uid));
            return snap.exists() ? { uid, data: snap.data() } : null;
          } catch (e) { return null; }
        });

      const results = await Promise.all(fetchPromises);
      const newProfiles = { ...profiles };
      let changed = false;
      results.forEach(res => {
        if (res) {
          newProfiles[res.uid] = res.data;
          changed = true;
        }
      });
      if (changed) setProfiles(newProfiles);
    }
    loadProfiles();
  }, [firestore, allConns, user?.uid, profiles]);

  const handleStatus = (conn: any, status: 'accepted' | 'rejected') => {
    if (!firestore || !user || isActionLoading) return;
    setIsActionLoading(conn.id);
    const otherUid = conn.initiatorUid === user.uid ? conn.recipientUid : conn.initiatorUid;

    updateDoc(doc(firestore, 'connections', conn.id), { 
      status,
      updatedAt: serverTimestamp() 
    })
      .then(() => {
        if (status === 'accepted') {
          createNotification(firestore, {
            recipientUid: otherUid,
            actorUid: user.uid,
            type: 'connection',
            title: 'Connection Accepted',
            message: `${profiles[user.uid]?.fullName || 'Someone'} accepted your connection request.`,
            targetId: conn.id,
            targetType: 'user'
          });
          toast({ title: "Connected!" });
        } else {
          createNotification(firestore, {
            recipientUid: otherUid,
            actorUid: user.uid,
            type: 'rejection',
            title: 'Request Declined',
            message: `Your connection request was not accepted at this time.`,
            targetId: conn.id,
            targetType: 'user'
          });
          toast({ title: "Declined" });
        }
      })
      .catch((e) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: `connections/${conn.id}`,
          operation: 'update',
          requestResourceData: { status }
        }));
      })
      .finally(() => {
        setIsActionLoading(null);
      });
  };

  const filtered = allConns.filter(c => activeType === 'all' || c.type === activeType);
  const pending = filtered.filter(c => c.recipientUid === user?.uid && c.status === 'pending');
  const accepted = filtered.filter(c => c.status === 'accepted');
  const sent = filtered.filter(c => c.initiatorUid === user?.uid && c.status === 'pending');
  const rejected = filtered.filter(c => c.status === 'rejected');

  const isLoading = isUserLoading || isIncomingLoading || isOutgoingLoading;

  if (isLoading && allConns.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Relationships...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">Connections</h1>
          <p className="text-slate-500 font-medium">Manage all professional networking relationships.</p>
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
        <TabsList className="bg-slate-100 p-1 rounded-2xl w-full sm:w-auto h-auto flex gap-1">
          <TabsTrigger value="pending" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white shadow-sm">
            Pending {pending.length > 0 && <Badge variant="destructive" className="ml-2 h-4 px-1">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Accepted</TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Sent</TabsTrigger>
          <TabsTrigger value="rejected" className="flex-1 sm:flex-none rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-white">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <ConnectionsList items={pending} profiles={profiles} onAction={handleStatus} isIncoming loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="accepted">
          <ConnectionsList items={accepted} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="sent">
          <ConnectionsList items={sent} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
        <TabsContent value="rejected">
          <ConnectionsList items={rejected} profiles={profiles} onAction={handleStatus} loadingAction={isActionLoading} currentUserId={user?.uid} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectionsList({ items, profiles, onAction, isIncoming, loadingAction, currentUserId }: any) {
  if (items.length === 0) {
    return (
      <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center">
        <CardContent className="space-y-6">
          <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
            <Users className="h-16 w-16 text-slate-200" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">No records found</p>
            <p className="text-slate-500 font-medium">Relationships will appear here once they are initiated.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
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
            currentUserId={currentUserId}
          />
        );
      })}
    </div>
  );
}

function ConnectionCard({ conn, profile, onAction, isIncoming, isLoading, currentUserId }: any) {
  const router = useRouter();
  const name = profile?.fullName || "Ecosystem Member";
  const headline = profile?.investorHeadline || profile?.headline || "Active Participant";
  const avatarUrl = profile?.imageUrl || `https://picsum.photos/seed/${profile?.uid || conn.id}/200/200`;
  const otherUid = conn.initiatorUid === currentUserId ? conn.recipientUid : conn.initiatorUid;
  
  const roles = profile?.roles || (profile?.role ? [profile.role] : []) || [];
  const profileLink = roles.includes('investor') ? `/investors/${otherUid}` : `/founders/${otherUid}`;

  const typeIcons = {
    investor: ShieldCheck,
    mentor: GraduationCap,
    cofounder: Users,
    service: Wrench,
    founder: Rocket
  };
  const Icon = typeIcons[conn.type as keyof typeof typeIcons] || Users;

  return (
    <Card className="border-none shadow-sm hover:shadow-xl transition-all duration-300 rounded-[2.5rem] overflow-hidden bg-background ring-1 ring-slate-100 group">
      <CardContent className="p-8">
        <div className="flex items-start gap-6">
          <Link href={profileLink} className="shrink-0 hover:opacity-80 transition-opacity">
            <Avatar className="h-20 w-20 rounded-3xl border-4 border-slate-50 shadow-lg">
              <AvatarImage src={avatarUrl} className="object-cover" />
              <AvatarFallback className="font-black text-xl bg-slate-100 text-slate-400">{name.charAt(0)}</AvatarFallback>
            </Avatar>
          </Link>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Link href={profileLink}>
                  <h4 className="text-xl font-black text-slate-900 truncate hover:text-primary transition-colors">{name}</h4>
                </Link>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-[0.15em] mt-1">
                  <Icon className="h-3.5 w-3.5" /> {conn.type} request
                </div>
              </div>
              <Badge className={cn(
                "rounded-lg px-3 py-0.5 text-[9px] font-black uppercase tracking-widest border-none shrink-0",
                conn.status === 'pending' ? "bg-amber-100 text-amber-700" :
                conn.status === 'accepted' ? "bg-green-100 text-green-700" :
                "bg-slate-100 text-slate-400"
              )}>
                {conn.status}
              </Badge>
            </div>
            
            <p className="text-sm text-slate-600 font-medium line-clamp-3 mt-4 leading-relaxed italic border-l-2 border-primary/10 pl-4 bg-primary/5 py-3 rounded-r-xl">
              "{conn.message || "I'd like to connect and explore potential collaboration opportunities."}"
            </p>

            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-slate-50">
              {conn.status === 'pending' && isIncoming ? (
                <>
                  <Button 
                    size="sm" 
                    className="rounded-xl h-10 px-6 font-bold gap-2 shadow-lg shadow-primary/20" 
                    onClick={() => onAction(conn, 'accepted')}
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Accept
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="rounded-xl h-10 px-6 font-bold text-slate-400 hover:text-destructive hover:bg-destructive/5 gap-2"
                    onClick={() => onAction(conn, 'rejected')}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" /> Decline
                  </Button>
                </>
              ) : conn.status === 'accepted' ? (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl h-10 px-6 font-bold border-primary/20 text-primary gap-2" 
                  onClick={() => router.push(`/dashboard/messages?startWith=${otherUid}`)}
                >
                   <MessageSquare className="h-4 w-4" /> Message
                </Button>
              ) : (
                <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                   <Clock className="h-3.5 w-3.5" /> 
                   {conn.createdAt?.toDate ? formatDistanceToNow(conn.createdAt.toDate(), { addSuffix: true }) : 'Recently'}
                </div>
              )}
              
              <div className="flex-1" />

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-50 transition-colors">
                    <Eye className="h-5 w-5 text-slate-400" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] rounded-[3rem] p-0 overflow-hidden border-none shadow-2xl">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{name}'s Profile</DialogTitle>
                    <DialogDescription>Full details of the ecosystem member.</DialogDescription>
                  </DialogHeader>
                  <ScrollArea className="max-h-[85vh]">
                    <div className="h-32 bg-gradient-to-br from-primary/20 to-accent/20" />
                    <div className="px-10 pb-12 -mt-12 space-y-8">
                      <Avatar className="h-28 w-28 rounded-[2rem] border-8 border-background shadow-2xl">
                        <AvatarImage src={avatarUrl} className="object-cover" />
                        <AvatarFallback className="text-2xl font-black">{name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-2">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">{name}</h2>
                        <p className="text-lg font-bold text-primary">{headline}</p>
                        <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
                          <MapPin className="h-4 w-4" /> {profile?.location || 'Remote Member'}
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-4">
                         <div className="space-y-2">
                           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Request Message</p>
                           <p className="text-slate-600 font-medium italic leading-relaxed text-lg">
                             "{conn.message || "No custom message provided."}"
                           </p>
                         </div>
                      </div>

                      <div className="pt-2">
                        <Button className="w-full h-14 rounded-2xl font-black text-base shadow-xl" asChild>
                          <Link href={profileLink}>
                            View Full Public Profile <ArrowRight className="ml-2 h-5 w-5" />
                          </Link>
                        </Button>
                      </div>
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

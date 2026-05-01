'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDoc, 
  doc,
  addDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Loader2, MessageSquare, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ConnectionsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [connections, setConnections] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  useEffect(() => {
    async function loadUserRole() {
      if (!firestore || !user?.uid) return;
      const snap = await getDoc(doc(firestore, 'users', user.uid));
      if (snap.exists()) {
        setUserRole(snap.data().role);
      }
    }
    loadUserRole();
  }, [firestore, user?.uid]);

  useEffect(() => {
    if (!firestore || !user?.uid || !userRole) return;

    const fieldToMatch = userRole === 'investor' ? 'fromInvestorUid' : 'toFounderUid';
    
    const connectionsQ = query(
      collection(firestore, 'pitches'),
      where(fieldToMatch, '==', user.uid),
      where('status', '==', 'accepted')
    );

    const unsubscribe = onSnapshot(connectionsQ, async (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setConnections(list);
      setIsLoading(false);

      // Fetch profiles for the other party
      const uidsToFetch = new Set<string>();
      list.forEach((conn: any) => {
        const otherUid = userRole === 'investor' ? conn.toFounderUid : conn.fromInvestorUid;
        if (otherUid && !profiles[otherUid]) {
          uidsToFetch.add(otherUid);
        }
      });

      if (uidsToFetch.size > 0) {
        const newProfiles = { ...profiles };
        for (const uid of Array.from(uidsToFetch)) {
          const userSnap = await getDoc(doc(firestore, 'users', uid));
          if (userSnap.exists()) {
            newProfiles[uid] = userSnap.data();
          }
        }
        setProfiles(newProfiles);
      }
    });

    return () => unsubscribe();
  }, [firestore, user?.uid, userRole]);

  async function openChat(otherUid: string) {
    if (!firestore || !user?.uid || isOpeningChat) return;
    setIsOpeningChat(true);
    try {
      const q = query(
        collection(firestore, "chats"),
        where("participants", "array-contains", user.uid)
      );

      const snap = await getDocs(q);
      let chatId = null;

      snap.forEach(doc => {
        const data = doc.data();
        if (data.participants && data.participants.includes(otherUid)) {
          chatId = doc.id;
        }
      });

      if (chatId) {
        router.push(`/chats/${chatId}`);
      } else {
        const newChatRef = await addDoc(collection(firestore, 'chats'), {
          participants: [user.uid, otherUid],
          lastMessage: "You are now connected!",
          updatedAt: serverTimestamp(),
        });
        router.push(`/chats/${newChatRef.id}`);
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      toast({
        title: "Error",
        description: "Failed to open conversation.",
        variant: "destructive"
      });
    } finally {
      setIsOpeningChat(false);
    }
  }

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-2xl">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Connections</h1>
            <p className="text-muted-foreground text-sm">Manage your professional network and partnerships.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {connections.length > 0 ? (
          connections.map((conn) => {
            const otherUid = userRole === 'investor' ? conn.toFounderUid : conn.fromInvestorUid;
            const profile = profiles[otherUid];
            const name = profile?.fullName || "Connection";
            const role = profile?.role || "Member";
            const headline = profile?.headline || "TabStartup Member";
            const avatarUrl = profile?.imageUrl || `https://picsum.photos/seed/${otherUid}/100/100`;

            return (
              <Card key={conn.id} className="group hover:shadow-lg transition-all border-none shadow-sm overflow-hidden bg-background">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border-2 border-primary/10">
                      <AvatarImage src={avatarUrl} alt={name} />
                      <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate text-lg">{name}</h3>
                      <Badge variant="secondary" className="capitalize text-[10px] h-5 mb-1">
                        {role}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2 h-10 italic">
                    {headline}
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 gap-2 rounded-xl" 
                      onClick={() => openChat(otherUid)}
                      disabled={isOpeningChat}
                    >
                      {isOpeningChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Message
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="rounded-xl shrink-0"
                      onClick={() => router.push(role === 'founder' ? `/founders/${otherUid}` : `/investors/${otherUid}`)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center bg-muted/20 rounded-3xl border-2 border-dashed">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-xl font-semibold mb-2">No connections yet</h3>
            <p className="text-muted-foreground max-w-xs mx-auto mb-6">
              Start exploring profiles and expressing interest to build your network.
            </p>
            <Button variant="outline" onClick={() => router.push(userRole === 'investor' ? '/founders' : '/investors')}>
              Browse Directory
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

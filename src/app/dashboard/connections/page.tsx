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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Loader2, MessageSquare, ArrowRight, Rocket, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ConnectionsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  const [connections, setConnections] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [startups, setStartups] = useState<Record<string, any>>({});
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
      
      const uidsToFetch = new Set<string>();
      list.forEach((conn: any) => {
        const otherUid = userRole === 'investor' ? conn.toFounderUid : conn.fromInvestorUid;
        if (otherUid) uidsToFetch.add(otherUid);
      });

      if (uidsToFetch.size > 0) {
        const newProfiles = { ...profiles };
        const newStartups = { ...startups };
        
        for (const uid of Array.from(uidsToFetch)) {
          if (!newProfiles[uid]) {
            const userSnap = await getDoc(doc(firestore, 'users', uid));
            if (userSnap.exists()) {
              const profileData = userSnap.data();
              newProfiles[uid] = profileData;
              
              // If the connected person is a founder, fetch their startup
              if (profileData.role === 'founder') {
                const startupSnap = await getDoc(doc(firestore, 'startups', uid));
                if (startupSnap.exists()) {
                  newStartups[uid] = startupSnap.data();
                }
              }
            }
          }
        }
        setProfiles(newProfiles);
        setStartups(newStartups);
      }
      setIsLoading(false);
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
    <div className="max-w-6xl mx-auto w-full space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-2xl">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Your Connections</h1>
            <p className="text-muted-foreground text-sm">Manage your professional network and active partnerships.</p>
          </div>
        </div>
      </div>

      {connections.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => {
            const otherUid = userRole === 'investor' ? conn.toFounderUid : conn.fromInvestorUid;
            const profile = profiles[otherUid];
            const startup = startups[otherUid];
            
            const name = profile?.fullName || "Connection";
            const role = profile?.role || "Member";
            const headline = profile?.headline || profile?.investorHeadline || "TabStartup Member";
            const avatarUrl = profile?.imageUrl || `https://picsum.photos/seed/${otherUid}/100/100`;

            return (
              <Card key={conn.id} className="group hover:shadow-xl transition-all border-none shadow-md overflow-hidden bg-background rounded-[2rem]">
                <CardHeader className="pb-4 pt-8 px-8">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 border-4 border-primary/5 rounded-2xl">
                      <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
                      <AvatarFallback className="rounded-2xl">{name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate text-xl">{name}</h3>
                      <p className="text-sm text-primary font-medium truncate mb-2">{headline}</p>
                      <Badge variant="secondary" className="capitalize text-[10px] font-bold h-5">
                        {role}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-8 pb-8 space-y-6">
                  {role === 'founder' && startup ? (
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                      <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-primary" />
                        <span className="font-bold text-sm truncate">{startup.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-[10px] py-0 px-2 border-primary/20 bg-background">
                          {startup.stage}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-0 px-2 border-primary/20 bg-background flex items-center gap-1">
                          <Briefcase className="h-2 w-2" /> {startup.industry}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[84px] flex items-center justify-center border-2 border-dashed rounded-2xl">
                       <p className="text-xs text-muted-foreground italic">Professional Investor</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 gap-2 rounded-xl h-11" 
                      onClick={() => openChat(otherUid)}
                      disabled={isOpeningChat}
                    >
                      {isOpeningChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Message
                    </Button>
                    <Button 
                      variant="outline" 
                      className="gap-2 rounded-xl h-11 px-4"
                      onClick={() => router.push(role === 'founder' ? `/founders/${otherUid}` : `/investors/${otherUid}`)}
                    >
                      Profile <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-[3rem] border-2 border-dashed shadow-sm px-6 text-center">
          <div className="p-4 bg-muted/50 rounded-full mb-6">
            <Users className="h-12 w-12 text-muted-foreground opacity-40" />
          </div>
          <h3 className="text-2xl font-bold mb-2">You don't have any connections yet</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-8 text-lg">
            Start exploring startups and founders in the directory to build your portfolio and network.
          </p>
          <Button 
            size="lg" 
            className="rounded-full px-8 h-12" 
            onClick={() => router.push(userRole === 'investor' ? '/founders' : '/investors')}
          >
            Start Exploring
          </Button>
        </div>
      )}
    </div>
  );
}

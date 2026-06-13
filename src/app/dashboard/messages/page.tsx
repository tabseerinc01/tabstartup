
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  getDoc, 
  doc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Loader2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function MessagesInboxPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();

  const [chats, setChats] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Auto-clear message notifications when entering this page
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    
    const clearNotifications = async () => {
      const q = query(
        collection(firestore, 'notifications'),
        where('recipientUid', '==', user.uid),
        where('read', '==', false),
        where('type', '==', 'message')
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
        console.warn("Could not auto-clear message notifications", e);
      }
    };
    
    clearNotifications();
  }, [firestore, user?.uid]);

  useEffect(() => {
    if (!firestore || !user?.uid) return;

    const chatsQ = query(
      collection(firestore, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(chatsQ, async (snapshot) => {
      const chatList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      setChats(chatList);
      setIsLoading(false);

      // Fetch profiles for participants we don't have yet
      const uidsToFetch = new Set<string>();
      chatList.forEach((chat: any) => {
        const otherUid = chat.participants.find((id: string) => id !== user.uid);
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
    }, (error) => {
      console.error("Error fetching chats:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Messages</h1>
      </div>

      <div className="grid gap-4">
        {chats.length > 0 ? (
          chats.map((chat) => {
            const otherUid = chat.participants.find((id: string) => id !== user?.uid);
            const otherUser = profiles[otherUid || ''];
            const name = otherUser?.fullName || "Partner";
            const avatarUrl = otherUser?.imageUrl || `https://picsum.photos/seed/${otherUid}/40/40`;

            return (
              <Card 
                key={chat.id} 
                className="hover:shadow-md transition-all cursor-pointer border-none bg-background shadow-sm overflow-hidden"
                onClick={() => router.push(`/chats/${chat.id}`)}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border">
                      <AvatarImage src={avatarUrl} />
                      <AvatarFallback>{name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold truncate">{name}</h3>
                        {chat.updatedAt && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate italic">
                        {chat.lastMessage || "No messages yet"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">No conversations yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

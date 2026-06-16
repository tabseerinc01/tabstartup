'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  getDoc, 
  doc,
  getDocs,
  writeBatch,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Loader2, Clock, Inbox, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function MessagesInboxContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const startWith = searchParams.get('startWith');

  const [chats, setChats] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isInitiating, setIsInitiating] = useState(!!startWith);

  // 1. Handle Chat Initiation if startWith param exists
  useEffect(() => {
    if (!firestore || !user?.uid || !startWith) return;

    async function initiateChat() {
      try {
        // Search for existing chat between these two participants
        const q = query(
          collection(firestore!, 'chats'),
          where('participants', 'array-contains', user!.uid)
        );
        const snap = await getDocs(q);
        const existingChat = snap.docs.find(d => d.data().participants.includes(startWith));

        if (existingChat) {
          router.push(`/chats/${existingChat.id}`);
        } else {
          // Create a new chat document
          const chatData = {
            participants: [user!.uid, startWith],
            updatedAt: serverTimestamp(),
            lastMessage: "",
            createdAt: serverTimestamp()
          };
          
          addDoc(collection(firestore!, 'chats'), chatData)
            .then((docRef) => {
              router.push(`/chats/${docRef.id}`);
            })
            .catch(err => {
              errorEmitter.emit('permission-error', new FirestorePermissionError({
                path: 'chats',
                operation: 'create',
                requestResourceData: chatData
              }));
              setIsInitiating(false);
            });
        }
      } catch (error) {
        console.error("Error initiating chat:", error);
        setIsInitiating(false);
      }
    }

    initiateChat();
  }, [firestore, user, startWith, router]);

  // 2. Clear notifications
  useEffect(() => {
    if (!firestore || !user?.uid) return;
    
    const clearNotifications = async () => {
      const q = query(
        collection(firestore!, 'notifications'),
        where('recipientUid', '==', user!.uid),
        where('read', '==', false),
        where('type', '==', 'message')
      );
      
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestore!);
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

  // 3. Load chat list
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
          const userSnap = await getDoc(doc(firestore!, 'users', uid));
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
  }, [firestore, user?.uid, profiles]);

  if (isUserLoading || isLoading || isInitiating) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          {isInitiating ? "Initiating Secure Conversation..." : "Synchronizing Inbox..."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl text-primary">
            <MessageSquare className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Inbox</h1>
            <p className="text-sm font-medium text-slate-500">Manage your private ecosystem dialogues.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {chats.length > 0 ? (
          chats.map((chat) => {
            const otherUid = chat.participants.find((id: string) => id !== user?.uid);
            const otherUser = profiles[otherUid || ''];
            const name = otherUser?.fullName || "Partner";
            const avatarUrl = otherUser?.imageUrl || `https://picsum.photos/seed/${otherUid}/80/80`;

            return (
              <Card 
                key={chat.id} 
                className="group hover:shadow-xl transition-all cursor-pointer border-none bg-background shadow-sm rounded-3xl overflow-hidden ring-1 ring-slate-100"
                onClick={() => router.push(`/chats/${chat.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-5">
                    <Avatar className="h-14 w-14 rounded-2xl border-2 border-slate-50 shadow-md">
                      <AvatarImage src={avatarUrl} className="object-cover" />
                      <AvatarFallback className="font-bold bg-primary/5 text-primary">{name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-lg font-black text-slate-900 truncate group-hover:text-primary transition-colors">{name}</h3>
                        {chat.updatedAt && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 truncate font-medium italic pr-4">
                        {chat.lastMessage || "Start a new conversation..."}
                      </p>
                    </div>
                    <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0">
                       <ArrowRight className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-32 text-center border-slate-100">
            <CardContent className="space-y-6">
              <div className="p-6 bg-slate-50 rounded-full w-fit mx-auto">
                <Inbox className="h-16 w-16 text-slate-200" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-black text-slate-900">Your inbox is empty</p>
                <p className="text-slate-500 font-medium max-w-xs mx-auto">
                  Connect with founders, investors, or mentors to start a conversation.
                </p>
              </div>
              <Button asChild className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20">
                <Link href="/founders">Explore Directory</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function MessagesInboxPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    }>
      <MessagesInboxContent />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  onSnapshot,
  addDoc, 
  updateDoc,
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';

export default function ChatPage() {
  const { chatId } = useParams();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [chat, setChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Load chat metadata once
  useEffect(() => {
    async function loadChatData() {
      if (!firestore || !chatId || !user?.uid) return;
      
      try {
        const chatSnap = await getDoc(doc(firestore, 'chats', chatId as string));
        if (!chatSnap.exists()) {
          toast({ title: "Chat not found", variant: "destructive" });
          router.push('/dashboard/messages');
          return;
        }

        const chatData = chatSnap.data();
        if (!chatData.participants || !chatData.participants.includes(user.uid)) {
          toast({ title: "Access denied", variant: "destructive" });
          router.push('/dashboard/messages');
          return;
        }
        setChat(chatData);

        // Find other participant
        const otherUid = chatData.participants.find((id: string) => id !== user.uid);
        if (otherUid) {
          const otherSnap = await getDoc(doc(firestore, 'users', otherUid));
          if (otherSnap.exists()) {
            setOtherUser(otherSnap.data());
          }
        }
      } catch (error) {
        console.error("Error loading chat metadata:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (!isUserLoading && user) {
      loadChatData();
    }
  }, [firestore, chatId, user, isUserLoading, router, toast]);

  // Set up real-time message listener
  useEffect(() => {
    if (!firestore || !chatId || !user) return;

    const msgsQ = query(
      collection(firestore, 'chats', chatId as string, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(msgsQ, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      }));
      setMessages(msgs);
    }, async (error) => {
      const permissionError = new FirestorePermissionError({
        path: `chats/${chatId}/messages`,
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
    });

    return () => unsubscribe();
  }, [firestore, chatId, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !firestore || isSending) return;

    setIsSending(true);
    const messageText = newMessage.trim();
    const messageData = {
      senderId: user.uid,
      text: messageText,
      timestamp: serverTimestamp(),
    };

    setNewMessage('');

    // Add message to subcollection
    addDoc(collection(firestore, 'chats', chatId as string, 'messages'), messageData)
      .then(async () => {
        // Update last message in the parent chat
        await updateDoc(doc(firestore, 'chats', chatId as string), {
          lastMessage: messageText,
          updatedAt: serverTimestamp()
        });

        // Notify other participants
        if (chat?.participants) {
          chat.participants.forEach((participantUid: string) => {
            if (participantUid !== user.uid) {
              createNotification(firestore, {
                recipientUid: participantUid,
                actorUid: user.uid,
                type: 'message',
                title: 'New Message',
                message: 'You received a new message.',
                targetId: chatId as string,
                targetType: 'chat'
              });
            }
          });
        }
      })
      .catch(async (error) => {
        const permissionError = new FirestorePermissionError({
          path: `chats/${chatId}/messages`,
          operation: 'create',
          requestResourceData: messageData
        });
        errorEmitter.emit('permission-error', permissionError);
      })
      .finally(() => {
        setIsSending(false);
      });
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const otherName = otherUser?.fullName || "Partner";

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto flex flex-col h-[70vh]">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => router.back()} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={otherUser?.imageUrl} />
                <AvatarFallback>{otherName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-bold">{otherName}</h2>
                <p className="text-xs text-muted-foreground">Direct Message</p>
              </div>
            </div>
            <div className="w-10" />
          </div>

          <Card className="flex-1 flex flex-col overflow-hidden rounded-3xl border-none shadow-xl bg-background">
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-4">
                {messages.length > 0 ? (
                  messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${
                          msg.senderId === user?.uid 
                            ? 'bg-primary text-primary-foreground rounded-tr-none' 
                            : 'bg-muted text-foreground rounded-tl-none'
                        }`}
                      >
                        <p>{msg.text}</p>
                        <p className="text-[10px] opacity-70 mt-1 text-right">
                          {msg.timestamp?.toDate() ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20 text-muted-foreground italic">
                    No messages yet. Start the conversation!
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-background">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input 
                  placeholder="Type a message..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="rounded-full px-6"
                  disabled={isSending}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="rounded-full shrink-0" 
                  disabled={isSending || !newMessage.trim()}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

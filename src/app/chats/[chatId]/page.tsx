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

    addDoc(collection(firestore, 'chats', chatId as string, 'messages'), messageData)
      .then(async () => {
        await updateDoc(doc(firestore, 'chats', chatId as string), {
          lastMessage: messageText,
          updatedAt: serverTimestamp()
        });

        if (chat?.participants) {
          chat.participants.forEach((participantUid: string) => {
            if (participantUid !== user.uid) {
              createNotification(firestore, {
                recipientUid: participantUid,
                actorUid: user.uid,
                type: 'message',
                title: 'New Message',
                message: messageText.length > 50 ? messageText.substring(0, 47) + '...' : messageText,
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
        <div className="max-w-3xl mx-auto flex flex-col h-[75vh]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 px-2">
            <Button 
              variant="ghost" 
              onClick={() => router.push('/dashboard/messages')} 
              className="gap-2 font-bold text-slate-600 hover:bg-white/50"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Inbox
            </Button>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                <AvatarImage src={otherUser?.imageUrl} />
                <AvatarFallback className="font-bold bg-primary/10 text-primary">{otherName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="font-black text-slate-900 truncate">{otherName}</h2>
                <div className="flex items-center gap-1.5">
                   <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Chat</p>
                </div>
              </div>
            </div>
            <div className="w-20 hidden sm:block" />
          </div>

          {/* Chat Container */}
          <Card className="flex-1 flex flex-col overflow-hidden rounded-[2.5rem] border-none shadow-2xl bg-white ring-1 ring-slate-100">
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {messages.length > 0 ? (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user?.uid;
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div 
                          className={`max-w-[80%] sm:max-w-[70%] px-5 py-3 rounded-2xl text-sm font-medium shadow-sm transition-all ${
                            isMe 
                              ? 'bg-primary text-white rounded-tr-none' 
                              : 'bg-slate-100 text-slate-800 rounded-tl-none'
                          }`}
                        >
                          <p className="leading-relaxed">{msg.text}</p>
                        </div>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-tighter mt-1 px-1">
                          {msg.timestamp?.toDate() ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-30">
                    <div className="p-4 bg-slate-50 rounded-full">
                       <Send className="h-8 w-8 text-slate-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Start the conversation</p>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-6 bg-slate-50/50 border-t border-slate-100">
              <form onSubmit={handleSendMessage} className="flex gap-3 items-center">
                <Input 
                  placeholder="Type a message..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="rounded-2xl px-6 h-12 bg-white border-none shadow-sm focus-visible:ring-primary/20 text-base"
                  disabled={isSending}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="rounded-2xl h-12 w-12 shrink-0 shadow-lg shadow-primary/20 transition-transform active:scale-95" 
                  disabled={isSending || !newMessage.trim()}
                >
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
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

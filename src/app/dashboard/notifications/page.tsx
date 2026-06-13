
'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  updateDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  MessageSquare, 
  Heart, 
  Users, 
  Rocket, 
  ShieldAlert, 
  Clock,
  Inbox,
  Loader2,
  ChevronRight,
  Zap,
  ShieldCheck,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function NotificationsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // Simplified query for max reliability without composite indexing
    const q = query(
      collection(firestore, 'notifications'),
      where('recipientUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Client-side sort to avoid index requirements
      const sorted = list.sort((a: any, b: any) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setNotifications(sorted);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching notifications:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  const handleMarkAsRead = (id: string) => {
    if (!firestore) return;
    const ref = doc(firestore, 'notifications', id);
    updateDoc(ref, { read: true }).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `notifications/${id}`,
        operation: 'update',
        requestResourceData: { read: true }
      }));
    });
  };

  const handleMarkAllAsRead = () => {
    if (!firestore || !user?.uid) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batch = writeBatch(firestore);
    unread.forEach(n => {
      batch.update(doc(firestore, 'notifications', n.id), { read: true });
    });

    batch.commit().then(() => {
      toast({ title: "Updated", description: "All notifications marked as read." });
    }).catch(err => {
      console.error("Batch update failed", err);
    });
  };

  const handleDelete = (id: string) => {
    if (!firestore) return;
    deleteDoc(doc(firestore, 'notifications', id)).catch(err => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: `notifications/${id}`,
        operation: 'delete'
      }));
    });
  };

  const handleNotificationClick = (n: any) => {
    handleMarkAsRead(n.id);
    
    // Logic for routing based on notification target
    if (n.type === 'message' && n.targetId) {
      router.push(`/chats/${n.targetId}`);
    } else if ((n.type === 'like' || n.type === 'comment' || n.type === 'moderation') && n.targetType === 'post') {
      router.push('/community');
    } else if (['investor_interest', 'cofounder_interest', 'connection', 'rejection'].includes(n.type)) {
      router.push('/dashboard/connections');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'message': return <MessageSquare className="h-5 w-5 text-blue-500" />;
      case 'like': return <Heart className="h-5 w-5 text-rose-500 fill-rose-500" />;
      case 'comment': return <Inbox className="h-5 w-5 text-emerald-500" />;
      case 'cofounder_interest': return <Users className="h-5 w-5 text-amber-500" />;
      case 'investor_interest': return <Zap className="h-5 w-5 text-primary fill-primary" />;
      case 'connection': return <ShieldCheck className="h-5 w-5 text-green-500" />;
      case 'rejection': return <XCircle className="h-5 w-5 text-slate-400" />;
      case 'moderation': return <ShieldAlert className="h-5 w-5 text-destructive" />;
      default: return <Bell className="h-5 w-5 text-slate-400" />;
    }
  };

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              Stay updated with your ecosystem activity 
              {unreadCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{unreadCount} New</Badge>}
            </p>
          </div>
        </div>
        
        {notifications.length > 0 && (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-full gap-2 font-bold text-xs uppercase tracking-widest border-primary/20 hover:bg-primary/5 text-primary"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4">
        {notifications.length > 0 ? (
          notifications.map((n) => {
            const createdAt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
            return (
              <Card 
                key={n.id} 
                className={`group border-none shadow-sm hover:shadow-md transition-all duration-300 rounded-2xl overflow-hidden cursor-pointer relative ${!n.read ? 'bg-primary/[0.03] ring-1 ring-primary/10' : 'bg-background opacity-80'}`}
                onClick={() => handleNotificationClick(n)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center transition-colors ${!n.read ? 'bg-primary/20' : 'bg-muted'}`}>
                       {getIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-lg font-bold truncate ${!n.read ? 'text-slate-900' : 'text-slate-500'}`}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(createdAt, { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm leading-relaxed ${!n.read ? 'text-slate-600 font-medium' : 'text-slate-500'}`}>
                        {n.message}
                      </p>
                      
                      <div className="pt-2 flex items-center justify-between">
                         <div className="flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity">
                            View details <ChevronRight className="h-3 w-3" />
                         </div>
                         <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-lg text-slate-300 hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(n.id);
                          }}
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                      </div>
                    </div>
                  </div>
                  {!n.read && (
                    <div className="absolute top-0 right-0 w-12 h-12 bg-primary/5 rounded-bl-full pointer-events-none" />
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[3rem] border-2 border-dashed shadow-sm px-6 text-center">
            <div className="p-6 bg-muted/50 rounded-full mb-6">
              <Inbox className="h-16 w-16 text-muted-foreground opacity-20" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">No notifications yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-8 text-lg">
              When someone likes your post, messages you, or shows interest in your startup, you'll find those updates here.
            </p>
            <Button 
              size="lg" 
              className="rounded-full px-10 h-14 font-bold shadow-xl shadow-primary/20" 
              onClick={() => router.push('/dashboard')}
            >
              Back to Overview
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

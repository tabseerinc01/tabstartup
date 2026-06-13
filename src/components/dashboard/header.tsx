
'use client';

import { useState, useEffect } from 'react';
import { 
  Bell, 
  Search, 
  Menu, 
  LogOut, 
  User as UserIcon, 
  Settings, 
  ShieldCheck, 
  CheckCircle2, 
  Clock,
  Trash2,
  Inbox,
  ArrowRight
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DashboardSidebar } from './sidebar';
import { useUser, useAuth, initiateSignOut, useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { useRouter } from 'next/navigation';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

export function DashboardHeader() {
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load profile data
  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
        }
      } catch (error) {
        console.error("Error loading header profile:", error);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  // Load real-time notifications
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    // Simplified query for reliability
    const q = query(
      collection(firestore, 'notifications'),
      where('recipientUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort client-side to avoid index requirements
      const sorted = list.sort((a: any, b: any) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      }).slice(0, 20);
      
      setNotifications(sorted);
      setUnreadCount(sorted.filter((n: any) => !n.read).length);
    }, (error) => {
      console.error("Notification listener error:", error);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  const handleLogout = () => {
    initiateSignOut(auth);
    router.push('/login');
  };

  const markAsRead = (notificationId: string) => {
    if (!firestore) return;
    const ref = doc(firestore, 'notifications', notificationId);
    updateDoc(ref, { read: true }).catch(err => {
       errorEmitter.emit('permission-error', new FirestorePermissionError({
         path: ref.path,
         operation: 'update',
         requestResourceData: { read: true }
       }));
    });
  };

  const markAllAsRead = () => {
    if (!firestore || unreadCount === 0) return;
    const batch = writeBatch(firestore);
    notifications
      .filter(n => !n.read)
      .forEach(n => {
        batch.update(doc(firestore, 'notifications', n.id), { read: true });
      });
    
    batch.commit().catch(err => console.error("Batch update failed", err));
  };

  const displayName = profile?.fullName || user?.displayName || user?.email?.split('@')[0] || "User";
  const avatarUrl = profile?.imageUrl || `https://picsum.photos/seed/${user?.uid || 'user'}/40/40`;
  
  const roles = (profile?.roles || (profile?.role ? [profile.role] : ['user'])).filter(Boolean) as string[];

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
              <SheetDescription>Access dashboard sections and tools</SheetDescription>
            </SheetHeader>
            <DashboardSidebar />
          </SheetContent>
        </Sheet>
        
        <div className="relative hidden sm:block w-64 lg:w-96">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search founders, investors..."
            className="pl-8 bg-muted/50 border-none shadow-none focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {profile?.isVerified && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-[10px] font-bold">
            <ShieldCheck className="h-3 w-3" /> VERIFIED
          </div>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative group">
              <Bell className="h-5 w-5 transition-colors group-hover:text-primary" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 p-0 rounded-2xl shadow-2xl border-primary/10 overflow-hidden" align="end">
            <div className="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
              <DropdownMenuLabel className="p-0 text-sm font-bold flex items-center gap-2">
                Notifications
                {unreadCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{unreadCount}</Badge>}
              </DropdownMenuLabel>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.preventDefault(); markAllAsRead(); }}
                    className="h-7 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10"
                  >
                    Clear All
                  </Button>
                )}
              </div>
            </div>
            
            <ScrollArea className="h-[400px]">
              {notifications.length > 0 ? (
                <div className="p-1">
                  {notifications.map((n) => {
                    const createdAt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date();
                    return (
                      <DropdownMenuItem 
                        key={n.id} 
                        className={`p-4 cursor-pointer focus:bg-muted/50 rounded-xl mb-1 flex items-start gap-3 transition-colors ${!n.read ? 'bg-primary/[0.03] border-l-4 border-l-primary' : 'opacity-70'}`}
                        onClick={() => markAsRead(n.id)}
                      >
                        <div className={`mt-1 h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${!n.read ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                           <Inbox className="h-4 w-4" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className={`text-sm font-bold leading-none ${!n.read ? 'text-slate-900' : 'text-slate-500'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {n.message}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-tight pt-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(createdAt, { addSuffix: true })}
                          </div>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 px-8 text-center space-y-4">
                  <div className="p-4 bg-muted rounded-full">
                    <Bell className="h-8 w-8 text-muted-foreground opacity-20" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">All caught up!</p>
                    <p className="text-xs text-slate-500 mt-1">No new notifications at the moment.</p>
                  </div>
                </div>
              )}
            </ScrollArea>
            
            <div className="p-2 border-t bg-slate-50/50">
               <Button variant="ghost" className="w-full h-9 rounded-lg text-primary font-bold text-xs gap-2" asChild>
                  <Link href="/dashboard/notifications">
                    View All Notifications <ArrowRight className="h-3 w-3" />
                  </Link>
               </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {roles.map(r => (
                    <Badge key={r} variant="secondary" className="text-[8px] font-bold h-4 px-1.5 capitalize">
                      {r.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center gap-2 cursor-pointer">
                <UserIcon className="h-4 w-4" />
                <span>Profile Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive" 
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  User, 
  Rocket, 
  Users, 
  Settings,
  LogOut,
  ChevronRight,
  HandCoins,
  MessageSquare,
  GraduationCap,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useAuth, initiateSignOut, useUser, useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const [profile, setProfile] = useState<any>(null);
  const [hasPendingPitches, setHasPendingPitches] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          setProfile(snap.data());
        }
      } catch (error) {
        console.error("Error loading sidebar profile:", error);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  // Listen for pending pitches (investor interest) for founders
  useEffect(() => {
    if (!firestore || !user?.uid || profile?.role !== 'founder') return;

    const q = query(
      collection(firestore, 'pitches'),
      where('toFounderUid', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPendingPitches(!snapshot.empty);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid, profile?.role]);

  const handleLogout = () => {
    initiateSignOut(auth);
    router.push('/login');
  };

  const isFounder = profile?.role === 'founder';

  const menuItems = [
    { href: '/dashboard', label: 'Overview', icon: Home },
    { href: '/dashboard/profile', label: 'My Profile', icon: User },
    { href: '/dashboard/startup', label: 'My Startup', icon: Rocket },
    { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
    { href: '/cofounders', label: 'Co-founders', icon: Users },
    { href: '/mentors', label: 'Mentors', icon: GraduationCap },
    { href: '/services', label: 'Services', icon: Wrench },
    { 
      href: '/dashboard/connections', 
      label: 'Connections', 
      icon: Users,
      showBadge: hasPendingPitches 
    },
    ...(isFounder ? [{ href: '/dashboard/fundraising', label: 'Fundraising', icon: HandCoins }] : []),
    { href: '#', label: 'Settings', icon: Settings, disabled: true },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-background h-screen sticky top-0">
      <div className="p-6">
        <Logo />
      </div>
      
      <nav className="flex-1 px-4 py-2 space-y-1">
        {menuItems.map((item) => (
          <Link
            key={item.label}
            href={item.disabled ? '#' : item.href}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
              pathname === item.href 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              item.disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-3 relative">
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.showBadge && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                </span>
              )}
            </div>
            {item.disabled && <span className="text-[10px] bg-muted px-1.5 rounded-full text-muted-foreground">Soon</span>}
            {!item.disabled && pathname === item.href && <ChevronRight className="h-3 w-3" />}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground" 
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
}

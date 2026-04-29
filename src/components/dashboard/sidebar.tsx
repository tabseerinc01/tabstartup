
'use client';

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
  HandCoins
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useAuth, initiateSignOut, useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const userRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: profile } = useDoc(userRef);

  const handleLogout = () => {
    initiateSignOut(auth);
    router.push('/login');
  };

  const isFounder = profile?.role === 'founder';

  const menuItems = [
    { href: '/dashboard', label: 'Overview', icon: Home },
    { href: '/dashboard/profile', label: 'My Profile', icon: User },
    { href: '/dashboard/startup', label: 'My Startup', icon: Rocket },
    ...(isFounder ? [{ href: '/dashboard/fundraising', label: 'Fundraising', icon: HandCoins }] : []),
    { href: '#', label: 'Connections', icon: Users, disabled: true },
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
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4" />
              {item.label}
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

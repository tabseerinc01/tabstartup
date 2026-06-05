
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
  ChevronDown,
  ChevronRight,
  HandCoins,
  MessageSquare,
  GraduationCap,
  Wrench,
  ShieldAlert,
  Globe,
  Contact2,
  LayoutGrid,
  CheckSquare,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useAuth, initiateSignOut, useUser, useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SidebarItem {
  href: string;
  label: string;
  icon: any;
  showBadge?: boolean;
  disabled?: boolean;
}

interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarItem[];
}

export function DashboardSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const [profile, setProfile] = useState<any>(null);
  const [hasPendingPitches, setHasPendingPitches] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    workspace: true,
    discovery: true,
    network: true,
    account: true
  });

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

  useEffect(() => {
    if (!firestore || !user?.uid || !profile) return;
    
    const roles = profile.roles || [profile.role] || [];
    if (!roles.includes('founder')) return;

    const q = query(
      collection(firestore, 'connections'),
      where('recipientUid', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasPendingPitches(!snapshot.empty);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid, profile]);

  const handleLogout = () => {
    initiateSignOut(auth);
    router.push('/login');
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const roles = profile?.roles || (profile?.role ? [profile.role] : []) || [];
  const isFounder = roles.includes('founder');

  const groups: SidebarGroup[] = [
    {
      id: 'workspace',
      label: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Overview', icon: Home },
        { href: '/dashboard/contacts', label: 'Contacts', icon: Contact2 },
        { href: '/dashboard/pipeline', label: 'Pipeline', icon: LayoutGrid },
        { href: '/dashboard/tasks', label: 'Tasks', icon: CheckSquare },
        { href: '/dashboard/invoices', label: 'Invoices', icon: FileText },
        ...(isFounder ? [
          { href: '/dashboard/startup', label: 'My Startup', icon: Rocket },
          { href: '/dashboard/fundraising', label: 'Fundraising', icon: HandCoins }
        ] : []),
      ]
    },
    {
      id: 'discovery',
      label: 'Discovery',
      items: [
        { href: '/founders', label: 'Startups', icon: Rocket },
        { href: '/cofounders', label: 'Co-founders', icon: Users },
        { href: '/investors', label: 'Investors', icon: ShieldAlert },
        { href: '/mentors', label: 'Mentors', icon: GraduationCap },
        { href: '/services', label: 'Services', icon: Wrench },
      ]
    },
    {
      id: 'network',
      label: 'Network',
      items: [
        { href: '/community', label: 'Community', icon: Globe },
        { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
        { 
          href: '/dashboard/connections', 
          label: 'Connections', 
          icon: Users,
          showBadge: hasPendingPitches 
        },
      ]
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { href: '/dashboard/profile', label: 'My Profile', icon: User },
        { href: '#', label: 'Settings', icon: Settings, disabled: true },
      ]
    }
  ];

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="p-6">
        <Logo />
      </div>
      
      <nav className="flex-1 px-4 py-2 space-y-6 overflow-y-auto">
        {groups.map((group) => (
          <Collapsible
            key={group.id}
            open={expandedGroups[group.id]}
            onOpenChange={() => toggleGroup(group.id)}
            className="space-y-1"
          >
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-between hover:bg-transparent px-3 h-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400"
              >
                {group.label}
                {expandedGroups[group.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={item.disabled ? '#' : item.href}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group",
                    pathname === item.href 
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
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
                  {item.disabled && <span className="text-[8px] font-black uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Soon</span>}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ))}
      </nav>

      <div className="p-4 border-t mt-auto">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-11" 
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}

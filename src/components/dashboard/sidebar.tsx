
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
  FileText,
  Zap,
  CreditCard,
  Star,
  Eye,
  Calendar,
  Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useAuth, initiateSignOut, useUser, useFirestore } from '@/firebase';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface SidebarItem {
  href: string;
  label: string;
  icon: any;
  badgeCount?: number;
  showDot?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}

interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarItem[];
}

export function DashboardSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();
  const firestore = useFirestore();

  const [profile, setProfile] = useState<any>(null);
  const [unreadCounts, setUnreadCounts] = useState({
    connections: 0,
    messages: 0,
    notifications: 0,
    pitches: 0
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    dashboard: true,
    startup: true,
    investor: true,
    mentorship: true,
    network: true,
    community: true,
    workspace: true,
    account: true
  });

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
        console.error("Error loading sidebar profile:", error);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  // Unified listener for unread notifications to drive sidebar badges
  useEffect(() => {
    if (!firestore || !user?.uid) return;

    const q = query(
      collection(firestore, 'notifications'),
      where('recipientUid', '==', user.uid),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const counts = {
        connections: 0,
        messages: 0,
        notifications: 0,
        pitches: 0
      };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.type === 'message') {
          counts.messages++;
        } else if (['connection', 'investor_interest', 'cofounder_interest'].includes(data.type)) {
          counts.connections++;
        } else if (data.type === 'venture_pitch') {
          counts.pitches++;
        }
        counts.notifications++;
      });

      setUnreadCounts(counts);
    });

    return () => unsubscribe();
  }, [firestore, user?.uid]);

  const handleLogout = () => {
    initiateSignOut(auth);
    router.push('/login');
    if (onNavigate) onNavigate();
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const roles = (profile?.roles || (profile?.role ? [profile.role] : [])).filter(Boolean) as string[];
  const isFounder = roles.includes('founder');
  const isInvestor = roles.includes('investor');
  const isMentor = roles.includes('mentor');

  // Build groups dynamically based on roles
  const groups: SidebarGroup[] = [
    {
      id: 'dashboard',
      label: 'Main',
      items: [
        { href: '/dashboard', label: 'Overview', icon: Home, showDot: unreadCounts.notifications > 0 },
      ]
    }
  ];

  if (isFounder) {
    groups.push({
      id: 'startup',
      label: 'Startup',
      items: [
        { href: '/dashboard/startup', label: 'My Venture', icon: Rocket },
        { href: '/dashboard/fundraising', label: 'Fundraising', icon: HandCoins },
      ]
    });
  }

  if (isInvestor) {
    groups.push({
      id: 'investor',
      label: 'Investor',
      items: [
        { href: '/dashboard/pitches', label: 'Interests Sent', icon: Send },
        { href: '#', label: 'Saved Startups', icon: Star, disabled: true, comingSoon: true },
        { href: '#', label: 'Watchlist', icon: Eye, disabled: true, comingSoon: true },
      ]
    });
  }

  if (isMentor) {
    groups.push({
      id: 'mentorship',
      label: 'Mentorship',
      items: [
        { href: '/dashboard/connections', label: 'Mentorship Requests', icon: GraduationCap, badgeCount: unreadCounts.connections },
        { href: '#', label: 'Active Founders', icon: Users, disabled: true, comingSoon: true },
        { href: '#', label: 'Sessions', icon: Calendar, disabled: true, comingSoon: true },
      ]
    });
  }

  groups.push(
    {
      id: 'network',
      label: 'Network',
      items: [
        { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare, badgeCount: unreadCounts.messages },
        { href: '/dashboard/connections', label: 'Connections', icon: Users, badgeCount: unreadCounts.connections },
        { href: '/dashboard/pitches', label: 'Venture Pitches', icon: Zap, badgeCount: unreadCounts.pitches },
      ]
    },
    {
      id: 'community',
      label: 'Community',
      items: [
        { href: '/community', label: 'Community Feed', icon: Globe },
        { href: '/founders', label: 'Founders', icon: Rocket },
        { href: '/investors', label: 'Investors', icon: ShieldAlert },
        { href: '/mentors', label: 'Mentors', icon: GraduationCap },
      ]
    },
    {
      id: 'workspace',
      label: 'Workspace',
      items: [
        { href: '/dashboard/contacts', label: 'CRM Contacts', icon: Contact2 },
        { href: '/dashboard/pipeline', label: 'Sales Pipeline', icon: LayoutGrid },
        { href: '/dashboard/tasks', label: 'Task List', icon: CheckSquare },
        { href: '/dashboard/invoices', label: 'Billing Ledger', icon: FileText },
      ]
    },
    {
      id: 'account',
      label: 'Account',
      items: [
        { href: '/dashboard/profile', label: 'Settings', icon: Settings },
        { href: '/dashboard/billing', label: 'Subscription', icon: CreditCard },
      ]
    }
  );

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="p-6">
        <Logo onClick={onNavigate} />
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
                  onClick={() => {
                    if (!item.disabled && onNavigate) onNavigate();
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group",
                    pathname === item.href 
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    item.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-3 relative flex-1 min-w-0">
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.showDot && (
                      <span className="absolute -top-0.5 -left-0.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.comingSoon && (
                      <span className="text-[8px] font-black uppercase tracking-tighter text-slate-300 group-hover:text-slate-400">Coming Soon</span>
                    )}
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[10px] font-black rounded-full border-none shadow-sm shadow-destructive/20">
                        {item.badgeCount}
                      </Badge>
                    )}
                  </div>
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

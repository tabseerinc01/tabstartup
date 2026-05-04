'use client';

import { usePathname } from 'next/navigation';
import { 
  ShieldAlert, 
  Users, 
  Rocket, 
  Wrench, 
  Settings, 
  LayoutDashboard,
  ArrowLeft,
  Activity,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function AdminSidebar() {
  const pathname = usePathname();

  const adminMenuItems = [
    { href: '/control', label: 'Admin Overview', icon: LayoutDashboard, exact: true },
    { href: '/control/users', label: 'Manage Users', icon: Users },
    { href: '/control/startups', label: 'Startups', icon: Rocket },
    { href: '/control/services', label: 'Services', icon: Wrench },
    { href: '#', label: 'System Logs', icon: Activity, disabled: true },
    { href: '#', label: 'Compliance', icon: FileText, disabled: true },
  ];

  const isActive = (item: any) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-slate-950 text-slate-100 h-screen sticky top-0">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-2">
           <div className="p-1.5 bg-destructive rounded-lg">
             <ShieldAlert className="h-5 w-5 text-white" />
           </div>
           <span className="font-bold tracking-tighter text-lg uppercase">Admin Center</span>
        </div>
        <p className="text-[10px] text-slate-500 font-mono">TABSTARTUP ENGINE v1.0</p>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1">
        {adminMenuItems.map((item) => (
          <Link
            key={item.label}
            href={item.disabled ? '#' : item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive(item) 
                ? "bg-destructive text-white" 
                : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
              item.disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.disabled && <span className="ml-auto text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">LOCK</span>}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <Button 
          variant="outline" 
          className="w-full justify-start gap-3 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-900 hover:text-white rounded-xl" 
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </aside>
  );
}

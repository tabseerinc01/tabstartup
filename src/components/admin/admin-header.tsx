'use client';

import { ShieldCheck, Bell, Search, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function AdminHeader() {
  const { user } = useUser();
  const displayName = user?.displayName || user?.email?.split('@')[0] || "Admin";

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          System Active
        </h2>
        <div className="h-4 w-px bg-slate-200" />
        <div className="relative hidden lg:block w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="search"
            placeholder="Search system records..."
            className="pl-8 bg-slate-50 border-slate-200 h-9 rounded-lg"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-[10px] font-bold">
           <ShieldCheck className="h-3.3 w-3" /> SECURITY VERIFIED
        </div>
        
        <Button variant="ghost" size="icon" className="text-slate-500">
          <Bell className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-3 pl-2">
           <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-800">{displayName}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Root Access</p>
           </div>
           <Avatar className="h-9 w-9 border-2 border-destructive/20">
             <AvatarImage src={`https://picsum.photos/seed/${user?.uid}/40/40`} />
             <AvatarFallback className="bg-destructive text-white font-bold">{displayName[0]}</AvatarFallback>
           </Avatar>
        </div>
      </div>
    </header>
  );
}

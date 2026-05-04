'use client';

import { useState, useEffect } from 'react';
import { useFirestore, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { 
  Users, 
  Rocket, 
  Wrench, 
  Heart,
  Server,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export default function AdminOverviewPage() {
  const firestore = useFirestore();
  
  const [stats, setStats] = useState({
    users: 0,
    startups: 0,
    services: 0,
    interests: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!firestore) return;
    
    async function fetchData() {
      try {
        const [uSnap, sSnap, svSnap, pSnap] = await Promise.all([
          getDocs(collection(firestore, 'users')),
          getDocs(collection(firestore, 'startups')),
          getDocs(collection(firestore, 'services')),
          getDocs(collection(firestore, 'pitches'))
        ]);
        
        setStats({
          users: uSnap.size,
          startups: sSnap.size,
          services: svSnap.size,
          interests: pSnap.size
        });
      } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
          path: 'system_records',
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [firestore]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-destructive font-bold text-sm tracking-widest uppercase">
          <Server className="h-4 w-4" /> System Control
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 font-medium">Real-time platform metrics and user governance.</p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Users', value: stats.users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Startups', value: stats.startups, icon: Rocket, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Live Services', value: stats.services, icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Interests Log', value: stats.interests, icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow rounded-[2rem] overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-2xl", stat.bg)}>
                  <stat.icon className={cn("h-6 w-6", stat.color)} />
                </div>
                <div className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Platform Data</div>
              </div>
              <div>
                <div className="text-3xl font-black text-slate-900">
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin opacity-20" /> : stat.value}
                </div>
                <p className="text-sm font-bold text-slate-500 mt-1">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

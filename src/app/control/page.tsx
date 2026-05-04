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
  Loader2,
  TrendingUp,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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
        <p className="text-slate-500 font-medium">Real-time platform metrics and user governance overview.</p>
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

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card className="border-none shadow-sm rounded-[2.5rem]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Growth Trends
            </CardTitle>
            <CardDescription>Platform activity over the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent className="h-[240px] flex items-center justify-center border-2 border-dashed rounded-[2rem] m-6 mt-0">
             <div className="text-center space-y-2">
                <Activity className="h-10 w-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-400 font-medium">Analytics engine initializing...</p>
             </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-[2.5rem] bg-slate-900 text-white">
          <CardHeader>
            <CardTitle className="text-lg text-white">System Status</CardTitle>
            <CardDescription className="text-slate-400">Core platform health and integrity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             {[
               { label: 'Authentication Service', status: 'Healthy', color: 'bg-green-500' },
               { label: 'Firestore Database', status: 'Optimal', color: 'bg-green-500' },
               { label: 'Media Storage', status: 'Healthy', color: 'bg-green-500' },
               { label: 'Messaging Engine', status: 'Healthy', color: 'bg-green-500' }
             ].map((svc, i) => (
               <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50">
                  <span className="text-sm font-medium">{svc.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-tight opacity-60">{svc.status}</span>
                    <div className={cn("h-2 w-2 rounded-full", svc.color)} />
                  </div>
               </div>
             ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

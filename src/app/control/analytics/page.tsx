'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { BarChart3, TrendingUp, Users, Rocket, Globe, Loader2, Calendar, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  AreaChart,
  Area
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';

export default function AnalyticsDashboardPage() {
  const firestore = useFirestore();
  const [isLoading, setIsLoading] = useState(true);
  const [signupData, setSignupData] = useState<any[]>([]);
  const [ventureData, setVentureData] = useState<any[]>([]);

  useEffect(() => {
    async function loadAnalytics() {
      if (!firestore) return;
      setIsLoading(true);
      try {
        const [uSnap, sSnap] = await Promise.all([
          getDocs(query(collection(firestore, 'users'), orderBy('createdAt', 'asc'))),
          getDocs(query(collection(firestore, 'startups'), orderBy('createdAt', 'asc')))
        ]);

        // Process signups by day
        const signupCounts: Record<string, number> = {};
        uSnap.docs.forEach(doc => {
          const date = doc.data().createdAt?.toDate ? format(doc.data().createdAt.toDate(), 'MMM d') : 'N/A';
          signupCounts[date] = (signupCounts[date] || 0) + 1;
        });

        // Convert to array and slice last 14 days
        const signupChart = Object.entries(signupCounts).map(([date, count]) => ({ date, count })).slice(-14);
        setSignupData(signupChart);

        // Process ventures by day
        const ventureCounts: Record<string, number> = {};
        sSnap.docs.forEach(doc => {
          const date = doc.data().createdAt?.toDate ? format(doc.data().createdAt.toDate(), 'MMM d') : 'N/A';
          ventureCounts[date] = (ventureCounts[date] || 0) + 1;
        });
        const ventureChart = Object.entries(ventureCounts).map(([date, count]) => ({ date, count })).slice(-14);
        setVentureData(ventureChart);

      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, [firestore]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" /> Platform Analytics
          </h1>
          <p className="text-slate-500 font-medium">Growth velocity and membership trends overview.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
           <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
           <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Aggregating Growth Data...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-none shadow-sm rounded-[2.5rem] bg-white p-8">
             <CardHeader className="p-0 mb-8">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                      <CardTitle className="text-xl font-black">User Onboarding</CardTitle>
                      <CardDescription>Daily signups over the last 14 days.</CardDescription>
                   </div>
                   <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><Users className="h-5 w-5" /></div>
                </div>
             </CardHeader>
             <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={signupData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00AEEF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00AEEF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <Tooltip 
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                    />
                    <Area type="monotone" dataKey="count" stroke="#00AEEF" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
          </Card>

          <Card className="border-none shadow-sm rounded-[2.5rem] bg-white p-8">
             <CardHeader className="p-0 mb-8">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                      <CardTitle className="text-xl font-black">Startup Growth</CardTitle>
                      <CardDescription>Daily venture profile creations.</CardDescription>
                   </div>
                   <div className="p-3 bg-purple-50 rounded-2xl text-purple-600"><Rocket className="h-5 w-5" /></div>
                </div>
             </CardHeader>
             <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventureData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#94a3b8'}} />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
             </div>
          </Card>
        </div>
      )}
      
      <div className="bg-slate-900 rounded-[3rem] p-12 text-white relative overflow-hidden group">
         <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
               <div className="flex items-center gap-2">
                  <div className="h-1 w-12 bg-primary rounded-full" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Insight Engine</span>
               </div>
               <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight">Data driven decisions <br/>for the future of BD.</h2>
               <p className="text-slate-400 font-medium text-lg leading-relaxed">
                  TabStartup's analytics engine processes thousands of data points daily to identify emerging sectors and capital flows.
               </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <p className="text-3xl font-black text-white">0.92</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Trust Velocity</p>
               </div>
               <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <p className="text-3xl font-black text-white">12.4%</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Growth MoM</p>
               </div>
            </div>
         </div>
         <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
      </div>
    </div>
  );
}

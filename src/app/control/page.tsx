'use client';

import { useState, useEffect } from 'react';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, where, limit } from 'firebase/firestore';
import { 
  Users, 
  Rocket, 
  Wrench, 
  Heart,
  Server,
  Loader2,
  TrendingUp,
  Activity,
  DatabaseZap,
  Globe,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function AdminOverviewPage() {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [stats, setStats] = useState({
    users: 0,
    startups: 0,
    services: 0,
    pitches: 0,
    seoPages: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSeedingSEO, setIsSeedingSEO] = useState(false);

  const fetchData = async () => {
    if (!firestore) return;
    setIsLoading(true);
    try {
      const [uSnap, sSnap, svSnap, pSnap, seoSnap] = await Promise.all([
        getDocs(collection(firestore, 'users')),
        getDocs(collection(firestore, 'startups')),
        getDocs(collection(firestore, 'services')),
        getDocs(collection(firestore, 'venturePitches')),
        getDocs(collection(firestore, 'seoPages'))
      ]);
      
      setStats({
        users: uSnap.size,
        startups: sSnap.size,
        services: svSnap.size,
        pitches: pSnap.size,
        seoPages: seoSnap.size
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
  };

  useEffect(() => {
    fetchData();
  }, [firestore]);

  const handleSeedSEOPages = async () => {
    if (!firestore || !user) return;
    setIsSeedingSEO(true);

    try {
      const pages = [
        {
          slug: "fintech-startups-bangladesh",
          type: "startup",
          title: "Top Fintech Startups in Bangladesh | TabStartup Directory",
          metaDescription: "Discover the leading financial technology ventures in Bangladesh. From digital payments to credit scoring, explore the fintech revolution.",
          h1: "Fintech Innovation in Bangladesh",
          intro: "Bangladesh is witnessing a digital finance revolution. From mobile financial services to innovative credit scoring models, fintech is at the forefront of financial inclusion in the country. This curated directory showcases the ventures building the future of money in one of the world's fastest-growing digital economies.",
          filters: { industry: "Fintech", location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "ecommerce-startups-bangladesh",
          type: "startup",
          title: "Leading E-commerce Ventures in Bangladesh | TabStartup Hub",
          metaDescription: "Explore the startups redefining the retail landscape in Bangladesh. Curated list of high-growth e-commerce and marketplace ventures.",
          h1: "E-commerce Leaders in Bangladesh",
          intro: "The retail landscape in Bangladesh is transforming rapidly. With a growing middle class and increasing internet penetration, e-commerce startups are creating seamless shopping experiences for millions. Explore the innovators redefining logistics, delivery, and online commerce.",
          filters: { industry: "E-commerce", location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "find-cofounder-bangladesh",
          type: "cofounder",
          title: "Find a Co-founder in Bangladesh | Startup Partner Search",
          metaDescription: "Looking for a technical or business partner for your startup? Browse founders in Bangladesh who are looking for strategic co-founders.",
          h1: "Build Your Dream Team in Bangladesh",
          intro: "Building a startup is a team sport. This directory helps visionary founders connect with strategic partners who share their passion and possess complementary skills. Whether you need a CTO or a Head of Growth, find the person who will help you scale your vision.",
          filters: { location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "startup-investors-bangladesh",
          type: "investor",
          title: "Startup Investors in Bangladesh | Angel & VC Directory",
          metaDescription: "Connect with angel investors and venture capital firms looking to back the next generation of global startups in Bangladesh.",
          h1: "Venture Capital & Angel Investors",
          intro: "Accessing strategic capital is a critical step for growth. This list features angel investors, venture capital firms, and ecosystem supporters who are actively looking to back high-potential startups in the region. Discover partners who bring more than just money to the table.",
          filters: { location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "saas-startups-bangladesh",
          type: "startup",
          title: "B2B SaaS Companies in Bangladesh | Business Software Hub",
          metaDescription: "Discover Software-as-a-Service startups building specialized tools for businesses in the emerging market context.",
          h1: "The Rise of SaaS in Bangladesh",
          intro: "Software as a Service is helping local businesses automate and scale like never before. These ventures provide specialized software for everything from HR management to inventory control, built specifically for the unique challenges of the emerging market context.",
          filters: { industry: "SaaS", location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "ai-startups-bangladesh",
          type: "startup",
          title: "AI & Machine Learning Startups in Bangladesh | Tech Directory",
          metaDescription: "Curated list of startups leveraging Artificial Intelligence and data science to solve local and global problems in Bangladesh.",
          h1: "Artificial Intelligence Innovators",
          intro: "Artificial Intelligence is no longer a buzzword; it's a tool for solving local problems. From natural language processing for Bangla to computer vision for agriculture, these startups are leveraging data to build intelligent, autonomous solutions.",
          filters: { industry: "AI", location: "Bangladesh" },
          status: "active"
        },
        {
          slug: "agritech-ventures-bangladesh",
          type: "startup",
          title: "AgriTech Innovations in Bangladesh | Agriculture Tech Hub",
          metaDescription: "Explore the startups transforming agriculture in Bangladesh through IoT, data, and supply chain technology.",
          h1: "Revolutionizing Agriculture with Tech",
          intro: "As an agrarian economy, technology in agriculture is vital for Bangladesh's food security and economic growth. These startups are providing farmers with real-time data, better market access, and advanced supply chain management tools.",
          filters: { industry: "AgriTech", location: "Bangladesh" },
          status: "active"
        }
      ];

      for (const page of pages) {
        const q = query(collection(firestore, 'seoPages'), where('slug', '==', page.slug), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) {
          await addDoc(collection(firestore, 'seoPages'), {
            ...page,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      toast({ title: "SEO Directories Seeded", description: "Successfully created initial SEO landing pages." });
      fetchData();
    } catch (error) {
      toast({ title: "Seeding Failed", variant: "destructive" });
    } finally {
      setIsSeedingSEO(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-destructive font-bold text-sm tracking-widest uppercase">
            <Server className="h-4 w-4" /> System Control
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 font-medium">Real-time platform metrics and user governance overview.</p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            onClick={handleSeedSEOPages} 
            disabled={isSeedingSEO} 
            variant="outline" 
            className="rounded-xl h-11 gap-2 border-primary/20 hover:bg-primary/5 text-primary"
          >
            {isSeedingSEO ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
            Seed SEO Hubs
          </Button>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total Users', value: stats.users, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Startups', value: stats.startups, icon: Rocket, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Live Services', value: stats.services, icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'Venture Pitches', value: stats.pitches, icon: Zap, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'SEO Hubs', value: stats.seoPages, icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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

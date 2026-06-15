'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  limit, 
  QueryConstraint,
  getCountFromServer 
} from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { 
  Loader2, 
  AlertCircle, 
  ArrowLeft, 
  Rocket, 
  MapPin, 
  ArrowRight, 
  Globe, 
  Users, 
  Wrench,
  TrendingUp,
  ShieldCheck,
  Handshake,
  UserPlus,
  Star,
  EyeOff,
  Zap,
  LayoutGrid
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';

interface SEOPageClientProps {
  slug: string;
  initialPageData: any;
}

export default function SEOPageClient({ slug, initialPageData }: SEOPageClientProps) {
  const firestore = useFirestore();
  
  const [pageData] = useState<any>(initialPageData);
  const [startups, setStartups] = useState<any[]>([]);
  const [featuredStartups, setFeaturedStartups] = useState<any[]>([]);
  const [otherPages, setOtherPages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartupsLoading, setIsStartupsLoading] = useState(false);
  
  const [stats, setStats] = useState({
    startups: 0,
    founders: 0,
    investors: 0,
    cofounderOpp: 0
  });

  useEffect(() => {
    async function fetchPageContent() {
      if (!firestore || !pageData || pageData.status !== 'active') {
        setIsLoading(false);
        return;
      }

      setIsStartupsLoading(true);
      try {
        // 1. Fetch filtered startups
        const constraints: QueryConstraint[] = [
          where('status', '==', 'active'),
          limit(20)
        ];

        if (pageData.filters?.industry) {
          constraints.push(where('industry', '==', pageData.filters.industry));
        }
        if (pageData.filters?.location) {
          constraints.push(where('location', '==', pageData.filters.location));
        }
        if (pageData.filters?.stage) {
          constraints.push(where('stage', '==', pageData.filters.stage));
        }

        const startupsQ = query(collection(firestore, 'startups'), ...constraints);
        const startupsSnap = await getDocs(startupsQ);
        setStartups(startupsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 2. Fetch Featured Startups (Global)
        const featuredQ = query(
          collection(firestore, 'startups'),
          where('status', '==', 'active'),
          where('featured', '==', true),
          limit(3)
        );
        const featuredSnap = await getDocs(featuredQ);
        setFeaturedStartups(featuredSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // 3. Fetch ecosystem stats
        const [sCount, fCount, iCount, cCount] = await Promise.all([
          getCountFromServer(query(collection(firestore, 'startups'), where('status', '==', 'active'))),
          getCountFromServer(query(collection(firestore, 'users'), where('role', '==', 'founder'))),
          getCountFromServer(query(collection(firestore, 'users'), where('role', '==', 'investor'))),
          getCountFromServer(query(collection(firestore, 'users'), where('lookingForCofounder', '==', true)))
        ]);

        setStats({
          startups: sCount.data().count,
          founders: fCount.data().count,
          investors: iCount.data().count,
          cofounderOpp: cCount.data().count
        });

        // 4. Fetch other SEO pages for recommendations
        const otherPagesQ = query(
          collection(firestore, 'seoPages'), 
          where('status', '==', 'active'),
          limit(10)
        );
        const otherSnap = await getDocs(otherPagesQ);
        const filteredOther = otherSnap.docs
          .map(d => d.data())
          .filter(p => p.slug !== slug)
          .sort(() => Math.random() - 0.5) // Semi-randomize
          .slice(0, 4);
        setOtherPages(filteredOther);

      } catch (error) {
        console.error("Error fetching dynamic content:", error);
      } finally {
        setIsStartupsLoading(false);
        setIsLoading(false);
      }
    }

    fetchPageContent();
  }, [firestore, pageData, slug]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">Assembling curated directory...</p>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (!pageData || pageData.status !== 'active') {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-bold mb-2 text-slate-900">Directory Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
            The curated directory or resources you are looking for might have been moved or is currently being updated by our team.
          </p>
          <Button asChild className="rounded-full px-8">
            <Link href="/">Return to Home</Link>
          </Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  // Determine dynamic CTA button label and link
  const getPrimaryCTA = () => {
    switch (pageData.type) {
      case 'startup':
        return { label: 'Create Startup Profile', href: '/signup?role=founder' };
      case 'cofounder':
        return { label: 'Find a Co-founder', href: '/cofounders' };
      case 'investor':
        return { label: 'Explore Investment Opportunities', href: '/founders' };
      default:
        return { label: 'Create Profile', href: '/signup' };
    }
  };

  const primaryCTA = getPrimaryCTA();

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      
      {/* Top Conversion Banner */}
      <div className="bg-primary/10 border-b border-primary/20 py-4 px-4">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
            <p className="text-sm font-bold text-slate-900">
              Connect with founders, investors, and startup talent.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" className="rounded-full px-6 h-10 font-bold shadow-lg shadow-primary/20" asChild>
              <Link href="/signup">Get Started Free</Link>
            </Button>
            <Button size="sm" variant="outline" className="rounded-full px-6 h-10 font-bold bg-background border-primary/20 hover:bg-primary/5 text-primary" asChild>
              <Link href="/founders">Explore Ecosystem</Link>
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto space-y-12 pb-20">
          <div className="flex items-center justify-between mb-2">
            <Link 
              href="/seo" 
              className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:opacity-70 transition-opacity"
            >
              <LayoutGrid className="h-4 w-4" /> Full Directory Index
            </Link>
            <Link 
              href="/founders" 
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Listings
            </Link>
          </div>

          {/* Hero Section */}
          <div className="bg-background p-8 md:p-16 rounded-[3rem] shadow-2xl border-none space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-12 bg-primary rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Curated Hub</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 leading-[1.1]">
                {pageData.h1}
              </h1>
            </div>

            <div className="prose prose-lg max-w-none">
              <div className="text-slate-600 leading-relaxed text-xl whitespace-pre-wrap font-medium">
                {pageData.intro}
              </div>
            </div>

            <div className="pt-10 border-t border-slate-50">
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="bg-primary/5 text-primary border-none rounded-lg px-4 py-1 font-bold capitalize">
                  {pageData.type}s
                </Badge>
                {pageData.filters?.industry && (
                  <Badge variant="outline" className="rounded-lg px-4 py-1 font-bold border-slate-200 text-slate-500">
                    {pageData.filters.industry}
                  </Badge>
                )}
                {pageData.filters?.location && (
                  <Badge variant="outline" className="rounded-lg px-4 py-1 font-bold border-slate-200 text-slate-500">
                    {pageData.filters.location}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Featured Startups Section */}
          {featuredStartups.length > 0 && (
            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-100">
              <div className="flex items-center gap-3 px-4">
                <div className="p-2 bg-amber-50 rounded-xl">
                  <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Featured Ventures</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {featuredStartups.map((s) => {
                  const startupIdentifier = s.slug || s.ownerUid || s.id;
                  return (
                    <Card key={s.id} className="group border-none shadow-lg hover:shadow-2xl transition-all duration-300 bg-background rounded-[2rem] overflow-hidden flex flex-col">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[9px] font-black uppercase tracking-widest px-2">Featured</Badge>
                          <Badge variant="secondary" className="text-[9px] font-bold">{s.stage}</Badge>
                        </div>
                        <CardTitle className="text-lg font-black group-hover:text-primary transition-colors truncate">{s.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-4">
                        <p className="text-xs text-slate-500 font-medium line-clamp-3 leading-relaxed italic">
                          "{s.shortDescription || 'A high-potential venture building the future.'}"
                        </p>
                        <Button variant="outline" className="w-full rounded-xl font-bold text-xs h-9 border-slate-200 hover:bg-primary hover:text-white hover:border-primary transition-all" asChild>
                          <Link href={`/startups/${startupIdentifier}`}>View Venture</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Main List Section */}
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-200">
            <div className="flex items-center justify-between px-4">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                <Rocket className="h-6 w-6 text-primary" /> 
                Discovery List 
                <span className="text-slate-300 ml-1 font-medium">({startups.length})</span>
              </h2>
              <div className="h-px flex-1 bg-slate-200 mx-6 hidden md:block" />
            </div>

            {isStartupsLoading ? (
              <div className="flex py-20 justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
              </div>
            ) : startups.length === 0 ? (
              <Card className="border-2 border-dashed rounded-[2.5rem] bg-background/50 py-20 text-center">
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-full w-fit mx-auto">
                    <Rocket className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 font-bold italic">No ventures matching these criteria currently listed.</p>
                  <Button variant="link" asChild className="text-primary font-bold">
                    <Link href="/founders">Explore entire directory</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                {startups.map((s) => {
                  const startupIdentifier = s.slug || s.ownerUid || s.id;
                  return (
                    <Card key={s.id} className="group overflow-hidden rounded-[2rem] border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background">
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div className="flex-1 p-8 space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <h3 className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors">{s.name}</h3>
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                  <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-none rounded-md px-2 h-5">
                                    {s.industry}
                                  </Badge>
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {s.location || 'Remote'}
                                  </span>
                                </div>
                              </div>
                              <Badge variant="outline" className="rounded-full border-slate-200 font-bold text-[10px] h-6 px-3">
                                {s.stage}
                              </Badge>
                            </div>
                            
                            <p className="text-slate-600 leading-relaxed font-medium line-clamp-2">
                              {s.shortDescription || "A revolutionary startup building the future of their industry."}
                            </p>

                            <div className="pt-4 flex items-center gap-4">
                              <Button className="rounded-xl font-bold h-11 px-6 group-hover:scale-105 transition-transform" asChild>
                                <Link href={`/startups/${startupIdentifier}`}>
                                  View Profile <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                              </Button>
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter hidden sm:block">
                                Venture Record: {s.id.slice(0, 8)}
                              </span>
                            </div>
                          </div>
                          <div className="w-full md:w-48 bg-slate-50 flex items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 group-hover:bg-primary/5 transition-colors">
                            <div className="text-center p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Funding</p>
                                <p className="text-xl font-black text-slate-900">{s.fundingNeed || 'TBD'}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Dynamic Platform Stats Section */}
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Platform Ecosystem</h2>
              <p className="text-slate-500 font-medium">Real-time metrics from our growing network.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {[
                 { label: 'Startups', value: stats.startups, icon: Rocket, color: 'text-blue-600', bg: 'bg-blue-50' },
                 { label: 'Founders', value: stats.founders, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                 { label: 'Investors', value: stats.investors, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
                 { label: 'Opportunities', value: stats.cofounderOpp, icon: UserPlus, color: 'text-orange-600', bg: 'bg-orange-50' },
               ].map((stat, i) => (
                 <Card key={i} className="border-none shadow-md rounded-2xl overflow-hidden bg-background">
                    <CardContent className="p-6 text-center space-y-2">
                       <div className={`p-2 w-fit mx-auto rounded-xl ${stat.bg} ${stat.color} mb-1`}>
                          <stat.icon className="h-5 w-5" />
                       </div>
                       <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                    </CardContent>
                 </Card>
               ))}
            </div>
          </section>

          {/* Explore More Section */}
          <section className="space-y-10 pt-12 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Explore More Startup Directories</h2>
                <p className="text-slate-500 font-medium">Discover other curated niches and resource hubs in the TabStartup ecosystem.</p>
              </div>
              <Button variant="ghost" asChild className="hidden sm:flex font-bold text-primary gap-2">
                <Link href="/seo">View Master Index <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {otherPages.map((page) => (
                <Link key={page.slug} href={`/seo/${page.slug}`}>
                  <Card className="hover:border-primary/30 transition-all cursor-pointer group bg-background shadow-sm hover:shadow-md h-full rounded-3xl overflow-hidden border-slate-100">
                    <CardHeader className="p-6 pb-2">
                      <div className="flex items-center gap-3 mb-2">
                         <div className="p-2 bg-primary/5 rounded-lg text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                           <Globe className="h-4 w-4" />
                         </div>
                         <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors line-clamp-1">{page.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 pt-0">
                       <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">
                         {page.metaDescription || "Find top-tier ventures and support networks in this curated ecosystem hub."}
                       </p>
                       <div className="mt-4 flex items-center text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0">
                          Explore Directory <ArrowRight className="ml-1 h-3 w-3" />
                       </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link href="/services">
                <Card className="hover:border-primary/30 transition-colors cursor-pointer group bg-primary/5 border-primary/10 rounded-2xl">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary text-white rounded-lg">
                        <Wrench className="h-5 w-5" />
                      </div>
                      <span className="font-bold text-primary">Services Marketplace</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </CardContent>
                </Card>
              </Link>

              <Link href="/cofounders">
                <Card className="hover:border-primary/30 transition-colors cursor-pointer group bg-accent/5 border-accent/10 rounded-2xl">
                  <CardContent className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent text-white rounded-lg">
                        <Users className="h-5 w-5" />
                      </div>
                      <span className="font-bold text-accent">Co-founder Directory</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-accent" />
                  </CardContent>
                </Card>
              </Link>
            </div>

            <div className="sm:hidden pt-4">
               <Button variant="outline" className="w-full h-12 rounded-xl font-bold" asChild>
                  <Link href="/seo">Full Directory Index</Link>
               </Button>
            </div>
          </section>

          {/* Join the Ecosystem CTA */}
          <section className="bg-slate-900 rounded-[3rem] p-12 md:p-20 text-center space-y-8 shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
            <div className="space-y-4">
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">Join the Startup Ecosystem</h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg font-medium leading-relaxed">
                Connect with visionary founders, strategic investors, and experienced mentors. Start building the future with TabStartup.
              </p>
            </div>
            
            <div className="pt-4 flex flex-wrap justify-center gap-4">
              <Button size="lg" className="rounded-full px-10 h-14 text-base font-bold bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20" asChild>
                <Link href={primaryCTA.href}>{primaryCTA.label}</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-700 text-white hover:bg-slate-800" asChild>
                <Link href="/founders">Explore Startups</Link>
              </Button>
              <Button size="lg" variant="secondary" className="rounded-full px-10 h-14 text-base font-bold bg-white text-slate-900 hover:bg-slate-100" asChild>
                <Link href="/signup">Join TabStartup</Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit, QueryConstraint } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Loader2, AlertCircle, ArrowLeft, Rocket, MapPin, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface SEOPageClientProps {
  slug: string;
  initialPageData: any;
}

export default function SEOPageClient({ slug, initialPageData }: SEOPageClientProps) {
  const firestore = useFirestore();
  
  const [pageData] = useState<any>(initialPageData);
  const [startups, setStartups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartupsLoading, setIsStartupsLoading] = useState(false);

  useEffect(() => {
    async function fetchFilteredStartups() {
      if (!firestore || !pageData || pageData.status !== 'active') {
        setIsLoading(false);
        return;
      }

      setIsStartupsLoading(true);
      try {
        const constraints: QueryConstraint[] = [
          where('status', '==', 'active'),
          limit(20)
        ];

        // Dynamically apply filters from the document provided by the server
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
      } catch (error) {
        console.error("Error fetching dynamic startups:", error);
      } finally {
        setIsStartupsLoading(false);
        setIsLoading(false);
      }
    }

    fetchFilteredStartups();
  }, [firestore, pageData]);

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

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto space-y-12">
          <Link 
            href="/founders" 
            className="inline-flex items-center gap-2 text-sm font-bold text-primary mb-2 hover:opacity-70 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Directory
          </Link>

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

          {/* Startups List Section */}
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
                {startups.map((s) => (
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
                              <Link href={`/startups/${s.ownerUid}`}>
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
                ))}
              </div>
            )}
          </section>

          {/* Call to Action */}
          <div className="bg-slate-900 rounded-[3rem] p-12 text-center space-y-6 shadow-2xl">
             <h3 className="text-3xl font-black text-white tracking-tight">Looking for something specific?</h3>
             <p className="text-slate-400 max-w-md mx-auto font-medium">
               Join TabStartup today to access our full network of founders, investors, and mentors.
             </p>
             <div className="pt-4 flex flex-wrap justify-center gap-4">
                <Button size="lg" className="rounded-full px-10 h-14 text-base font-bold bg-white text-slate-900 hover:bg-slate-100" asChild>
                  <Link href="/signup">Join Community</Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-10 h-14 text-base font-bold border-slate-700 text-white hover:bg-slate-800" asChild>
                  <Link href="/founders">Browse Directory</Link>
                </Button>
             </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

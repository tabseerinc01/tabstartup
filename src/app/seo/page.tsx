'use client';

import { useState } from 'react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Globe, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function SEODirectoryPage() {
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');

  const activePagesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'seoPages'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore]);

  const { data: pages, isLoading } = useCollection(activePagesQuery);

  const filteredPages = (pages || []).filter(page => 
    page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.metaDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    page.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 mb-2">
               <div className="h-1 w-12 bg-primary rounded-full" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Master Directory</span>
               <div className="h-1 w-12 bg-primary rounded-full" />
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 leading-tight">
              Startup Directories & <span className="text-primary">Opportunities</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-medium leading-relaxed">
              Explore curated insights into Bangladesh's evolving startup landscape. From fintech deep-dives to co-founder search tools.
            </p>
          </div>

          <div className="max-w-xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-[2.5rem] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
            <Input 
              placeholder="Search directories (e.g. Fintech, E-commerce)..." 
              className="pl-14 h-16 rounded-[2rem] shadow-2xl border-none bg-background text-lg relative z-10 focus-visible:ring-primary/20"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex py-24 justify-center">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary opacity-20" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing Hubs...</p>
              </div>
            </div>
          ) : filteredPages.length === 0 ? (
            <Card className="border-2 border-dashed rounded-[3rem] bg-background/50 py-24 text-center border-slate-200">
              <CardContent className="space-y-6">
                <div className="p-6 bg-muted/50 rounded-full w-fit mx-auto">
                  <Globe className="h-12 w-12 text-slate-300" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">No matching directories found</p>
                  <p className="text-slate-500 font-medium">Try different keywords or browse our entire collection below.</p>
                </div>
                <Button variant="outline" onClick={() => setSearchTerm('')} className="rounded-full px-8 h-12 font-bold">
                  View All Directories
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {filteredPages.map((page) => (
                <Link key={page.id} href={`/seo/${page.slug}`}>
                  <Card className="group border-none shadow-lg hover:shadow-2xl transition-all duration-500 bg-background rounded-[2.5rem] overflow-hidden h-full flex flex-col relative">
                    <CardHeader className="p-8 pb-4 relative z-10">
                      <div className="flex justify-between items-start mb-6">
                        <div className="p-4 bg-primary/5 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                          <Globe className="h-7 w-7" />
                        </div>
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-4 py-1 font-bold capitalize text-[10px] tracking-widest">
                          {page.type} Hub
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl font-black group-hover:text-primary transition-colors leading-tight mb-2">
                        {page.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 flex-1 flex flex-col justify-between relative z-10">
                      <p className="text-slate-500 leading-relaxed font-medium line-clamp-3 mb-8 italic">
                        "{page.metaDescription}"
                      </p>
                      <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                        <div className="flex items-center text-sm font-bold text-primary transition-all group-hover:gap-3 gap-1">
                          Explore This Hub <ArrowRight className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">
                          Index Ref: {page.slug.slice(0, 12)}
                        </span>
                      </div>
                    </CardContent>
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

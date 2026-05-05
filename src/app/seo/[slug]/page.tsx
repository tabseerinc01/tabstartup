'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DynamicSEOPage() {
  const { slug } = useParams();
  const firestore = useFirestore();
  const [pageData, setPageData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSEOPage() {
      if (!firestore || !slug) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(firestore, 'seoPages'),
          where('slug', '==', slug),
          where('status', '==', 'active'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setPageData(snap.docs[0].data());
        }
      } catch (error) {
        console.error("Error fetching SEO page:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSEOPage();
  }, [firestore, slug]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (!pageData) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4 opacity-20" />
          <h1 className="text-3xl font-bold mb-2 text-slate-900">Directory Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md leading-relaxed">
            The curated directory or resources you are looking for might have been moved or is currently being updated.
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
        <div className="max-w-4xl mx-auto">
          <Link 
            href="/founders" 
            className="inline-flex items-center gap-2 text-sm font-bold text-primary mb-8 hover:opacity-70 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Directory
          </Link>

          <div className="bg-background p-8 md:p-16 rounded-[3rem] shadow-2xl border-none space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-12 bg-primary rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Curated Resources</span>
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
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

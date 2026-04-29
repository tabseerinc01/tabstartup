
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Globe, Tag, Loader2, Rocket, Share2, HandCoins, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function StartupPublicProfilePage() {
  const { uid } = useParams();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !uid) return null;
    return doc(firestore, 'startups', uid as string);
  }, [firestore, uid]);

  const { data: startup, isLoading } = useDoc(startupRef);

  useEffect(() => {
    if (!firestore || !uid) return;

    // Record the view
    const viewsRef = collection(firestore, 'startups', uid as string, 'views');
    addDoc(viewsRef, {
      startupId: uid,
      viewerId: user?.uid || 'anonymous',
      timestamp: serverTimestamp(),
    }).catch(err => console.error("Failed to record view:", err));
  }, [firestore, uid, user]);

  const copyListingLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Startup listing link copied to clipboard.",
    });
  };

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

  if (!startup) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">Startup not found</h1>
          <Button asChild><Link href="/founders">Browse Founders</Link></Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <Card className="overflow-hidden border-none shadow-xl rounded-3xl">
            <div className="h-32 bg-gradient-to-r from-primary via-accent to-primary opacity-90" />
            <div className="px-6 md:px-12 pb-12 -mt-12">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-extrabold tracking-tight">{startup.name}</h1>
                    <Badge variant="secondary" className="px-3 py-1">{startup.stage}</Badge>
                  </div>
                  <p className="text-xl text-primary font-semibold">{startup.industry}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={copyListingLink} className="rounded-xl h-12 w-12">
                    <Share2 className="h-5 w-5" />
                  </Button>
                  <Button asChild className="rounded-xl h-12 px-6">
                    <Link href={`/founders/${startup.ownerUid}`}>View Founder</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  <section>
                    <h3 className="text-2xl font-bold mb-4">About the Venture</h3>
                    <p className="text-muted-foreground text-lg leading-relaxed">{startup.shortDescription}</p>
                  </section>

                  {startup.pitchDeckUrl && (
                    <section className="bg-primary/5 p-8 rounded-3xl border border-primary/10">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <Rocket className="h-6 w-6 text-primary" /> Pitch Deck
                        </h3>
                        <Button variant="ghost" asChild className="text-primary hover:text-primary hover:bg-primary/10">
                          <a href={startup.pitchDeckUrl} target="_blank" rel="noopener noreferrer">
                            Open in New Tab <ExternalLink className="h-4 w-4 ml-2" />
                          </a>
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground italic">Pitch deck is available for review by interested investors and partners.</p>
                    </section>
                  )}
                </div>

                <div className="space-y-10">
                  <section className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Venture Details</h3>
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <MapPin className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">{startup.location || 'Remote'}</span>
                      </div>
                      {startup.website && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Globe className="h-5 w-5 text-primary" />
                          <a href={startup.website} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline text-primary">
                            {startup.website.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      )}
                      <div className="pt-4 border-t space-y-4">
                        <div className="flex items-center gap-2">
                          <HandCoins className="h-5 w-5 text-primary" />
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Fundraising</span>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-primary">{startup.fundingNeed || 'TBD'}</p>
                          <p className="text-xs text-muted-foreground mt-1">Status: {startup.fundraisingStatus || 'Open'}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-muted/30 p-6 rounded-3xl border border-muted-foreground/5">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {startup.tags?.map((tag: string) => (
                        <Badge key={tag} variant="outline" className="text-xs px-3 py-1 rounded-xl bg-background border-primary/20 text-primary">
                          <Tag className="h-3 w-3 mr-1" /> {tag}
                        </Badge>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

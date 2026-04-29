'use client';

import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Globe, Loader2, ArrowLeft, CheckCircle2, MessageSquare, Briefcase, TrendingUp, Info } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function InvestorPublicProfilePage() {
  const { uid } = useParams();
  const firestore = useFirestore();

  const investorRef = useMemoFirebase(() => {
    if (!firestore || !uid) return null;
    return doc(firestore, 'users', uid as string);
  }, [firestore, uid]);

  const { data: investor, isLoading } = useDoc(investorRef);

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

  if (!investor || investor.role !== 'investor') {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="text-2xl font-bold mb-4">Investor not found</h1>
          <Button asChild><Link href="/investors">Back to Investors</Link></Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const displayName = investor.fullName || investor.name;
  const imageId = investor.uid || investor.id || 'investor';

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" asChild className="mb-6 -ml-4">
            <Link href="/investors" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Directory</Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-xl rounded-3xl">
            <div className="h-48 bg-gradient-to-r from-accent/20 via-primary/20 to-accent/10" />
            <div className="px-6 md:px-12 pb-12 -mt-20">
              <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                <div className="relative h-40 w-40 rounded-3xl overflow-hidden border-8 border-background bg-muted shrink-0 shadow-2xl">
                  <Image 
                    src={investor.imageUrl || `https://picsum.photos/seed/${imageId}/400/400`} 
                    alt={displayName} 
                    fill 
                    className="object-cover" 
                  />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-4xl font-extrabold tracking-tight">{displayName}</h1>
                    {investor.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                  </div>
                  <p className="text-xl text-primary font-semibold">{investor.headline}</p>
                  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5"><MapPin className="h-5 w-5 text-primary" /> {investor.location || "Global"}</span>
                    <Badge variant={investor.isOpenToPitches ? "default" : "secondary"} className="rounded-lg h-7">
                      {investor.isOpenToPitches ? "Accepting Pitches" : "Consulting Only"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mb-12">
                <Button className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base" disabled={!investor.isOpenToPitches}>
                  <MessageSquare className="h-5 w-5" /> Pitch Venture
                </Button>
                <Button variant="outline" className="flex-1 md:flex-none h-12 px-8 gap-2 rounded-2xl text-base">
                  <Briefcase className="h-5 w-5" /> Investment Criteria
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  {investor.bio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4">Professional Bio</h3>
                      <p className="text-muted-foreground text-lg leading-relaxed">{investor.bio}</p>
                    </section>
                  )}

                  {investor.investorNote && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-primary" /> Investment Focus
                      </h3>
                      <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 relative">
                        <span className="absolute -top-4 -left-2 text-6xl text-primary/20 font-serif">“</span>
                        <p className="text-primary text-xl font-medium italic leading-relaxed">
                          {investor.investorNote}
                        </p>
                      </div>
                    </section>
                  )}
                  
                  <section className="bg-muted/30 p-8 rounded-3xl border border-dashed border-primary/20">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <Info className="h-5 w-5 text-primary" /> How to connect
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {investor.isOpenToPitches 
                        ? "This investor is currently looking for new opportunities. Use the 'Pitch Venture' button to share your deck and executive summary." 
                        : "This investor is not currently reviewing new cold pitches. You can still reach out for mentorship or advice if they have indicated availability."}
                    </p>
                    <div className="flex gap-4">
                       {investor.socialLinks?.linkedin && (
                        <Button variant="outline" size="sm" asChild className="rounded-xl">
                          <a href={investor.socialLinks.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn Profile</a>
                        </Button>
                      )}
                      {investor.socialLinks?.website && (
                        <Button variant="outline" size="sm" asChild className="rounded-xl">
                          <a href={investor.socialLinks.website} target="_blank" rel="noopener noreferrer">Firm Website</a>
                        </Button>
                      )}
                    </div>
                  </section>
                </div>

                <div className="space-y-10">
                  <section className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-4">Thesis & Stage</h3>
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Preferred Stage</p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(investor.preferredStage) ? (
                            investor.preferredStage.map((s: string) => <Badge key={s} variant="secondary" className="rounded-xl">{s}</Badge>)
                          ) : investor.preferredStage ? (
                            <Badge variant="secondary" className="rounded-xl">{investor.preferredStage}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Any early stage</span>
                          )}
                        </div>
                      </div>
                      
                      {investor.skills && investor.skills.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Sectors of interest</p>
                          <div className="flex flex-wrap gap-2">
                            {investor.skills.map((skill: string) => (
                              <Badge key={skill} variant="outline" className="rounded-xl text-primary border-primary/20">{skill}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {investor.experience && investor.experience.length > 0 && (
                    <section>
                      <h3 className="text-xl font-bold mb-4">Background</h3>
                      <div className="space-y-4">
                        {investor.experience.map((exp: any, i: number) => (
                          <div key={i} className="pl-4 border-l-2 border-primary/20">
                            <p className="text-sm font-bold">{exp.role}</p>
                            <p className="text-xs text-primary font-medium">{exp.company}</p>
                            <p className="text-[10px] text-muted-foreground">{exp.duration}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
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

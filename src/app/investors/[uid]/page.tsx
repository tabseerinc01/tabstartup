
'use client';

import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { 
  Loader2, 
  ArrowLeft, 
  MapPin, 
  Globe, 
  Briefcase, 
  TrendingUp, 
  Linkedin, 
  CheckCircle2,
  Mail,
  Target,
  Zap
} from 'lucide-react';
import Link from 'next/link';

export default function InvestorPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  const uid = params?.uid as string;

  const [investor, setInvestor] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadInvestor() {
      if (!firestore || !uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          setInvestor({ id: snap.id, ...snap.data() });
        }
      } catch (error) {
        console.error("Error loading investor profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadInvestor();
  }, [firestore, uid]);

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
          <h1 className="text-2xl font-bold mb-4">Investor profile not found</h1>
          <Button variant="outline" onClick={() => router.push('/investors')}>
            Back to Investors
          </Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const initials = (investor.fullName || '')
    .split(' ')
    .map((p: string) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'I';

  const displayName = investor.fullName;
  const headline = investor.investorHeadline || investor.headline;
  const bio = investor.investorBio || investor.bio;
  const linkedin = investor.linkedinUrl || investor.socialLinks?.linkedin;
  const isOwnProfile = currentUser?.uid === uid;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <Button variant="ghost" asChild className="mb-2 -ml-4">
            <Link href="/investors" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </Link>
          </Button>

          <Card className="overflow-hidden border-none shadow-xl rounded-3xl">
            <div className="h-48 bg-gradient-to-r from-accent/20 via-primary/20 to-accent/10" />
            <div className="px-6 md:px-12 pb-12 -mt-20">
              <div className="flex flex-col md:flex-row gap-8 items-end mb-10">
                <Avatar className="h-40 w-40 rounded-3xl border-8 border-background bg-muted shrink-0 shadow-2xl">
                  <AvatarImage src={investor.imageUrl} alt={displayName} className="object-cover" />
                  <AvatarFallback className="text-4xl">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <h1 className="text-4xl font-extrabold tracking-tight">
                      {displayName}
                    </h1>
                    {investor.isVerified && <CheckCircle2 className="h-8 w-8 text-primary fill-primary/10" />}
                  </div>
                  <p className="text-xl text-primary font-semibold">{headline}</p>
                  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground font-medium">
                    {investor.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-5 w-5 text-primary" /> {investor.location}
                      </span>
                    )}
                    <Badge variant={investor.isOpenToPitches ? 'default' : 'secondary'} className="rounded-lg h-7 px-4">
                      {investor.isOpenToPitches ? (
                        <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 fill-white" /> Open to Pitches</span>
                      ) : (
                        'Not accepting pitches'
                      )}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-12">
                  {bio && (
                    <section>
                      <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <TrendingUp className="h-6 w-6 text-primary" /> About & Vision
                      </h3>
                      <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 relative">
                        <span className="absolute -top-4 -left-2 text-6xl text-primary/20 font-serif">“</span>
                        <p className="text-primary text-lg font-medium italic leading-relaxed whitespace-pre-wrap">
                          {bio}
                        </p>
                      </div>
                    </section>
                  )}

                  <section className="bg-muted/30 p-8 rounded-3xl border border-dashed border-primary/20">
                    <h3 className="text-xl font-bold mb-6">Social Presence</h3>
                    <div className="flex flex-wrap gap-4">
                      {linkedin && (
                        <Button variant="outline" className="gap-2 rounded-xl h-12 px-6" asChild>
                          <a href={linkedin} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="h-5 w-5 text-[#0077b5]" /> LinkedIn Profile
                          </a>
                        </Button>
                      )}
                      {investor.socialLinks?.website && (
                        <Button variant="outline" className="gap-2 rounded-xl h-12 px-6" asChild>
                          <a href={investor.socialLinks.website} target="_blank" rel="noopener noreferrer">
                            <Globe className="h-5 w-5" /> Official Website
                          </a>
                        </Button>
                      )}
                      {!linkedin && !investor.socialLinks?.website && (
                        <p className="text-sm text-muted-foreground italic">No social links provided.</p>
                      )}
                    </div>
                  </section>
                  
                  {isOwnProfile && (
                    <Button variant="outline" asChild className="w-full h-12 rounded-2xl">
                      <Link href="/dashboard/profile">Update My Investor Profile</Link>
                    </Button>
                  )}
                </div>

                <div className="space-y-10">
                  <section className="bg-white p-6 rounded-3xl border shadow-sm">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" /> Investment Criteria
                    </h3>
                    <div className="space-y-8">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                          Preferred Stages
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(investor.preferredStage) && investor.preferredStage.length > 0 ? (
                            investor.preferredStage.map((s: string) => (
                              <Badge key={s} variant="secondary" className="rounded-xl px-3 py-1">
                                {s}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground italic">No preferred stages set.</span>
                          )}
                        </div>
                      </div>

                      {investor.ticketSize && (
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                            Average Ticket Size
                          </p>
                          <p className="text-lg font-bold text-primary">{investor.ticketSize}</p>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                          Investment Focus
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.isArray(investor.investmentFocus) && investor.investmentFocus.length > 0 ? (
                            investor.investmentFocus.map((f: string) => (
                              <Badge key={f} variant="outline" className="rounded-xl px-3 py-1 border-primary/20 text-primary bg-primary/5">
                                {f}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground italic">Generalist</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {investor.experience && investor.experience.length > 0 && (
                    <section>
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-primary" /> Professional Background
                      </h3>
                      <div className="space-y-4">
                        {investor.experience.map((exp: any, i: number) => (
                          <div key={i} className="pl-4 border-l-2 border-primary/20 py-1">
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { 
  doc, 
  collection, 
  addDoc, 
  setDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Globe, 
  Tag, 
  Loader2, 
  Rocket, 
  Share2, 
  HandCoins, 
  ExternalLink, 
  Heart, 
  Lightbulb, 
  TrendingUp, 
  Users,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  FileText,
  AlertCircle,
  EyeOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { createNotification } from '@/lib/notifications';

export default function StartupProfileClient({ slugOrId }: { slugOrId: string }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [startup, setStartup] = useState<any>(null);
  const [founder, setFounder] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [existingInterest, setExistingInterest] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingInterest, setIsSubmittingInterest] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !slugOrId) return;
      setIsLoading(true);
      try {
        let startupDoc: any = null;
        let ownerUid: string | null = null;

        // 1. Try finding by SLUG
        const slugQuery = query(
          collection(firestore, 'startups'),
          where('slug', '==', slugOrId),
          limit(1)
        );
        const slugSnap = await getDocs(slugQuery);
        
        if (!slugSnap.empty) {
          startupDoc = { id: slugSnap.docs[0].id, ...slugSnap.docs[0].data() };
          ownerUid = startupDoc.ownerUid;
        } else {
          // 2. Try finding by ID (Backward compatibility)
          const idSnap = await getDoc(doc(firestore, 'startups', slugOrId));
          if (idSnap.exists()) {
            startupDoc = { id: idSnap.id, ...idSnap.data() };
            ownerUid = startupDoc.ownerUid;
            
            // REDIRECT if ID was used but SLUG exists for better SEO
            if (startupDoc.slug && startupDoc.slug !== slugOrId) {
              router.replace(`/startups/${startupDoc.slug}`);
              return;
            }
          }
        }

        if (!startupDoc) {
          setIsLoading(false);
          return;
        }

        // Load Current User Profile
        let currentUserRole = 'user';
        if (user?.uid) {
          const userSnap = await getDoc(doc(firestore, 'users', user.uid));
          if (userSnap.exists()) {
            const data = userSnap.data();
            setCurrentUserProfile(data);
            currentUserRole = data.role || data.primaryRole || 'user';
          }
        }

        // Visibility Check: If hidden, only owner or admin can see
        const isOwner = user?.uid === ownerUid;
        const isAdmin = currentUserRole === 'admin' || currentUserRole === 'super_admin';
        
        if (startupDoc.status === 'hidden' && !isOwner && !isAdmin) {
          setIsHidden(true);
          setIsLoading(false);
          return;
        }

        setStartup(startupDoc);

        // Load Founder Data
        if (ownerUid) {
          const founderSnap = await getDoc(doc(firestore, 'users', ownerUid));
          if (founderSnap.exists()) {
            setFounder(founderSnap.data());
          }

          if (user?.uid) {
            const interestSnap = await getDoc(doc(firestore, 'startups', ownerUid, 'interests', user.uid));
            if (interestSnap.exists()) {
              setExistingInterest(interestSnap.data());
            }
          }

          // Record view anonymously
          if (ownerUid !== user?.uid) {
            addDoc(collection(firestore, 'startups', ownerUid, 'views'), {
              startupId: ownerUid,
              viewerId: user?.uid || 'anonymous',
              timestamp: serverTimestamp(),
            });
          }
        }
      } catch (error) {
        console.error("Error loading startup data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [firestore, slugOrId, user?.uid, router]);

  const handleExpressInterest = async () => {
    if (!user || !firestore || !startup || !currentUserProfile) {
      toast({
        title: "Login Required",
        description: "Please sign in to express interest.",
        variant: "destructive"
      });
      router.push('/login');
      return;
    }

    const rolesArr = (currentUserProfile.roles || (currentUserProfile.role ? [currentUserProfile.role] : ['user'])).filter(Boolean);
    if (!rolesArr.includes('investor')) {
      toast({
        title: "Investors Only",
        description: "Only verified investors can express interest in startups.",
        variant: "destructive"
      });
      return;
    }

    if (existingInterest || isSubmittingInterest) return;

    setIsSubmittingInterest(true);
    try {
      const ownerUid = startup.ownerUid;
      const interestData = {
        startupId: ownerUid,
        investorId: user.uid,
        investorName: currentUserProfile.fullName || user.displayName || "Anonymous Investor",
        investorHeadline: currentUserProfile.headline || "Active Investor",
        timestamp: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'startups', ownerUid, 'interests', user.uid), interestData);
      
      await addDoc(collection(firestore, 'pitches'), {
        fromInvestorUid: user.uid,
        toFounderUid: ownerUid,
        message: `Expressed interest in ${startup.name}.`,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      createNotification(firestore, {
        recipientUid: ownerUid,
        actorUid: user.uid,
        type: 'investor_interest',
        title: 'Investor Interest',
        message: `An investor showed interest in ${startup.name}.`,
        targetId: ownerUid,
        targetType: 'user'
      });

      setExistingInterest(interestData);
      toast({ title: "Success", description: "Interest sent." });
    } catch (error) {
      console.error("Error saving interest:", error);
    } finally {
      setIsSubmittingInterest(false);
    }
  };

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
        <main className="flex-1 items-center justify-center flex">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (isHidden) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 container mx-auto px-4 flex items-center justify-center text-center">
          <div className="max-w-md space-y-6">
            <div className="p-6 bg-amber-50 rounded-full w-24 h-24 mx-auto flex items-center justify-center border border-amber-100">
               <AlertCircle className="h-12 w-12 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold">Listing Unavailable</h1>
            <p className="text-slate-500">This listing is currently hidden for review.</p>
            <Button variant="outline" asChild><Link href="/founders">Explore Others</Link></Button>
          </div>
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
          <Button asChild><Link href="/founders">Browse Directory</Link></Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const rolesArr = (currentUserProfile?.roles || (currentUserProfile?.role ? [currentUserProfile.role] : ['user'])).filter(Boolean);
  const isInvestor = rolesArr.includes('investor');
  const isOwnStartup = user?.uid === startup.ownerUid;
  const founderName = founder?.fullName || "Founder";

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
             <Link href="/founders" className="hover:text-primary transition-colors">Directory</Link>
             <span>/</span>
             <span className="font-medium text-foreground">{startup.name}</span>
          </div>

          <Card className="overflow-hidden border-none shadow-2xl rounded-[3rem] bg-background">
            <div className="relative min-h-[16rem] bg-gradient-to-br from-primary/90 via-accent/90 to-primary/80">
              <div className="relative p-8 md:p-12 text-white">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                  <div className="space-y-4 max-w-2xl">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight drop-shadow-sm">{startup.name}</h1>
                      <Badge className="bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-md px-4 py-1.5 rounded-xl text-sm">
                        {startup.stage} Stage
                      </Badge>
                      {startup.status === 'hidden' && (
                        <Badge variant="destructive" className="rounded-xl px-4 py-1.5 flex items-center gap-1.5">
                          <EyeOff className="h-3 w-3" /> PRIVATE VIEW
                        </Badge>
                      )}
                    </div>
                    <p className="text-xl md:text-2xl font-medium opacity-95 leading-relaxed italic">
                      "{startup.shortDescription}"
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    {isInvestor && !isOwnStartup && (
                      <>
                        {existingInterest ? (
                          <Button disabled className="h-14 px-8 rounded-2xl bg-white/20 text-white border-white/10 backdrop-blur-md opacity-80">
                            <Heart className="h-5 w-5 fill-white" /> Interest Sent
                          </Button>
                        ) : (
                          <Button 
                            onClick={handleExpressInterest} 
                            className="h-14 px-10 rounded-2xl bg-white text-primary hover:bg-white/90 shadow-xl transition-transform hover:scale-105" 
                            disabled={isSubmittingInterest}
                          >
                            {isSubmittingInterest ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                            Express Interest
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          className="h-14 px-8 rounded-2xl text-base gap-2 border-white/30 text-slate-900 hover:bg-white/10 backdrop-blur-md" 
                          asChild
                        >
                          <Link href={`/dashboard/messages?startWith=${startup.ownerUid}`}>
                            <MessageSquare className="h-5 w-5" /> Message
                          </Link>
                        </Button>
                      </>
                    )}
                    
                    <Button variant="outline" size="icon" onClick={copyListingLink} className="rounded-2xl h-14 w-14 bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md transition-all">
                      <Share2 className="h-6 w-6" />
                    </Button>
                    <Button variant="secondary" className="rounded-2xl h-14 px-8 font-bold text-base shadow-lg hover:scale-105 transition-transform" asChild>
                      <Link href={`/founders/${startup.ownerUid}`}>
                        About Founder
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 md:px-12 py-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Founder
                  </p>
                  <Link href={`/founders/${startup.ownerUid}`} className="text-lg font-bold hover:text-primary transition-colors flex items-center gap-1">
                    {founderName} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" /> Headquarters
                  </p>
                  <p className="text-lg font-bold">{startup.location || 'Remote'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Industry
                  </p>
                  <p className="text-lg font-bold text-primary">{startup.industry}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <HandCoins className="h-3 w-3" /> Seeking
                  </p>
                  <p className="text-lg font-extrabold text-green-600">{startup.fundingNeed || 'TBD'}</p>
                </div>
              </div>

              <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-16">
                <div className="lg:col-span-2 space-y-16">
                  {startup.problem && (
                    <section className="space-y-4">
                      <div className="flex items-center gap-3 text-primary">
                        <div className="p-2 bg-primary/10 rounded-xl">
                          <Lightbulb className="h-5 w-5" />
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">The Problem</h3>
                      </div>
                      <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-wrap pl-1.5 border-l-2 border-primary/20">
                        {startup.problem}
                      </p>
                    </section>
                  )}

                  {startup.solution && (
                    <section className="space-y-4">
                      <div className="flex items-center gap-3 text-primary">
                        <div className="p-2 bg-primary/10 rounded-xl">
                          <Rocket className="h-5 w-5" />
                        </div>
                        <h3 className="text-2xl font-bold tracking-tight text-foreground">The Solution</h3>
                      </div>
                      <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-wrap pl-1.5 border-l-2 border-primary/20">
                        {startup.solution}
                      </p>
                    </section>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {startup.targetMarket && (
                      <section className="space-y-3">
                        <h4 className="text-xl font-bold flex items-center gap-2">
                          <Users className="h-5 w-5 text-primary" /> Target Market
                        </h4>
                        <p className="text-muted-foreground leading-relaxed text-base">{startup.targetMarket}</p>
                      </section>
                    )}
                    {startup.businessModel && (
                      <section className="space-y-3">
                        <h4 className="text-xl font-bold flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-primary" /> Business Model
                        </h4>
                        <p className="text-muted-foreground leading-relaxed text-base">{startup.businessModel}</p>
                      </section>
                    )}
                  </div>

                  <div className="space-y-12 pt-8 border-t">
                    {startup.traction && (
                      <section className="space-y-4">
                        <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                          <TrendingUp className="h-6 w-6 text-primary" /> Traction & Milestones
                        </h3>
                        <div className="bg-muted/30 p-8 rounded-[2.5rem] border border-muted-foreground/5 leading-relaxed text-lg">
                          {startup.traction}
                        </div>
                      </section>
                    )}

                    {startup.teamInfo && (
                      <section className="space-y-4">
                        <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                          <ShieldCheck className="h-6 w-6 text-primary" /> The Founding Team
                        </h3>
                        <p className="text-muted-foreground text-lg leading-relaxed italic border-l-4 border-primary pl-6 py-2">
                          {startup.teamInfo}
                        </p>
                      </section>
                    )}
                  </div>
                </div>

                <div className="space-y-10">
                  <section className="bg-white p-8 rounded-[2.5rem] border shadow-xl shadow-primary/5 space-y-8 sticky top-24">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-2">Venture Overview</h3>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Fundraising Status</p>
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-bold">{startup.fundraisingStatus || 'Open'}</p>
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-none px-3">Active</Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Equity Available</p>
                        <p className="text-lg font-bold text-primary">{startup.equityOffered || 'TBD'}</p>
                      </div>
                      <div className="pt-6 border-t space-y-4">
                         {startup.website && (
                            <Button className="w-full h-14 rounded-2xl gap-2 text-base font-bold" asChild>
                              <a href={startup.website.startsWith('http') ? startup.website : `https://${startup.website}`} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-5 w-5" /> Visit Website
                              </a>
                            </Button>
                         )}
                         {startup.pitchDeckUrl && (
                            <Button variant="outline" className="w-full h-14 rounded-2xl gap-2 text-base font-bold border-primary/20 hover:bg-primary/5" asChild>
                              <a href={startup.pitchDeckUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-5 w-5" /> View Pitch Deck <ExternalLink className="h-4 w-4 opacity-50" />
                              </a>
                            </Button>
                         )}
                      </div>
                    </div>
                    {startup.tags && startup.tags.length > 0 && (
                      <div className="pt-6 border-t">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Verticals & Tags</p>
                        <div className="flex flex-wrap gap-2">
                          {startup.tags.map((tag: string) => (
                            <Badge key={tag} variant="secondary" className="text-xs px-3 py-1 rounded-xl bg-muted border-none text-muted-foreground">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
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

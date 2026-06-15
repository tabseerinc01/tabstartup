'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFirestore, useUser, errorEmitter, FirestorePermissionError } from '@/firebase';
import { 
  doc, 
  collection, 
  addDoc, 
  getDoc, 
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  setDoc
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
  const { user, isUserLoading: isAuthLoading } = useUser();
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
  
  const hasAttemptedAutoSubmit = useRef(false);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !slugOrId) return;
      
      try {
        let startupDoc: any = null;

        // 1. Priority Lookup by SLUG
        const slugQuery = query(
          collection(firestore, 'startups'),
          where('slug', '==', slugOrId),
          limit(1)
        );
        const slugSnap = await getDocs(slugQuery);
        
        if (!slugSnap.empty) {
          startupDoc = { id: slugSnap.docs[0].id, ...slugSnap.docs[0].data() };
        } else {
          // 2. Fallback to lookup by ID
          const idSnap = await getDoc(doc(firestore, 'startups', slugOrId));
          if (idSnap.exists()) {
            startupDoc = { id: idSnap.id, ...idSnap.data() };
          }
        }

        if (!startupDoc) {
          setIsLoading(false);
          return;
        }

        const ownerUid = startupDoc.ownerUid;
        setStartup(startupDoc);

        // Load Founder Profile
        const founderSnap = await getDoc(doc(firestore, 'users', ownerUid));
        if (founderSnap.exists()) {
          setFounder(founderSnap.data());
        }

        // Load Current User Profile & Check Interest
        if (user?.uid) {
          const [profileSnap, interestSnap] = await Promise.all([
            getDoc(doc(firestore, 'users', user.uid)),
            getDoc(doc(firestore, 'startups', ownerUid, 'interests', user.uid))
          ]);

          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            setCurrentUserProfile(profileData);
            
            const role = profileData.role || profileData.primaryRole;
            const isAdmin = role === 'admin' || role === 'super_admin';
            if (startupDoc.status === 'hidden' && user.uid !== ownerUid && !isAdmin) {
              setIsHidden(true);
            }
          }

          if (interestSnap.exists()) {
            setExistingInterest(interestSnap.data());
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [firestore, slugOrId, user?.uid]);

  const handleExpressInterest = useCallback(async () => {
    if (!firestore || !startup || isSubmittingInterest) return;

    if (!user) {
      localStorage.setItem('pending_interest_startup_id', startup.id);
      localStorage.setItem('pending_interest_owner_uid', startup.ownerUid);
      toast({ title: "Login Required", description: "Save your session to connect." });
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`/login?returnTo=${returnUrl}`);
      return;
    }

    if (!currentUserProfile) {
      toast({ title: "Authentication", description: "Verifying your investor profile..." });
      return;
    }

    if (user.uid === startup.ownerUid) {
      toast({ title: "Access Denied", description: "You cannot pitch to your own startup.", variant: "destructive" });
      return;
    }

    const rolesArr = (currentUserProfile.roles || (currentUserProfile.role ? [currentUserProfile.role] : ['user'])).filter(Boolean);
    if (!rolesArr.includes('investor')) {
      toast({ title: "Investor Role Required", description: "Update your profile to 'Investor' to pitch ventures.", variant: "destructive" });
      return;
    }

    setIsSubmittingInterest(true);
    const ownerUid = startup.ownerUid;
    const investorName = currentUserProfile.fullName || "Verified Investor";
    
    const interestData = {
      startupId: ownerUid,
      investorId: user.uid,
      investorName: investorName,
      timestamp: serverTimestamp(),
    };

    try {
      // 1. Create interest record in startup's subcollection
      await setDoc(doc(firestore, 'startups', ownerUid, 'interests', user.uid), interestData);
      
      // 2. Create pitch record
      await addDoc(collection(firestore, 'pitches'), {
        fromInvestorUid: user.uid,
        toFounderUid: ownerUid,
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // 3. Create connection request
      await addDoc(collection(firestore, 'connections'), {
        initiatorUid: user.uid,
        recipientUid: ownerUid,
        type: 'investor',
        status: 'pending',
        message: `Interested in pitching for: ${startup.name}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 4. Notify founder
      createNotification(firestore, {
        recipientUid: ownerUid,
        actorUid: user.uid,
        type: 'investor_interest',
        title: 'New Venture Interest',
        message: `${investorName} wants to connect with ${startup.name}.`,
        targetId: ownerUid,
        targetType: 'user'
      });

      setExistingInterest(interestData);
      toast({ title: "Interest Registered", description: "Founder has been notified successfully." });
    } catch (error) {
      toast({ variant: "destructive", title: "Action Failed", description: "Could not submit interest." });
    } finally {
      setIsSubmittingInterest(false);
    }
  }, [user, firestore, startup, currentUserProfile, isSubmittingInterest, router, toast]);

  // Auto-resume logic
  useEffect(() => {
    if (!isLoading && user && startup && currentUserProfile && !hasAttemptedAutoSubmit.current) {
      const pendingId = localStorage.getItem('pending_interest_startup_id');
      if (pendingId === startup.id) {
        hasAttemptedAutoSubmit.current = true;
        localStorage.removeItem('pending_interest_startup_id');
        localStorage.removeItem('pending_interest_owner_uid');
        setTimeout(() => handleExpressInterest(), 1200);
      }
    }
  }, [isLoading, user, startup, currentUserProfile, handleExpressInterest]);

  const copyListingLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link Copied" });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 items-center justify-center flex">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
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
          <Card className="max-w-md border-none shadow-2xl rounded-[3rem] p-12">
            <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-6" />
            <h1 className="text-2xl font-black mb-2">Venture Hidden</h1>
            <p className="text-slate-500 mb-8">This startup profile is currently set to private.</p>
            <Button asChild className="rounded-full px-8"><Link href="/founders">Explore Directory</Link></Button>
          </Card>
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (!startup) {
    return (
      <div className="flex min-h-screen flex-col">
        <PublicHeader />
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
           <div className="p-6 bg-slate-50 rounded-full mb-6">
              <Rocket className="h-12 w-12 text-slate-200" />
           </div>
           <h1 className="text-3xl font-black text-slate-900 mb-2">Venture Not Found</h1>
           <p className="text-slate-500 mb-8 max-w-sm">The startup profile may have been removed or moved.</p>
           <Button asChild className="rounded-full px-8"><Link href="/founders">Explore Founders</Link></Button>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const isOwnStartup = user?.uid === startup.ownerUid;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
             <Link href="/founders" className="hover:text-primary transition-colors font-bold uppercase tracking-widest text-[10px]">Ecosystem</Link>
             <span className="opacity-30">/</span>
             <span className="font-bold text-slate-900 uppercase tracking-widest text-[10px]">{startup.name}</span>
          </div>

          <Card className="overflow-hidden border-none shadow-3xl rounded-[3rem] bg-background">
            <div className="relative min-h-[18rem] bg-gradient-to-br from-primary via-accent to-primary/90">
              <div className="relative p-8 md:p-16 text-white h-full flex flex-col justify-end">
                <div className="flex flex-col md:flex-row justify-between items-end gap-8">
                  <div className="space-y-6 max-w-2xl">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-4xl md:text-6xl font-black tracking-tighter drop-shadow-xl">{startup.name}</h1>
                      <Badge className="bg-white/20 hover:bg-white/30 text-white border-white/20 backdrop-blur-xl px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                        {startup.stage} Stage
                      </Badge>
                      {startup.status === 'hidden' && (
                        <Badge variant="destructive" className="rounded-xl px-4 py-1.5 flex items-center gap-1.5 font-black text-[10px]">
                          <EyeOff className="h-3 w-3" /> PRIVATE
                        </Badge>
                      )}
                    </div>
                    <p className="text-xl md:text-2xl font-medium opacity-90 leading-relaxed italic border-l-4 border-white/30 pl-6">
                      "{startup.shortDescription || 'Building the future of our industry.'}"
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    {!isOwnStartup && (
                      <>
                        {existingInterest ? (
                          <Button disabled className="h-14 px-8 rounded-2xl bg-white/20 text-white border-white/10 backdrop-blur-md opacity-80">
                            <Heart className="h-5 w-5 fill-white mr-2" /> Interest Shared
                          </Button>
                        ) : (
                          <Button 
                            onClick={handleExpressInterest} 
                            className="h-14 px-10 rounded-2xl bg-white text-primary hover:bg-slate-50 shadow-2xl transition-all hover:scale-105 font-black" 
                            disabled={isSubmittingInterest}
                          >
                            {isSubmittingInterest ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Rocket className="h-5 w-5 mr-2" />}
                            Express Interest
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          className="h-14 px-8 rounded-2xl text-base font-bold gap-2 border-white/30 text-white hover:bg-white/10 backdrop-blur-md" 
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
                  </div>
                </div>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
            </div>

            <div className="px-8 md:px-16 py-12">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-12 pb-12 border-b border-slate-100">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Users className="h-3 w-3 text-primary" /> Founder
                  </p>
                  <Link href={`/founders/${startup.ownerUid}`} className="text-xl font-black text-slate-900 hover:text-primary transition-colors flex items-center gap-2">
                    {founder?.fullName || "Leader"} <ArrowRight className="h-4 w-4 opacity-30" />
                  </Link>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-primary" /> Base
                  </p>
                  <p className="text-xl font-black text-slate-900">{startup.location || 'Remote'}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Tag className="h-3 w-3 text-primary" /> Industry
                  </p>
                  <p className="text-xl font-black text-primary uppercase tracking-tight">{startup.industry || 'Technology'}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <HandCoins className="h-3 w-3 text-primary" /> Funding
                  </p>
                  <p className="text-2xl font-black text-green-600">{startup.fundingNeed || 'Goal TBD'}</p>
                </div>
              </div>

              <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-8 space-y-20">
                  {startup.problem && (
                    <section className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="h-1 w-12 bg-primary rounded-full" />
                        <h3 className="text-3xl font-black tracking-tight text-slate-900">The Problem</h3>
                      </div>
                      <p className="text-slate-600 text-xl leading-relaxed whitespace-pre-wrap font-medium">
                        {startup.problem}
                      </p>
                    </section>
                  )}

                  {startup.solution && (
                    <section className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="h-1 w-12 bg-primary rounded-full" />
                        <h3 className="text-3xl font-black tracking-tight text-slate-900">Our Solution</h3>
                      </div>
                      <p className="text-slate-600 text-xl leading-relaxed whitespace-pre-wrap font-medium">
                        {startup.solution}
                      </p>
                    </section>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 border-t border-slate-50">
                    {startup.targetMarket && (
                      <section className="space-y-4">
                        <h4 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <Users className="h-5 w-5" /> Target Market
                        </h4>
                        <p className="text-slate-600 leading-relaxed font-medium text-lg">{startup.targetMarket}</p>
                      </section>
                    )}
                    {startup.businessModel && (
                      <section className="space-y-4">
                        <h4 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" /> Business Model
                        </h4>
                        <p className="text-slate-600 leading-relaxed font-medium text-lg">{startup.businessModel}</p>
                      </section>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <section className="bg-white p-10 rounded-[3rem] shadow-3xl border border-slate-100 space-y-10 sticky top-24">
                    <h3 className="text-xl font-black text-slate-900 border-b pb-6">Venture Dossier</h3>
                    
                    <div className="space-y-8">
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equity Allocation</p>
                        <p className="text-2xl font-black text-primary">{startup.equityOffered || 'TBD'}</p>
                      </div>

                      <div className="pt-6 border-t space-y-4">
                         {startup.website && (
                            <Button className="w-full h-14 rounded-2xl gap-3 text-base font-black shadow-xl" asChild>
                              <a href={startup.website.startsWith('http') ? startup.website : `https://${startup.website}`} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-5 w-5" /> Website
                              </a>
                            </Button>
                         )}
                         {startup.pitchDeckUrl && (
                            <Button variant="outline" className="w-full h-14 rounded-2xl gap-3 text-base font-bold border-slate-200 hover:bg-slate-50 transition-all" asChild>
                              <a href={startup.pitchDeckUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-5 w-5 text-primary" /> Pitch Deck <ExternalLink className="h-3 w-3 opacity-30" />
                              </a>
                            </Button>
                         )}
                      </div>
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

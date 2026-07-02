'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  setDoc,
  deleteDoc
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
  EyeOff,
  Check,
  Star,
  Eye,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { createNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export default function StartupProfileClient({ slugOrId }: { slugOrId: string }) {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionParam = searchParams.get('action');

  const [startup, setStartup] = useState<any>(null);
  const [founder, setFounder] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [existingInterest, setExistingInterest] = useState<any>(null);
  
  // Save State
  const [isSaved, setIsSaved] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  
  // Watch State
  const [isWatched, setIsWatched] = useState(false);
  const [watchedDocId, setWatchedDocId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingInterest, setIsSubmittingInterest] = useState(false);
  const [isSavingStartup, setIsSavingStartup] = useState(false);
  const [isWatchingStartup, setIsWatchingStartup] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  
  const hasAttemptedAutoSubmit = useRef(false);

  useEffect(() => {
    async function loadData() {
      if (!firestore || !slugOrId) return;
      
      try {
        let startupDoc: any = null;

        const slugQuery = query(
          collection(firestore, 'startups'),
          where('slug', '==', slugOrId),
          limit(1)
        );
        const slugSnap = await getDocs(slugQuery);
        
        if (!slugSnap.empty) {
          startupDoc = { id: slugSnap.docs[0].id, ...slugSnap.docs[0].data() };
        } else {
          const idSnap = await getDoc(doc(firestore, 'startups', slugOrId));
          if (idSnap.exists()) {
            startupDoc = { id: idSnap.id, ...idSnap.data() };
            if (startupDoc.slug && startupDoc.slug !== slugOrId) {
              router.replace(`/startups/${startupDoc.slug}`);
            }
          }
        }

        if (!startupDoc) {
          setIsLoading(false);
          return;
        }

        const ownerUid = startupDoc.ownerUid;
        setStartup(startupDoc);

        const founderSnap = await getDoc(doc(firestore, 'users', ownerUid));
        if (founderSnap.exists()) {
          setFounder(founderSnap.data());
        }

        if (user?.uid) {
          const profileSnap = await getDoc(doc(firestore, 'users', user.uid));
          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            setCurrentUserProfile(profileData);
            
            const role = profileData.role || profileData.primaryRole;
            const isAdmin = role === 'admin' || role === 'super_admin';
            if (startupDoc.status === 'hidden' && user.uid !== ownerUid && !isAdmin) {
              setIsHidden(true);
            }
          }

          const interestSnap = await getDoc(doc(firestore, 'startups', ownerUid, 'interests', user.uid));
          if (interestSnap.exists()) {
            setExistingInterest(interestSnap.data());
          }

          const savedQ = query(
            collection(firestore, 'savedStartups'),
            where('investorUid', '==', user.uid),
            where('startupId', '==', ownerUid)
          );
          const savedSnap = await getDocs(savedQ);
          
          let foundSave = false;
          let foundWatch = false;

          savedSnap.docs.forEach(d => {
            const data = d.data();
            if (data.isWatchlist) {
              setIsWatched(true);
              setWatchedDocId(d.id);
              foundWatch = true;
            } else {
              setIsSaved(true);
              setSavedDocId(d.id);
              foundSave = true;
            }
          });

          if (!foundSave) { setIsSaved(false); setSavedDocId(null); }
          if (!foundWatch) { setIsWatched(false); setWatchedDocId(null); }
        }
      } catch (error) {
        console.error("Startup Loading Error:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [firestore, slugOrId, user?.uid, router]);

  const handleExpressInterest = useCallback(async () => {
    if (!firestore || !startup || isSubmittingInterest || existingInterest) return;

    if (!user) {
      toast({ title: "Login Required", description: "Login to express interest." });
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.push(`/login?returnTo=${returnUrl}`);
      return;
    }

    if (user.uid === startup.ownerUid) {
      toast({ title: "Action Denied", description: "You cannot pitch your own startup.", variant: "destructive" });
      return;
    }

    setIsSubmittingInterest(true);

    const ownerUid = startup.ownerUid;
    const investorName = currentUserProfile?.fullName || user.displayName || "A Capital Partner";
    
    const basePayload = {
      startupId: ownerUid,
      investorId: user.uid,
      investorName: investorName,
      timestamp: serverTimestamp(),
    };

    const interestRef = doc(firestore, 'startups', ownerUid, 'interests', user.uid);
    setDoc(interestRef, basePayload)
      .then(() => {
        setExistingInterest(basePayload);
        toast({ title: "Interest Shared", description: "The founder has been notified." });
        
        const connectionData = {
          initiatorUid: user.uid,
          recipientUid: ownerUid,
          type: 'investor',
          status: 'pending',
          message: `I would like to explore an investment opportunity with ${startup.name}.`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        addDoc(collection(firestore!, 'connections'), connectionData).catch(() => {});

        createNotification(firestore!, {
          recipientUid: ownerUid,
          actorUid: user.uid,
          type: 'investor_interest',
          title: 'New Venture Interest',
          message: `${investorName} has expressed interest in ${startup.name}.`,
          targetId: ownerUid,
          targetType: 'user'
        });
      })
      .catch(error => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: interestRef.path,
          operation: 'create',
          requestResourceData: basePayload
        }));
      })
      .finally(() => {
        setIsSubmittingInterest(false);
      });
  }, [user, firestore, startup, currentUserProfile, isSubmittingInterest, existingInterest, router, toast]);

  useEffect(() => {
    if (actionParam === 'pitch' && startup && !existingInterest && !isSubmittingInterest && !isLoading) {
      handleExpressInterest();
    }
  }, [actionParam, startup, existingInterest, isSubmittingInterest, isLoading, handleExpressInterest]);

  const handleSaveToggle = async () => {
    if (!user || !firestore || !startup) { toast({ title: "Login Required" }); router.push('/login'); return; }
    setIsSavingStartup(true);
    try {
      if (isSaved && savedDocId) {
        await deleteDoc(doc(firestore, 'savedStartups', savedDocId));
        setIsSaved(false);
        setSavedDocId(null);
        toast({ title: "Removed from Saved" });
      } else {
        const docRef = await addDoc(collection(firestore, 'savedStartups'), {
          investorUid: user.uid,
          startupId: startup.ownerUid,
          startupName: startup.name,
          isWatchlist: false,
          createdAt: serverTimestamp()
        });
        setIsSaved(true);
        setSavedDocId(docRef.id);
        toast({ title: "Startup Saved" });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingStartup(false);
    }
  };

  const handleWatchToggle = async () => {
    if (!user || !firestore || !startup) { toast({ title: "Login Required" }); router.push('/login'); return; }
    setIsWatchingStartup(true);
    try {
      if (isWatched && watchedDocId) {
        await deleteDoc(doc(firestore, 'savedStartups', watchedDocId));
        setIsWatched(false);
        setWatchedDocId(null);
        toast({ title: "Removed from Watchlist" });
      } else {
        const docRef = await addDoc(collection(firestore, 'savedStartups'), {
          investorUid: user.uid,
          startupId: startup.ownerUid,
          startupName: startup.name,
          isWatchlist: true,
          createdAt: serverTimestamp()
        });
        setIsWatched(true);
        setWatchedDocId(docRef.id);
        toast({ title: "Added to Watchlist" });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsWatchingStartup(false);
    }
  };

  const copyListingLink = () => {
    const identifier = startup?.slug || startup?.id;
    if (!identifier) return;
    const url = `${window.location.origin}/startups/${identifier}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Link Copied" });
      });
    }
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
            <h1 className="text-2xl font-black mb-2">Private Listing</h1>
            <p className="text-slate-500 mb-8">This venture profile is currently hidden by the founder.</p>
            <Button asChild className="rounded-full px-8"><Link href="/startups">Return to Directory</Link></Button>
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
           <p className="text-slate-500 mb-8 max-w-sm">The startup you're looking for might have changed its name or the link is expired.</p>
           <Button asChild className="rounded-full px-8"><Link href="/startups">Browse Startups</Link></Button>
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
          <Card className="overflow-hidden border-none shadow-3xl rounded-[3rem] bg-background">
            <div className="relative min-h-[18rem] bg-gradient-to-br from-primary via-accent to-primary/90">
              <div className="relative p-8 md:p-16 text-white h-full flex flex-col justify-end">
                <div className="flex flex-col md:flex-row justify-between items-end gap-8">
                  <div className="space-y-6 max-w-2xl">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-4xl md:text-6xl font-black tracking-tighter">{startup.name}</h1>
                      <Badge className="bg-white/20 text-white border-white/20 backdrop-blur-xl px-4 py-1.5 rounded-xl text-[10px] font-black uppercase">
                        {startup.stage} Stage
                      </Badge>
                    </div>
                    <p className="text-xl md:text-2xl font-medium opacity-90 leading-relaxed italic border-l-4 border-white/30 pl-6">
                      "{startup.shortDescription || 'Building the future.'}"
                    </p>
                  </div>
                  
                  {/* Investor Action Bar - Unified Action Hub */}
                  <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {!isOwnStartup && (
                      <div className="flex flex-wrap gap-3 p-2 bg-black/10 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-2xl">
                        {/* 🤍 Save Startup */}
                        <Button 
                          variant="ghost" 
                          onClick={handleSaveToggle} 
                          disabled={isSavingStartup}
                          className={cn(
                            "rounded-full h-12 px-6 gap-2 font-black transition-all",
                            isSaved ? "bg-white text-primary hover:bg-white/90" : "text-white hover:bg-white/10"
                          )}
                        >
                          {isSavingStartup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={cn("h-4 w-4", isSaved && "fill-primary")} />}
                          {isSaved ? "Saved ✓" : "Save Startup"}
                        </Button>

                        {/* 👁 Watch Startup */}
                        <Button 
                          variant="ghost" 
                          onClick={handleWatchToggle} 
                          disabled={isWatchingStartup}
                          className={cn(
                            "rounded-full h-12 px-6 gap-2 font-black transition-all",
                            isWatched ? "bg-white text-primary hover:bg-white/90" : "text-white hover:bg-white/10"
                          )}
                        >
                          {isWatchingStartup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className={cn("h-4 w-4", isWatched && "fill-primary")} />}
                          {isWatched ? "Watching ✓" : "Watch Startup"}
                        </Button>

                        {/* 🚀 Express Interest */}
                        <Button 
                          onClick={handleExpressInterest} 
                          disabled={isSubmittingInterest || !!existingInterest}
                          className={cn(
                            "rounded-full h-12 px-8 gap-2 font-black transition-all",
                            existingInterest 
                              ? "bg-green-500 text-white hover:bg-green-500 cursor-default" 
                              : "bg-white text-primary hover:bg-slate-50"
                          )}
                        >
                          {isSubmittingInterest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className={cn("h-4 w-4", existingInterest && "fill-white")} />}
                          {existingInterest ? "Interest Sent ✓" : "Express Interest"}
                        </Button>
                      </div>
                    )}
                    
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={copyListingLink} 
                      className="rounded-full h-12 w-12 bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md transition-all shadow-xl"
                    >
                      <Share2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 md:px-16 py-12">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-12 pb-12 border-b border-slate-100">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Founder</p>
                  <Link href={`/founders/${startup.ownerUid}`} className="text-xl font-black text-slate-900 hover:text-primary transition-colors flex items-center gap-2">
                    {founder?.fullName || "Leader"} <ArrowRight className="h-4 w-4 opacity-30" />
                  </Link>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Base</p>
                  <p className="text-xl font-black text-slate-900">{startup.location || 'Remote'}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Industry</p>
                  <p className="text-xl font-black text-primary uppercase">{startup.industry || 'Technology'}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Funding</p>
                  <p className="text-2xl font-black text-green-600">{startup.fundingNeed || 'Goal TBD'}</p>
                </div>
              </div>

              <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-8 space-y-20">
                  {startup.problem && (
                    <section className="space-y-6">
                      <h3 className="text-3xl font-black tracking-tight text-slate-900">The Problem</h3>
                      <p className="text-slate-600 text-xl leading-relaxed whitespace-pre-wrap font-medium">{startup.problem}</p>
                    </section>
                  )}
                  {startup.solution && (
                    <section className="space-y-6">
                      <h3 className="text-3xl font-black tracking-tight text-slate-900">Our Solution</h3>
                      <p className="text-slate-600 text-xl leading-relaxed whitespace-pre-wrap font-medium">{startup.solution}</p>
                    </section>
                  )}
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
                            <Button variant="outline" className="w-full h-14 rounded-2xl gap-3 text-base font-bold border-slate-200" asChild>
                              <a href={startup.pitchDeckUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="h-5 w-5 text-primary" /> Pitch Deck
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


'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
   Rocket, 
   Target, 
   Loader2, 
   CheckCircle2, 
   ExternalLink, 
   Eye,
   Users,
   MessageSquare,
   Check,
   X,
   Heart,
   Send,
   ArrowRight,
   Zap,
   Briefcase,
   HandCoins,
   ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, query, where, limit, orderBy, updateDoc, getDoc, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button as ShadButton } from '@/components/ui/button';

const SUPER_ADMIN_EMAIL = "shahmubaruk05@gmail.com";

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<any>(null);
  const [startup, setStartup] = useState<any>(null);
  const [viewsCount, setViewsCount] = useState(0);
  const [interests, setInterests] = useState<any[]>([]);
  const [incomingPitches, setIncomingPitches] = useState<any[]>([]);
  const [sentPitches, setSentPitches] = useState<any[]>([]);
  const [chatsCount, setChatsCount] = useState(0);
  const [recommendedStartups, setRecommendedStartups] = useState<any[]>([]);
  const [incomingProfiles, setIncomingProfiles] = useState<Record<string, any>>({});
  
  const [isLoading, setIsLoading] = useState(true);

  async function loadDashboardData() {
    if (!firestore || !user?.uid) return;
    setIsLoading(true);

    try {
      const profileSnap = await getDoc(doc(firestore, 'users', user.uid));
      const profileData = profileSnap.exists() ? profileSnap.data() : null;
      setProfile(profileData);

      // Super Admin Promotion Logic
      if (user.email === SUPER_ADMIN_EMAIL && profileData && profileData.role !== 'super_admin') {
        await updateDoc(doc(firestore, 'users', user.uid), {
          role: 'super_admin',
          primaryRole: 'super_admin',
          roles: arrayUnion('super_admin'),
          updatedAt: serverTimestamp()
        });
        setProfile((prev: any) => ({ ...prev, role: 'super_admin', primaryRole: 'super_admin' }));
        toast({ title: "Permission Elevated", description: "Your account has been promoted to Super Admin." });
      }

      const startupSnap = await getDoc(doc(firestore, 'startups', user.uid));
      const startupData = startupSnap.exists() ? startupSnap.data() : null;
      setStartup(startupData);

      // Fetch Chat count
      const chatsQ = query(collection(firestore, 'chats'), where('participants', 'array-contains', user.uid));
      const chatsSnap = await getDocs(chatsQ);
      setChatsCount(chatsSnap.size);

      const roles = profileData?.roles || [profileData?.role] || [];
      const isFounder = roles.includes('founder') || roles.includes('super_admin');
      const isInvestor = roles.includes('investor') || roles.includes('super_admin');

      if (isFounder) {
        try {
          const viewsSnap = await getDocs(collection(firestore, 'startups', user.uid, 'views'));
          setViewsCount(viewsSnap.size);
        } catch (e) { console.warn(e); }

        const incomingQ = query(collection(firestore, 'pitches'), where('toFounderUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(5));
        const incomingSnap = await getDocs(incomingQ);
        const pitches = incomingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIncomingPitches(pitches);

        const uids = new Set(pitches.map((p: any) => p.fromInvestorUid));
        const profilesMap: Record<string, any> = {};
        for (const uid of Array.from(uids)) {
          const pSnap = await getDoc(doc(firestore, 'users', uid as string));
          if (pSnap.exists()) profilesMap[uid as string] = pSnap.data();
        }
        setIncomingProfiles(profilesMap);
      }

      if (isInvestor) {
        const sentQ = query(collection(firestore, 'pitches'), where('fromInvestorUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(10));
        const sentSnap = await getDocs(sentQ);
        setSentPitches(sentSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const recQ = query(collection(firestore, 'startups'), orderBy('createdAt', 'desc'), limit(3));
        const recSnap = await getDocs(recQ);
        setRecommendedStartups(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, [firestore, user?.uid]);

  if (isUserLoading || isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "User";
  const roles = profile?.roles || [profile?.role] || [];
  const isFounder = roles.includes('founder') || roles.includes('super_admin');
  const isInvestor = roles.includes('investor') || roles.includes('super_admin');
  const isSuperAdmin = roles.includes('super_admin');
  
  const handlePitchStatus = async (pitch: any, status: 'accepted' | 'rejected') => {
    if (!firestore || !user?.uid) return;
    try {
      await updateDoc(doc(firestore, 'pitches', pitch.id), { status });
      if (status === 'accepted') {
        const otherUid = user.uid === pitch.fromInvestorUid ? pitch.toFounderUid : pitch.fromInvestorUid;
        const q = query(collection(firestore, "chats"), where("participants", "array-contains", user.uid));
        const snap = await getDocs(q);
        let existingChatId = null;
        snap.forEach(doc => {
          if (doc.data().participants?.includes(otherUid)) existingChatId = doc.id;
        });

        if (!existingChatId) {
          await addDoc(collection(firestore, 'chats'), {
            participants: [user.uid, otherUid],
            lastMessage: "You are now connected!",
            updatedAt: serverTimestamp(),
          });
        }
      }
      setIncomingPitches(prev => prev.map(p => p.id === pitch.id ? { ...p, status } : p));
      toast({ title: status === 'accepted' ? "Connected!" : "Declined" });
    } catch (error) { toast({ title: "Error", variant: "destructive" }); }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Welcome, {displayName} {profile?.isVerified && <CheckCircle2 className="h-6 w-6 text-primary" />}
          </h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {roles.map(r => (
              <Badge key={r} variant="outline" className="capitalize text-[10px] font-bold py-0 h-5">
                {r.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShadButton variant="outline" size="sm" asChild>
            <Link href={isFounder ? `/founders/${user?.uid}` : `/investors/${user?.uid}`} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Public Profile
            </Link>
          </ShadButton>
          <ShadButton size="sm" asChild>
            <Link href="/dashboard/profile">Edit Roles & Profile</Link>
          </ShadButton>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversations</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chatsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active chat threads.</p>
          </CardContent>
        </Card>
        {isFounder && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Startup Views</CardTitle>
              <Eye className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{viewsCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Engagement on your listing.</p>
            </CardContent>
          </Card>
        )}
        {isInvestor && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Interests Sent</CardTitle>
              <Heart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentPitches.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Founders you've reached out to.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {isFounder && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" /> Recent Investor Interest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {incomingPitches.length > 0 ? (
                    incomingPitches.map((pitch: any) => {
                      const inv = incomingProfiles[pitch.fromInvestorUid];
                      return (
                        <div key={pitch.id} className="p-4 border rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={inv?.imageUrl} />
                              <AvatarFallback>{inv?.fullName?.[0] || 'I'}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-bold">{inv?.fullName || 'Investor'}</p>
                              <Badge variant="secondary" className="text-[8px] h-4">{pitch.status}</Badge>
                            </div>
                          </div>
                          {pitch.status === 'pending' && (
                            <div className="flex gap-2">
                              <ShadButton size="sm" variant="ghost" onClick={() => handlePitchStatus(pitch, 'rejected')}><X className="h-4 w-4" /></ShadButton>
                              <ShadButton size="sm" onClick={() => handlePitchStatus(pitch, 'accepted')}><Check className="h-4 w-4" /></ShadButton>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-10 text-muted-foreground italic text-sm">No new requests.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isInvestor && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Recommended for You
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {recommendedStartups.map(s => (
                    <div key={s.id} className="p-4 border rounded-xl space-y-2">
                      <p className="font-bold text-sm truncate">{s.name}</p>
                      <Badge variant="secondary" className="text-[10px]">{s.industry}</Badge>
                      <ShadButton variant="link" className="p-0 h-auto text-xs" asChild>
                        <Link href={`/startups/${s.ownerUid}`}>View Profile</Link>
                      </ShadButton>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
           <Card className="bg-primary/5 border-primary/10">
            <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <ShadButton variant="outline" className="w-full justify-start gap-2 h-9 text-xs" asChild>
                <Link href="/community"><Globe className="h-3.5 w-3.5" /> Community Feed</Link>
              </ShadButton>
              <ShadButton variant="outline" className="w-full justify-start gap-2 h-9 text-xs" asChild>
                <Link href="/dashboard/profile"><Users className="h-3.5 w-3.5" /> Manage Roles</Link>
              </ShadButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

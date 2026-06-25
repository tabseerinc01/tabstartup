'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, getDoc, setDoc, query, collection, where, serverTimestamp, getDocs, writeBatch, increment } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CreditCard, 
  Check, 
  Zap, 
  ShieldCheck, 
  TrendingUp, 
  Loader2, 
  ArrowRight,
  Sparkles,
  Crown,
  Activity,
  Users,
  Handshake,
  LayoutGrid,
  CheckSquare,
  FileText,
  Rocket,
  Copy,
  Gift,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$0',
    description: 'Perfect for exploring the ecosystem.',
    limits: {
      connections: 5,
      pitches: 2,
      startups: 1,
      contacts: 25,
      deals: 5,
      tasks: 5,
      invoices: 2
    },
    features: [
      '5 Connection Requests / month',
      '2 Venture Pitches / month',
      '1 Startup Profile',
      '25 CRM Contacts',
      '5 Active Deals',
      '5 Tasks',
      '2 Invoices / month',
      'Unlimited Messaging'
    ],
    icon: Zap,
    color: 'text-slate-600',
    bg: 'bg-slate-50'
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    description: 'For active founders seeking growth.',
    limits: {
      connections: 100,
      pitches: 50,
      startups: 3,
      contacts: Infinity,
      deals: Infinity,
      tasks: Infinity,
      invoices: Infinity
    },
    features: [
      '100 Connection Requests / month',
      '50 Venture Pitches / month',
      '3 Startup Profiles',
      'Unlimited CRM Contacts',
      'Unlimited Deals',
      'Unlimited Tasks',
      'Unlimited Invoices',
      'Exclusive Pro Badge'
    ],
    icon: ShieldCheck,
    color: 'text-primary',
    bg: 'bg-primary/5',
    popular: true
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$99',
    description: 'Scaling power for serious ventures.',
    limits: {
      connections: 500,
      pitches: 200,
      startups: Infinity,
      contacts: Infinity,
      deals: Infinity,
      tasks: Infinity,
      invoices: Infinity
    },
    features: [
      '500 Connection Requests / month',
      '200 Venture Pitches / month',
      'Unlimited Startup Profiles',
      'Unlimited CRM & Deals',
      'Unlimited Tasks & Invoices',
      'Growth Partner Badge',
      'Priority Support',
      'Concierge Matching'
    ],
    icon: Crown,
    color: 'text-amber-600',
    bg: 'bg-amber-50'
  }
];

export default function BillingPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Usage Queries
  const connectionsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'connections'), where('initiatorUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: connections, isLoading: isConnsLoading } = useCollection(connectionsQ);

  const pitchesQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'venturePitches'), where('senderUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: pitches, isLoading: isPitchesLoading } = useCollection(pitchesQ);

  const startupsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'startups'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: startups, isLoading: isStartupsLoading } = useCollection(startupsQ);

  const contactsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'contacts'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: contacts, isLoading: isContactsLoading } = useCollection(contactsQ);

  const dealsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'deals'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: deals, isLoading: isDealsLoading } = useCollection(dealsQ);

  const tasksQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'tasks'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: tasks, isLoading: isTasksLoading } = useCollection(tasksQ);

  const invoicesQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'invoices'), where('ownerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: invoices, isLoading: isInvoicesLoading } = useCollection(invoicesQ);

  const referralsQ = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return query(collection(firestore, 'referrals'), where('referrerUid', '==', user.uid));
  }, [firestore, user?.uid]);
  const { data: referralsData } = useCollection(referralsQ);

  const generateReferralCode = () => {
    return 'TAB-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  };

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          let needsUpdate = false;
          const updates: any = {};

          if (!data.plan) { updates.plan = 'basic'; updates.subscriptionStatus = 'inactive'; needsUpdate = true; }
          if (!data.referralCode) { updates.referralCode = generateReferralCode(); needsUpdate = true; }
          if (!data.bonusLimits) {
            updates.bonusLimits = { connections: 0, pitches: 0, contacts: 0, deals: 0, tasks: 0, invoices: 0 };
            needsUpdate = true;
          }

          if (needsUpdate) {
            await setDoc(doc(firestore, 'users', user.uid), updates, { merge: true });
            setProfile({ ...data, ...updates });
          } else {
            setProfile(data);
          }
        }
      } catch (error) {
        console.error("Error loading billing profile:", error);
      } finally {
        setIsProfileLoading(false);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  // Robust Claiming Logic
  useEffect(() => {
    async function claimRewards() {
      if (!firestore || !user?.uid || isClaiming || !profile) return;
      
      const pendingRewardsQ = query(
        collection(firestore, 'referrals'),
        where('referrerUid', '==', user.uid),
        where('referredProfileCompleted', '==', true),
        where('rewardGranted', '==', false)
      );

      const snap = await getDocs(pendingRewardsQ);
      if (!snap.empty) {
        setIsClaiming(true);
        const batch = writeBatch(firestore);
        
        let bc = 0, bp = 0, bcon = 0, bd = 0, bt = 0, bi = 0;

        snap.docs.forEach(d => {
          batch.update(d.ref, { rewardGranted: true, rewardGrantedAt: serverTimestamp() });
          bc += 5; bp += 2; bcon += 10; bd += 2; bt += 2; bi += 1;
        });

        batch.update(doc(firestore, 'users', user.uid), {
          'bonusLimits.connections': increment(bc),
          'bonusLimits.pitches': increment(bp),
          'bonusLimits.contacts': increment(bcon),
          'bonusLimits.deals': increment(bd),
          'bonusLimits.tasks': increment(bt),
          'bonusLimits.invoices': increment(bi),
          updatedAt: serverTimestamp()
        });

        await batch.commit();
        toast({ title: "Rewards Earned!", description: `Bonuses from ${snap.size} referrals applied.` });
        
        const updatedSnap = await getDoc(doc(firestore, 'users', user.uid));
        if (updatedSnap.exists()) setProfile(updatedSnap.data());
        setIsClaiming(false);
      }
    }
    if (!isProfileLoading) claimRewards();
  }, [firestore, user?.uid, isClaiming, profile, isProfileLoading, toast]);

  const currentPlanId = profile?.plan || 'basic';
  const currentPlan = PLANS.find(p => p.id === currentPlanId) || PLANS[0];
  const bonusLimits = profile?.bonusLimits || { connections: 0, pitches: 0, contacts: 0, deals: 0, tasks: 0, invoices: 0 };

  const referralLink = typeof window !== 'undefined' 
    ? `${window.location.origin}/signup?ref=${profile?.referralCode || ''}` 
    : '';

  const usageData = useMemo(() => {
    const activeDealsCount = (deals || []).filter(d => !['Won', 'Lost'].includes(d.stage)).length;
    return [
      { label: 'Connection Requests', used: connections?.length || 0, baseLimit: currentPlan.limits.connections, bonus: bonusLimits.connections, icon: Handshake, color: 'text-blue-500', loading: isConnsLoading },
      { label: 'Venture Pitches', used: pitches?.length || 0, baseLimit: currentPlan.limits.pitches, bonus: bonusLimits.pitches, icon: Zap, color: 'text-amber-500', loading: isPitchesLoading },
      { label: 'Startup Profiles', used: startups?.length || 0, baseLimit: currentPlan.limits.startups, bonus: 0, icon: Rocket, color: 'text-purple-500', loading: isStartupsLoading },
      { label: 'CRM Contacts', used: contacts?.length || 0, baseLimit: currentPlan.limits.contacts, bonus: bonusLimits.contacts, icon: Users, color: 'text-emerald-500', loading: isContactsLoading },
      { label: 'Active Deals', used: activeDealsCount, baseLimit: currentPlan.limits.deals, bonus: bonusLimits.deals, icon: LayoutGrid, color: 'text-indigo-500', loading: isDealsLoading },
      { label: 'Tasks', used: tasks?.length || 0, baseLimit: currentPlan.limits.tasks, bonus: bonusLimits.tasks, icon: CheckSquare, color: 'text-rose-500', loading: isTasksLoading },
      { label: 'Invoices', used: invoices?.length || 0, baseLimit: currentPlan.limits.invoices, bonus: bonusLimits.invoices, icon: FileText, color: 'text-sky-500', loading: isInvoicesLoading },
    ];
  }, [connections, pitches, startups, contacts, deals, tasks, invoices, currentPlan, bonusLimits, isConnsLoading, isPitchesLoading, isStartupsLoading, isContactsLoading, isDealsLoading, isTasksLoading, isInvoicesLoading]);

  if (isProfileLoading) return <div className="flex h-full min-h-[60vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" /></div>;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="space-y-1">
        <h1 className="text-4xl font-black tracking-tight text-slate-900">Billing & Plans</h1>
        <p className="text-slate-500 font-medium">Manage your subscription and track real-time ecosystem usage.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative">
          <CardContent className="p-8 md:p-12">
            <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
              <div className="space-y-4 text-center md:text-left">
                 <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3 py-1">Current Tier</Badge>
                 <h2 className="text-4xl font-black">{currentPlan.name} Plan</h2>
                 <p className="text-slate-400 font-medium">Status: <span className="text-green-400 uppercase text-xs font-bold">{profile?.subscriptionStatus === 'active' ? 'Active' : 'Free Access'}</span></p>
              </div>
              <Button className="rounded-xl h-11 px-8 font-bold gap-2 shadow-lg shadow-primary/20" variant="secondary" disabled><CreditCard className="h-4 w-4" /> Payment Locked</Button>
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-[2.5rem] bg-white ring-1 ring-slate-100 p-8 flex flex-col justify-center">
           <Activity className="h-5 w-5 text-primary mb-4" />
           <p className="text-sm text-slate-500 font-medium leading-relaxed">Usage is synced in real-time. Reach profile completion milestones to earn resource bonuses.</p>
        </Card>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
        <div className="bg-primary/5 px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl text-primary"><Gift className="h-6 w-6" /></div>
             <div>
                <h3 className="text-lg font-black text-slate-900">Referral Program</h3>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-tight">Earn bonus resources via networking</p>
             </div>
          </div>
          <Badge variant="outline" className="bg-white border-primary/20 text-primary font-black text-[10px] uppercase h-7 px-3">Referrals: {referralsData?.length || 0}</Badge>
        </div>
        <CardContent className="p-8 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Invite Code</Label>
                    <code className="block p-3 rounded-xl bg-slate-50 border border-slate-100 font-mono text-lg font-bold text-slate-700 text-center tracking-widest">{profile?.referralCode}</code>
                 </div>
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Personal Link</Label>
                    <div className="flex gap-2">
                       <Input readOnly value={referralLink} className="rounded-xl h-11 bg-slate-50 text-xs" />
                       <Button onClick={() => { navigator.clipboard.writeText(referralLink); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} size="icon" className="shrink-0 h-11 w-11 rounded-xl">
                          {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                       </Button>
                    </div>
                 </div>
              </div>
              <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                 <h4 className="font-bold text-slate-900 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Rules</h4>
                 <ul className="space-y-2 text-xs font-medium text-slate-600">
                    <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-primary" /> Friend signs up</li>
                    <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-primary" /> Friend completes profile (Bio, Role, Location)</li>
                    <li className="flex items-center gap-2 text-primary font-bold"><Plus className="h-3 w-3" /> Bonuses are applied automatically</li>
                 </ul>
              </div>
           </div>
           <div className="pt-8 border-t border-slate-100">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Referral Bonuses Earned</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                 {[
                   { label: 'Connections', val: bonusLimits.connections, icon: Handshake },
                   { label: 'Pitches', val: bonusLimits.pitches, icon: Zap },
                   { label: 'Contacts', val: bonusLimits.contacts, icon: Users },
                   { label: 'Deals', val: bonusLimits.deals, icon: LayoutGrid },
                   { label: 'Tasks', val: bonusLimits.tasks, icon: CheckSquare },
                   { label: 'Invoices', val: bonusLimits.invoices, icon: FileText },
                 ].map((b, i) => (
                   <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                      <b.icon className="h-4 w-4 mx-auto mb-2 text-primary opacity-40" />
                      <p className="text-xl font-black text-slate-900">+{b.val}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase">{b.label}</p>
                   </div>
                 ))}
              </div>
           </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 px-2"><TrendingUp className="h-6 w-6 text-primary" /> Effective Capacity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {usageData.map((item, i) => {
            const effectiveLimit = item.baseLimit === Infinity ? Infinity : item.baseLimit + (item.bonus || 0);
            const limitVal = effectiveLimit === Infinity ? 1000 : effectiveLimit;
            const percentage = Math.min((item.used / limitVal) * 100, 100);
            return (
              <Card key={i} className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 overflow-hidden group hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl bg-slate-50", item.color.replace('text', 'bg').replace('500', '50'))}><item.icon className={cn("h-4 w-4", item.color)} /></div>
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{item.label}</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-black text-slate-900">{item.used} / {effectiveLimit === Infinity ? '∞' : effectiveLimit}</span>
                    </div>
                  </div>
                  <Progress value={item.loading ? 0 : percentage} className="h-1.5 bg-slate-100" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
        {PLANS.map((plan) => (
          <Card key={plan.id} className={cn("border-none shadow-lg rounded-[2.5rem] overflow-hidden flex flex-col bg-background ring-1 ring-slate-100", plan.popular && "ring-2 ring-primary/50 relative")}>
            <CardHeader className="p-8 pb-4">
              <div className={cn("p-3 rounded-2xl w-fit mb-6", plan.bg)}><plan.icon className={cn("h-6 w-6", plan.color)} /></div>
              <CardTitle className="text-2xl font-black text-slate-900">{plan.name}</CardTitle>
              <div className="pt-6"><span className="text-4xl font-black text-slate-900">{plan.price}</span><span className="text-slate-400 font-bold text-sm ml-2">/ month</span></div>
            </CardHeader>
            <CardContent className="p-8 pt-6 flex-1 space-y-4">
              <ul className="space-y-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-medium text-slate-600"><Check className="h-4 w-4 text-green-600 shrink-0" /> {f}</li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="p-8 pt-0">
              <Button className="w-full rounded-2xl h-12 font-black" disabled={plan.id === currentPlanId}>{plan.id === currentPlanId ? "Current Plan" : `Upgrade to ${plan.name}`}</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

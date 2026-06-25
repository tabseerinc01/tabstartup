'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, 
  Check, 
  Zap, 
  ShieldCheck, 
  TrendingUp, 
  Loader2, 
  ArrowRight,
  Sparkles,
  Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$0',
    description: 'Perfect for exploring the ecosystem.',
    features: [
      'Public Startup Profile',
      'Community Feed Access',
      'Standard Networking',
      'Basic CRM Access'
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
    features: [
      'Everything in Basic',
      'Priority Directory Placement',
      'Advanced Venture Pitches',
      'Unlimited CRM Contacts',
      'Custom Startup Slug'
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
    features: [
      'Everything in Pro',
      'Concierge Mentorship Match',
      'Featured Community Spotlight',
      'Bulk Invoicing Tools',
      'Platform Analytics API'
    ],
    icon: Crown,
    color: 'text-amber-600',
    bg: 'bg-amber-50'
  }
];

export default function BillingPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          // Ensure default plan for existing users
          if (!data.plan) {
            const defaultData = { plan: 'basic', subscriptionStatus: 'inactive' };
            await setDoc(doc(firestore, 'users', user.uid), defaultData, { merge: true });
            setProfile({ ...data, ...defaultData });
          } else {
            setProfile(data);
          }
        }
      } catch (error) {
        console.error("Error loading billing profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  const currentPlanId = profile?.plan || 'basic';
  const currentPlan = PLANS.find(p => p.id === currentPlanId) || PLANS[0];

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-1">
           <div className="h-1 w-8 bg-primary rounded-full" />
           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Subscription Engine</span>
        </div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900">Billing & Plans</h1>
        <p className="text-slate-500 font-medium">Manage your subscription and unlock elite ecosystem features.</p>
      </div>

      <Card className="border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
        <CardContent className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 relative z-10">
            <div className="space-y-4 text-center md:text-left">
               <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3 py-1">
                 Current Tier
               </Badge>
               <div className="space-y-1">
                 <h2 className="text-4xl font-black">{currentPlan.name} Plan</h2>
                 <p className="text-slate-400 font-medium">Status: <span className="text-green-400 uppercase text-xs font-bold">{profile?.subscriptionStatus === 'active' ? 'Active' : 'Free Access'}</span></p>
               </div>
            </div>
            <div className="flex flex-col items-center md:items-end gap-3">
               <div className="text-right">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Next Billing Date</p>
                  <p className="text-xl font-bold">N/A</p>
               </div>
               <Button className="rounded-xl h-11 px-8 font-bold gap-2 shadow-lg shadow-primary/20" variant="secondary" disabled>
                 <CreditCard className="h-4 w-4" /> Manage Payments
               </Button>
               <p className="text-[9px] text-slate-500 font-medium italic">Payments integration coming soon</p>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-accent/10 rounded-full blur-3xl -ml-24 -mb-24 pointer-events-none" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const Icon = plan.icon;

          return (
            <Card 
              key={plan.id} 
              className={cn(
                "border-none shadow-lg hover:shadow-2xl transition-all duration-500 rounded-[2.5rem] overflow-hidden flex flex-col bg-background ring-1 ring-slate-100",
                plan.popular && "ring-2 ring-primary/50 relative"
              )}
            >
              {plan.popular && (
                <div className="absolute top-6 right-6">
                  <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-tighter shadow-lg">
                    Recommended
                  </Badge>
                </div>
              )}
              
              <CardHeader className="p-8 pb-4">
                <div className={cn("p-3 rounded-2xl w-fit mb-6", plan.bg)}>
                  <Icon className={cn("h-6 w-6", plan.color)} />
                </div>
                <CardTitle className="text-2xl font-black text-slate-900">{plan.name}</CardTitle>
                <CardDescription className="font-medium text-slate-500">{plan.description}</CardDescription>
                <div className="pt-6">
                   <span className="text-4xl font-black text-slate-900">{plan.price}</span>
                   <span className="text-slate-400 font-bold text-sm ml-2">/ month</span>
                </div>
              </CardHeader>
              
              <CardContent className="p-8 pt-6 flex-1 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Includes</p>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm font-medium text-slate-600">
                      <div className="p-0.5 bg-green-50 text-green-600 rounded-full">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="p-8 pt-0">
                <Button 
                  className={cn(
                    "w-full rounded-2xl h-12 font-black gap-2 transition-all",
                    isCurrent ? "bg-slate-100 text-slate-400 hover:bg-slate-100 shadow-none cursor-default" : "shadow-xl shadow-primary/10"
                  )}
                  disabled={isCurrent}
                >
                  {isCurrent ? "Active Plan" : (
                    <>
                      Upgrade <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="border-none shadow-sm rounded-[2rem] bg-primary/5 p-8 border border-primary/10">
         <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="p-4 bg-white rounded-[2rem] shadow-xl text-primary">
               <Sparkles className="h-8 w-8" />
            </div>
            <div className="flex-1 space-y-1">
               <h3 className="text-xl font-black text-slate-900">Enterprise Scale?</h3>
               <p className="text-sm font-medium text-slate-500">Need custom limits or white-label solutions for your accelerator or VC firm?</p>
            </div>
            <Button variant="outline" className="rounded-xl font-bold border-primary/20 text-primary">
               Contact Partnership
            </Button>
         </div>
      </Card>
    </div>
  );
}

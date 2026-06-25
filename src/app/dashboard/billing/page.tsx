'use client';

import { useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Rocket
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '$0',
    description: 'Perfect for exploring the ecosystem.',
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
        <p className="text-slate-500 font-medium">Manage your subscription and track ecosystem usage.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl rounded-[2.5rem] bg-slate-900 text-white overflow-hidden relative group">
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
              </div>
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-[2.5rem] bg-white ring-1 ring-slate-100 p-8 flex flex-col justify-center">
           <div className="space-y-4">
              <div className="flex items-center gap-2">
                 <Activity className="h-5 w-5 text-primary" />
                 <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Usage Insight</h3>
              </div>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Your monthly usage resets on the 1st of every month. Upgrade to Pro for unlimited workspace tools.
              </p>
              <div className="pt-2">
                 <Button variant="link" className="p-0 h-auto text-primary font-bold text-xs" asChild>
                    <a href="#plans">Compare all plans <ArrowRight className="ml-1 h-3 w-3" /></a>
                 </Button>
              </div>
           </div>
        </Card>
      </div>

      {/* Usage Summary Section */}
      <div className="space-y-4">
        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2 px-2">
           <TrendingUp className="h-6 w-6 text-primary" /> Monthly Usage Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { label: 'Connection Requests', used: 2, limit: 5, icon: Handshake, color: 'text-blue-500' },
            { label: 'Venture Pitches', used: 0, limit: 2, icon: Zap, color: 'text-amber-500' },
            { label: 'Startup Profiles', used: 1, limit: 1, icon: Rocket, color: 'text-purple-500' },
            { label: 'CRM Contacts', used: 12, limit: 25, icon: Users, color: 'text-emerald-500' },
            { label: 'Active Deals', used: 3, limit: 5, icon: LayoutGrid, color: 'text-indigo-500' },
            { label: 'Tasks', used: 4, limit: 5, icon: CheckSquare, color: 'text-rose-500' },
            { label: 'Invoices', used: 1, limit: 2, icon: FileText, color: 'text-sky-500' },
          ].map((item, i) => {
            const percentage = (item.used / item.limit) * 100;
            return (
              <Card key={i} className="border-none shadow-sm rounded-[2rem] bg-white ring-1 ring-slate-100 overflow-hidden group hover:shadow-md transition-shadow">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl bg-slate-50", item.color.replace('text', 'bg').replace('500', '50'))}>
                        <item.icon className={cn("h-4 w-4", item.color)} />
                      </div>
                      <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{item.label}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{item.used} / {item.limit}</span>
                  </div>
                  <div className="space-y-2">
                    <Progress value={percentage} className="h-1.5 bg-slate-100" />
                    <div className="flex justify-between items-center">
                       <p className="text-[9px] font-bold text-slate-400 uppercase">{Math.round(percentage)}% Capacity</p>
                       {percentage >= 80 && <Badge className="h-4 px-1.5 text-[8px] bg-red-50 text-red-600 border-none">Limit Near</Badge>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div id="plans" className="pt-12 space-y-8">
        <div className="text-center space-y-2">
           <h2 className="text-3xl font-black text-slate-900 tracking-tight">Select Your Scaling Pathway</h2>
           <p className="text-slate-500 font-medium">Transparent pricing for founders and builders.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Plan Inclusions</p>
                  <ul className="space-y-3">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm font-medium text-slate-600">
                        <div className="mt-0.5 p-0.5 bg-green-50 text-green-600 rounded-full shrink-0">
                          <Check className="h-3 w-3" />
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
                    {isCurrent ? "Current Plan" : (
                      <>
                        Upgrade to {plan.name} <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-[2rem] bg-primary/5 p-8 border border-primary/10">
         <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="p-4 bg-white rounded-[2rem] shadow-xl text-primary">
               <Sparkles className="h-8 w-8" />
            </div>
            <div className="flex-1 space-y-1">
               <h3 className="text-xl font-black text-slate-900">Custom Infrastructure?</h3>
               <p className="text-sm font-medium text-slate-500">Need white-label solutions for your accelerator or VC firm with dedicated limits?</p>
            </div>
            <Button variant="outline" className="rounded-xl font-bold border-primary/20 text-primary h-11 px-6">
               Contact Partnership
            </Button>
         </div>
      </Card>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { CommunitySpotlight } from '@/components/home/community-spotlight';
import { 
  Rocket, 
  Users, 
  Lightbulb, 
  Target, 
  Handshake, 
  Globe, 
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  BarChart3,
  Search
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 flex flex-col">
        
        {/* --- HERO SECTION --- */}
        <section className="relative overflow-hidden pt-20 pb-32 md:pt-40 md:pb-48">
          <div className="container mx-auto px-4 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
              <Zap className="h-3 w-3 fill-primary" />
              <span>THE LARGEST STARTUP ECOSYSTEM IN BANGLADESH</span>
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9] text-slate-900">
              Build and fund your <br/>
              <span className="text-primary italic">next big idea.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-500 max-w-3xl mx-auto mb-12 font-medium leading-relaxed">
              TabStartup is the central hub where visionary founders meet strategic capital and experienced mentors to build world-class companies.
            </p>
            
            <div className="flex flex-wrap justify-center gap-6">
              <Button size="lg" asChild className="px-10 h-16 rounded-full text-lg font-bold shadow-2xl shadow-primary/20 hover:scale-105 transition-transform">
                <Link href="/signup?role=founder">Start Building</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="px-10 h-16 rounded-full text-lg font-bold border-2 hover:bg-slate-50 transition-all">
                <Link href="/signup?role=investor">Deploy Capital</Link>
              </Button>
            </div>
          </div>

          {/* Background Decorative Elements */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[100px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#00AEEF 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </div>
        </section>

        {/* --- STATS SECTION --- */}
        <section className="container mx-auto px-4 -mt-20 relative z-20 mb-32">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-8 bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 border border-slate-100">
             {[
               { label: 'Active Startups', value: '250+', icon: Rocket },
               { label: 'Capital Deployed', value: '$12M+', icon: BarChart3 },
               { label: 'Verified Mentors', value: '100+', icon: Handshake },
               { label: 'Global Network', value: '15+', icon: Globe },
             ].map((stat, i) => (
               <div key={i} className="text-center p-6 space-y-2 border-r last:border-0 border-slate-50 hidden sm:block">
                  <p className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
               </div>
             ))}
             {/* Mobile Stats View */}
             {[
               { label: 'Startups', value: '250+', icon: Rocket },
               { label: 'Mentors', value: '100+', icon: Handshake },
             ].map((stat, i) => (
               <div key={i} className="text-center p-4 space-y-1 sm:hidden">
                  <p className="text-2xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
               </div>
             ))}
          </div>
        </section>

        {/* --- HOW IT WORKS --- */}
        <section className="container mx-auto px-4 py-20 mb-20">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter">Everything you need <br/>to <span className="text-primary">scale.</span></h2>
            <p className="text-xl text-slate-500 font-medium">A structured pathway from initial idea to global scaling, built specifically for emerging market founders.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Users className="h-8 w-8" />, title: "Identity", desc: "Build a professional verified profile that showcases your unique founder journey." },
              { icon: <Lightbulb className="h-8 w-8" />, title: "Visibility", desc: "List your venture in our directory to get noticed by the right capital partners." },
              { icon: <Handshake className="h-8 w-8" />, title: "Mentorship", desc: "Get direct 1-on-1 access to experienced operators who have built global businesses." },
              { icon: <Target className="h-8 w-8" />, title: "Resources", desc: "Access high-quality fundraising tools, legal templates, and startup perks." },
            ].map((item, i) => (
              <Card key={i} className="group hover:shadow-2xl transition-all duration-500 border-none bg-slate-50/50 hover:bg-white rounded-[2.5rem] overflow-hidden p-4">
                <CardHeader className="pb-4">
                  <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary mb-6 group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                    {item.icon}
                  </div>
                  <CardTitle className="text-2xl font-bold text-slate-900">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* --- AUDIENCE SECTIONS --- */}
        <section className="bg-slate-950 py-32 overflow-hidden relative">
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center max-w-2xl mx-auto mb-20 space-y-4">
               <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">Who is TabStartup for?</h2>
               <p className="text-slate-400 font-medium">Connecting every critical node in the startup ecosystem.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { 
                  icon: <Rocket className="h-10 w-10" />, 
                  title: "Founders", 
                  desc: "Scale your vision with access to a powerful network of mentors, co-founders, and funding sources.",
                  link: "/signup?role=founder",
                  cta: "Launch My Startup"
                },
                { 
                  icon: <Globe className="h-10 w-10" />, 
                  title: "Mentors", 
                  desc: "Share your industry expertise and give back to the ecosystem while building your own legacy.",
                  link: "/signup?role=mentor",
                  cta: "Become a Mentor"
                },
                { 
                  icon: <TrendingUp className="h-10 w-10" />, 
                  title: "Investors", 
                  desc: "Gain proprietary deal flow and discover high-potential, verified startups ready for investment.",
                  link: "/signup?role=investor",
                  cta: "Discover Startups"
                },
              ].map((role, i) => (
                <Card key={i} className="bg-white/5 border-white/10 text-white rounded-[3rem] p-8 hover:bg-white/10 transition-colors border-none backdrop-blur-xl">
                  <CardHeader className="text-center items-center">
                    <div className="p-4 bg-primary/20 rounded-2xl text-primary mb-6">
                      {role.icon}
                    </div>
                    <CardTitle className="text-3xl font-bold mb-4">{role.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center space-y-8">
                    <p className="text-slate-400 text-lg leading-relaxed">
                      {role.desc}
                    </p>
                    <Button variant="outline" asChild className="w-full h-14 rounded-2xl border-white/20 text-white hover:bg-white hover:text-slate-900 font-bold">
                       <Link href={role.link}>{role.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          {/* Decorative Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
             <div className="w-[800px] h-[800px] bg-primary/10 rounded-full blur-[150px] mx-auto" />
          </div>
        </section>

        {/* --- SPOTLIGHT --- */}
        <section className="container mx-auto px-4 py-32">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-16">
            <div className="space-y-4">
              <div className="h-1 w-12 bg-primary rounded-full" />
              <h2 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter">Community Spotlight</h2>
              <p className="text-xl text-slate-500 font-medium">Meet the builders shaping the future of the emerging ecosystem.</p>
            </div>
            <Button variant="outline" asChild className="rounded-full h-12 px-8 font-bold border-2 hover:bg-slate-50 transition-all hidden md:flex">
              <Link href="/founders" className="gap-2">Explore All Founders <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
          
          <CommunitySpotlight />

          <div className="mt-12 md:hidden">
            <Button variant="outline" className="w-full h-14 rounded-full font-bold border-2" asChild>
              <Link href="/founders">Explore All Founders</Link>
            </Button>
          </div>
        </section>

        {/* --- FINAL CTA --- */}
        <section className="container mx-auto px-4 mb-32">
          <div className="bg-primary text-primary-foreground rounded-[4rem] p-12 md:p-32 text-center shadow-3xl shadow-primary/20 relative overflow-hidden group">
            <div className="relative z-10 space-y-10">
              <h2 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.9]">
                Ready to build the <br className="hidden md:block" /> future?
              </h2>
              <p className="text-xl md:text-2xl opacity-90 max-w-2xl mx-auto font-medium leading-relaxed">
                Join the most ambitious community of builders and capital partners in the region. Your journey starts here.
              </p>
              <div className="pt-6">
                <Button size="lg" variant="secondary" asChild className="px-12 h-20 rounded-full text-2xl font-black shadow-2xl hover:scale-105 transition-transform bg-white text-primary">
                  <Link href="/signup">Join TabStartup Now</Link>
                </Button>
              </div>
            </div>
            {/* Animated BG elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:scale-110 transition-transform duration-1000" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl -ml-20 -mb-20" />
          </div>
        </section>

      </main>
      <PublicFooter />
    </div>
  );
}

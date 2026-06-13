'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  MapPin, 
  Tag, 
  Loader2, 
  Rocket, 
  Share2, 
  Lightbulb, 
  TrendingUp, 
  Users, 
  ExternalLink,
  HandCoins,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { slugify } from '@/lib/utils';
import Link from 'next/link';

export default function StartupPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startupData, setStartupData] = useState<any>(null);

  const [startup, setStartup] = useState({
    name: '',
    shortDescription: '',
    industry: '',
    stage: 'Idea',
    fundingNeed: '',
    location: '',
    website: '',
    tags: '',
    problem: '',
    solution: '',
    targetMarket: '',
    businessModel: '',
    traction: '',
    teamInfo: '',
    pitchDeckUrl: '',
  });

  useEffect(() => {
    async function loadStartup() {
      if (!firestore || !user?.uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'startups', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setStartupData(data);
          setStartup({
            name: data.name || '',
            shortDescription: data.shortDescription || '',
            industry: data.industry || '',
            stage: data.stage || 'Idea',
            fundingNeed: data.fundingNeed || '',
            location: data.location || '',
            website: data.website || '',
            tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
            problem: data.problem || '',
            solution: data.solution || '',
            targetMarket: data.targetMarket || '',
            businessModel: data.businessModel || '',
            traction: data.traction || '',
            teamInfo: data.teamInfo || '',
            pitchDeckUrl: data.pitchDeckUrl || '',
          });
          setIsEditing(false);
        } else {
          setIsEditing(true);
        }
      } catch (error) {
        console.error("Error loading startup:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStartup();
  }, [firestore, user?.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    setIsSaving(true);
    try {
      const tagsArray = startup.tags.split(',').map(t => t.trim()).filter(t => t !== '');
      // Ensure slug is always generated/updated from current name
      const slug = slugify(startup.name);
      
      const updateData = {
        ...startup,
        tags: tagsArray,
        slug,
        status: 'active',
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
        ...(startupData ? {} : { createdAt: serverTimestamp() })
      };

      await setDoc(doc(firestore, 'startups', user.uid), updateData, { merge: true });

      toast({ title: "Startup Saved", description: "Your venture profile is now updated and public." });
      setIsEditing(false);
      setStartupData(updateData);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save startup data." });
    } finally {
      setIsSaving(false);
    }
  };

  const copyListingLink = () => {
    // If slug is available in saved data, use it; otherwise fallback to UID
    const identifier = startupData?.slug || user?.uid;
    if (!identifier) return;

    const url = `${window.location.origin}/startups/${identifier}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link Copied", description: "Public listing URL is ready to share." });
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-8 pb-12 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
           <nav className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            <span>Workspace</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-primary">Startup Profile</span>
          </nav>
          <h1 className="text-4xl font-black tracking-tight text-slate-900">My Startup</h1>
        </div>
        <div className="flex gap-2">
          {!isEditing && startupData && (
            <>
              <Button variant="outline" className="rounded-xl h-10 gap-2 font-bold border-slate-200" onClick={copyListingLink}>
                <Share2 className="h-4 w-4" /> Share Listing
              </Button>
              <Button className="rounded-xl h-10 font-bold shadow-lg shadow-primary/20" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            </>
          )}
        </div>
      </div>
      
      {isEditing ? (
        <Card className="border-none shadow-xl rounded-[2.5rem] bg-background ring-1 ring-slate-100 overflow-hidden">
          <form onSubmit={handleSave}>
            <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
              <CardTitle className="text-2xl font-black">Startup Setup</CardTitle>
              <CardDescription>Tell the ecosystem about your venture and what you're building.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-12">
              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Rocket className="h-4 w-4" /> Core Identity
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Venture Name</Label>
                    <Input id="name" required value={startup.name} onChange={e => setStartup({...startup, name: e.target.value})} className="h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry / Sector</Label>
                    <Input id="industry" placeholder="e.g. Fintech, EdTech" value={startup.industry} onChange={e => setStartup({...startup, industry: e.target.value})} className="h-12 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Elevator Pitch (Short Bio)</Label>
                  <Textarea id="description" placeholder="A one-sentence impact statement..." rows={2} value={startup.shortDescription} onChange={e => setStartup({...startup, shortDescription: e.target.value})} className="rounded-xl p-4" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="stage">Current Stage</Label>
                    <Select value={startup.stage} onValueChange={v => setStartup({...startup, stage: v})}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Idea", "Early", "Growth", "Scaling"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="funding">Funding Required</Label>
                    <Input id="funding" placeholder="e.g. $50,000" value={startup.fundingNeed} onChange={e => setStartup({...startup, fundingNeed: e.target.value})} className="h-12 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Base Location</Label>
                    <Input id="location" placeholder="e.g. Dhaka, BD" value={startup.location} onChange={e => setStartup({...startup, location: e.target.value})} className="h-12 rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-50">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" /> The Pitch
                </h3>
                <div className="grid gap-6">
                   <div className="space-y-2">
                    <Label htmlFor="problem">The Problem</Label>
                    <Textarea id="problem" rows={3} value={startup.problem} onChange={e => setStartup({...startup, problem: e.target.value})} className="rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solution">The Solution</Label>
                    <Textarea id="solution" rows={3} value={startup.solution} onChange={e => setStartup({...startup, solution: e.target.value})} className="rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-50">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Validation
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="traction">Traction & Progress</Label>
                  <Textarea id="traction" placeholder="Revenue, users, or major milestones..." rows={4} value={startup.traction} onChange={e => setStartup({...startup, traction: e.target.value})} className="rounded-xl" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
              <Button type="submit" className="flex-1 rounded-xl h-12 font-black shadow-lg shadow-primary/20" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                Save Venture Profile
              </Button>
              {startupData && (
                <Button variant="ghost" className="rounded-xl h-12" onClick={() => setIsEditing(false)}>Cancel</Button>
              )}
            </CardFooter>
          </form>
        </Card>
      ) : (
        <Card className="border-none shadow-3xl rounded-[3rem] overflow-hidden bg-background ring-1 ring-slate-100">
           <div className="h-48 bg-gradient-to-br from-primary to-accent" />
           <div className="px-10 pb-12 -mt-10">
              <div className="flex flex-col md:flex-row justify-between items-end gap-6 mb-12">
                 <div className="p-6 bg-white rounded-[2rem] shadow-2xl ring-1 ring-slate-100 flex items-center justify-center">
                    <Rocket className="h-12 w-12 text-primary" />
                 </div>
                 <div className="flex-1 space-y-2">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">{startupData?.name}</h2>
                    <div className="flex items-center gap-4">
                       <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-bold rounded-lg px-3">{startupData?.industry}</Badge>
                       <span className="text-sm font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-tighter">
                          <MapPin className="h-3.5 w-3.5" /> {startupData?.location}
                       </span>
                    </div>
                 </div>
                 <Badge className="h-10 px-6 rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-primary/20">{startupData?.stage} Stage</Badge>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                 <div className="lg:col-span-8 space-y-12">
                    <section className="space-y-4">
                       <div className="flex items-center gap-3">
                          <div className="h-1 w-8 bg-primary rounded-full" />
                          <h3 className="text-xl font-black text-slate-900">Impact Statement</h3>
                       </div>
                       <p className="text-2xl font-medium text-slate-600 leading-relaxed italic border-l-4 border-primary/10 pl-8 py-2">
                          "{startupData?.shortDescription}"
                       </p>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-50">
                       <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">The Core Problem</h4>
                          <p className="text-slate-600 leading-relaxed font-medium">{startupData?.problem || 'Not specified'}</p>
                       </div>
                       <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary">Our Solution</h4>
                          <p className="text-slate-600 leading-relaxed font-medium">{startupData?.solution || 'Not specified'}</p>
                       </div>
                    </div>
                 </div>

                 <div className="lg:col-span-4 space-y-6">
                    <Card className="border-none shadow-md rounded-[2.5rem] bg-slate-50 p-8 space-y-8">
                       <div className="space-y-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Target Funding</p>
                          <p className="text-3xl font-black text-slate-900">{startupData?.fundingNeed || 'TBD'}</p>
                       </div>
                       <div className="space-y-3 pt-6 border-t border-slate-100">
                          {startupData?.website && (
                             <Button variant="outline" className="w-full justify-between h-12 rounded-xl font-bold border-slate-200" asChild>
                                <a href={startupData.website} target="_blank"><Globe className="h-4 w-4" /> Website <ExternalLink className="h-3 w-3 opacity-30" /></a>
                             </Button>
                          )}
                          {startupData?.pitchDeckUrl && (
                             <Button variant="outline" className="w-full justify-between h-12 rounded-xl font-bold border-slate-200" asChild>
                                <a href={startupData.pitchDeckUrl} target="_blank"><FileText className="h-4 w-4" /> Pitch Deck <ExternalLink className="h-3 w-3 opacity-30" /></a>
                             </Button>
                          )}
                       </div>
                    </Card>
                    
                    <div className="p-8 text-center space-y-4">
                       <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Public Visibility: ACTIVE</p>
                       <Button variant="link" className="text-primary font-bold" asChild>
                          <Link href={`/startups/${startupData?.slug || user?.uid}`} className="gap-2">View Public Profile <ArrowRight className="h-4 w-4" /></Link>
                       </Button>
                    </div>
                 </div>
              </div>
           </div>
        </Card>
      )}
    </div>
  );
}

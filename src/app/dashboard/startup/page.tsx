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
  HandCoins
} from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

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
      
      const updateData = {
        ...startup,
        tags: tagsArray,
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
        ...(startupData ? {} : { createdAt: serverTimestamp() })
      };

      await setDoc(doc(firestore, 'startups', user.uid), updateData, { merge: true });

      toast({
        title: "Startup Saved",
        description: "Your startup profile has been updated.",
      });
      setIsEditing(false);
      setStartupData(updateData);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save startup data.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyListingLink = () => {
    const url = `${window.location.origin}/startups/${user?.uid}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Startup listing link copied to clipboard.",
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Startup Listing</h1>
        <div className="flex gap-2">
          {!isEditing && startupData && (
            <>
              <Button variant="outline" className="gap-2" onClick={copyListingLink}>
                <Share2 className="h-4 w-4" /> Share Listing
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit Listing
              </Button>
            </>
          )}
        </div>
      </div>
      
      {isEditing ? (
        <Card>
          <form onSubmit={handleSave}>
            <CardHeader>
              <CardTitle>{startupData ? 'Update Startup' : 'Register Your Startup'}</CardTitle>
              <CardDescription>Share the details of your venture with potential investors and partners.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-primary" /> Core Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Startup Name</Label>
                    <Input 
                      id="name" 
                      required 
                      value={startup.name}
                      onChange={e => setStartup({...startup, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input 
                      id="industry" 
                      placeholder="e.g. Fintech, AI, AgriTech"
                      value={startup.industry}
                      onChange={e => setStartup({...startup, industry: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Short Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Elevator pitch for your startup (max 200 characters)"
                    rows={2} 
                    value={startup.shortDescription}
                    onChange={e => setStartup({...startup, shortDescription: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stage">Current Stage</Label>
                    <Select value={startup.stage} onValueChange={v => setStartup({...startup, stage: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Idea">Idea</SelectItem>
                        <SelectItem value="Early">Early</SelectItem>
                        <SelectItem value="Growth">Growth</SelectItem>
                        <SelectItem value="Scaling">Scaling</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="funding">Funding Need ($)</Label>
                    <Input 
                      id="funding" 
                      placeholder="e.g. $50,000"
                      value={startup.fundingNeed}
                      onChange={e => setStartup({...startup, fundingNeed: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input 
                      id="location" 
                      placeholder="e.g. Dhaka, Bangladesh"
                      value={startup.location}
                      onChange={e => setStartup({...startup, location: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input 
                      id="website" 
                      placeholder="https://..."
                      value={startup.website}
                      onChange={e => setStartup({...startup, website: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (comma separated)</Label>
                  <Input 
                    id="tags" 
                    placeholder="SaaS, AI, B2B"
                    value={startup.tags}
                    onChange={e => setStartup({...startup, tags: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" /> Startup Pitch
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="problem">Problem</Label>
                    <Textarea 
                      id="problem" 
                      placeholder="What problem are you solving?"
                      rows={3} 
                      value={startup.problem}
                      onChange={e => setStartup({...startup, problem: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="solution">Solution</Label>
                    <Textarea 
                      id="solution" 
                      placeholder="How are you solving it?"
                      rows={3} 
                      value={startup.solution}
                      onChange={e => setStartup({...startup, solution: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="targetMarket">Target Market</Label>
                    <Textarea 
                      id="targetMarket" 
                      placeholder="Who are your customers?"
                      rows={2} 
                      value={startup.targetMarket}
                      onChange={e => setStartup({...startup, targetMarket: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessModel">Business Model</Label>
                    <Textarea 
                      id="businessModel" 
                      placeholder="How do you make money?"
                      rows={2} 
                      value={startup.businessModel}
                      onChange={e => setStartup({...startup, businessModel: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" /> Proof & Details
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="traction">Traction</Label>
                    <Textarea 
                      id="traction" 
                      placeholder="Any users, revenue, growth, or validation?"
                      rows={3} 
                      value={startup.traction}
                      onChange={e => setStartup({...startup, traction: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teamInfo">Team</Label>
                    <Textarea 
                      id="teamInfo" 
                      placeholder="Who is building this? (solo founder or team)"
                      rows={2} 
                      value={startup.teamInfo}
                      onChange={e => setStartup({...startup, teamInfo: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pitchDeck">Pitch Deck URL</Label>
                    <Input 
                      id="pitchDeck" 
                      placeholder="Google Drive / PDF link"
                      value={startup.pitchDeckUrl}
                      onChange={e => setStartup({...startup, pitchDeckUrl: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save Listing
              </Button>
              {startupData && <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>}
            </CardFooter>
          </form>
        </Card>
      ) : (
        <Card className="border-primary/20 shadow-lg overflow-hidden">
          <CardHeader className="bg-primary/5 pb-8">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <CardTitle className="text-3xl">{startupData?.name}</CardTitle>
                <CardDescription className="text-lg text-primary font-medium">{startupData?.industry}</CardDescription>
              </div>
              <Badge className="px-4 py-1 text-sm">{startupData?.stage}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-8 pt-8 px-8">
            <div className="space-y-4">
              <p className="text-xl leading-relaxed text-foreground/80 italic">
                "{startupData?.shortDescription}"
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" /> {startupData?.location || 'Remote'}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4 text-primary" /> 
                  <span className="truncate">{startupData?.website || 'No website'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-primary font-bold">
                  <HandCoins className="h-4 w-4" /> {startupData?.fundingNeed || 'TBD'}
                </div>
              </div>
            </div>

            {(startupData?.problem || startupData?.solution || startupData?.targetMarket || startupData?.businessModel) && (
              <div className="space-y-6 pt-6 border-t">
                <h3 className="text-lg font-bold">Venture Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {startupData?.problem && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">The Problem</Label>
                      <p className="text-sm leading-relaxed">{startupData.problem}</p>
                    </div>
                  )}
                  {startupData?.solution && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">The Solution</Label>
                      <p className="text-sm leading-relaxed">{startupData.solution}</p>
                    </div>
                  )}
                  {startupData?.targetMarket && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Target Market</Label>
                      <p className="text-sm leading-relaxed">{startupData.targetMarket}</p>
                    </div>
                  )}
                  {startupData?.businessModel && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Business Model</Label>
                      <p className="text-sm leading-relaxed">{startupData.businessModel}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(startupData?.traction || startupData?.teamInfo || startupData?.pitchDeckUrl) && (
              <div className="space-y-6 pt-6 border-t">
                <h3 className="text-lg font-bold">Proof & Validation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {startupData?.traction && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Traction</Label>
                      <p className="text-sm leading-relaxed">{startupData.traction}</p>
                    </div>
                  )}
                  {startupData?.teamInfo && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-widest text-muted-foreground">Team</Label>
                      <p className="text-sm leading-relaxed">{startupData.teamInfo}</p>
                    </div>
                  )}
                </div>
                {startupData?.pitchDeckUrl && (
                  <div className="pt-2">
                    <Button variant="outline" asChild className="gap-2">
                      <a href={startupData.pitchDeckUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> View Pitch Deck
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {startupData?.tags && startupData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4">
                {startupData.tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="rounded-xl px-3 bg-muted text-muted-foreground hover:bg-muted border-none">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

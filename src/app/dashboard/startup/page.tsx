
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
import { Globe, MapPin, Tag, Loader2, Rocket, Share2 } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function StartupPage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'startups', user.uid);
  }, [firestore, user]);

  const { data: startupData, isLoading } = useDoc(startupRef);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [startup, setStartup] = useState({
    name: '',
    shortDescription: '',
    industry: '',
    stage: 'Idea',
    fundingNeed: '',
    location: '',
    website: '',
    tags: '',
  });

  useEffect(() => {
    if (startupData) {
      setStartup({
        name: startupData.name || '',
        shortDescription: startupData.shortDescription || '',
        industry: startupData.industry || '',
        stage: startupData.stage || 'Idea',
        fundingNeed: startupData.fundingNeed || '',
        location: startupData.location || '',
        website: startupData.website || '',
        tags: Array.isArray(startupData.tags) ? startupData.tags.join(', ') : '',
      });
      setIsEditing(false);
    } else if (!isLoading) {
      setIsEditing(true);
    }
  }, [startupData, isLoading]);

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
    <div className="max-w-4xl mx-auto w-full space-y-8">
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
              <CardDescription>Fill in the details to list your venture on the platform.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                    placeholder="e.g. Fintech, Edtech" 
                    value={startup.industry}
                    onChange={e => setStartup({...startup, industry: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Short Description</Label>
                <Textarea 
                  id="description" 
                  rows={3} 
                  placeholder="What are you building?"
                  value={startup.shortDescription}
                  onChange={e => setStartup({...startup, shortDescription: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Current Stage</Label>
                  <Select value={startup.stage} onValueChange={v => setStartup({...startup, stage: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Idea">Idea</SelectItem>
                      <SelectItem value="Pre-Seed">Pre-Seed</SelectItem>
                      <SelectItem value="Seed">Seed</SelectItem>
                      <SelectItem value="Series A">Series A</SelectItem>
                      <SelectItem value="Growth">Growth</SelectItem>
                      <SelectItem value="Scaling">Scaling</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="funding">Funding Need ($)</Label>
                  <Input 
                    id="funding" 
                    placeholder="e.g. 50,000" 
                    value={startup.fundingNeed}
                    onChange={e => setStartup({...startup, fundingNeed: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input 
                    id="location" 
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
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input 
                  id="tags" 
                  placeholder="e.g. AI, SaaS, Green" 
                  value={startup.tags}
                  onChange={e => setStartup({...startup, tags: e.target.value})}
                />
              </div>
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {startupData ? 'Update Startup' : 'Save Listing'}
              </Button>
              {startupData && (
                <Button variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{startupData?.name || startup.name}</CardTitle>
                  <p className="text-primary font-medium">{startupData?.industry || startup.industry}</p>
                </div>
                <Badge>{startupData?.stage || startup.stage}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-lg">{startupData?.shortDescription || startup.shortDescription}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {startupData?.location || startup.location || 'Remote'}
                </div>
                {(startupData?.website || startup.website) && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <a href={startupData?.website || startup.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {(startupData?.website || startup.website)?.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
                  Goal: ${startupData?.fundingNeed || startup.fundingNeed || '0'}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(startupData?.tags || (startup.tags ? startup.tags.split(',') : []))?.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {tag.trim()}
                  </Badge>
                ))}
                {(!startupData?.tags && !startup.tags) && <span className="text-xs text-muted-foreground italic">No tags added</span>}
              </div>
            </CardContent>
          </Card>
          
          <div className="bg-muted/30 rounded-lg p-6 border text-center">
            <Rocket className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Your startup listing is now visible to investors in the ecosystem.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


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
import { Globe, MapPin, Tag, Loader2, Rocket } from 'lucide-react';
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
    } else {
      setIsEditing(true);
    }
  }, [startupData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    try {
      const tagsArray = startup.tags.split(',').map(t => t.trim()).filter(t => t !== '');
      
      await setDoc(doc(firestore, 'startups', user.uid), {
        ...startup,
        tags: tagsArray,
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
        createdAt: startupData ? startupData.createdAt : serverTimestamp(),
      });

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
    }
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
      <h1 className="text-3xl font-bold">Startup Listing</h1>
      
      {isEditing ? (
        <Card>
          <form onSubmit={handleSave}>
            <CardHeader>
              <CardTitle>Register Your Startup</CardTitle>
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
              <Button type="submit" className="w-full">Save Listing</Button>
              {startupData && <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>}
            </CardFooter>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{startupData?.name}</CardTitle>
                  <p className="text-primary font-medium">{startupData?.industry}</p>
                </div>
                <Badge>{startupData?.stage}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-lg">{startupData?.shortDescription}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {startupData?.location}
                </div>
                {startupData?.website && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Globe className="h-4 w-4" />
                    <a href={startupData.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {startupData.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
                  Goal: ${startupData?.fundingNeed}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {startupData?.tags?.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 p-4 border-t">
              <Button variant="outline" onClick={() => setIsEditing(true)} className="text-xs">
                Edit Listing
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}


'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Globe, MapPin, Tag } from 'lucide-react';

export default function StartupPage() {
  const { toast } = useToast();
  const [isCreated, setIsCreated] = useState(false);
  const [startup, setStartup] = useState({
    name: '',
    description: '',
    industry: '',
    stage: 'Idea',
    fundingNeed: '',
    location: '',
    website: '',
    tags: '',
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreated(true);
    toast({
      title: "Startup Created",
      description: "Listing updated locally (demo mode).",
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Startup Listing</h1>
      
      {!isCreated ? (
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
                  value={startup.description}
                  onChange={e => setStartup({...startup, description: e.target.value})}
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
            <CardFooter>
              <Button type="submit" className="w-full">Create Listing</Button>
            </CardFooter>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{startup.name}</CardTitle>
                  <p className="text-primary font-medium">{startup.industry}</p>
                </div>
                <Badge>{startup.stage}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-lg">{startup.description}</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {startup.location}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  {startup.website}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
                  Goal: ${startup.fundingNeed}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {startup.tags.split(',').map(tag => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/30 p-4 border-t">
              <Button variant="ghost" onClick={() => setIsCreated(false)} className="text-xs">
                Edit Listing
              </Button>
            </CardFooter>
          </Card>
          
          <div className="bg-primary/5 p-6 rounded-xl border border-primary/10">
            <h3 className="font-bold mb-2">Visibility Check</h3>
            <p className="text-sm text-muted-foreground">
              Your startup is now visible to the community in the demo mode. 
              In production, you will be able to see who viewed your profile and manage pitch requests here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

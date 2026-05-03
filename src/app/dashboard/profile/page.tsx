
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, Plus, Trash2, Linkedin, Globe, Twitter, Image as ImageIcon, Briefcase, TrendingUp, Users } from 'lucide-react';

export default function ProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    imageUrl: '',
    headline: '',
    investorHeadline: '',
    location: '',
    stage: '',
    skills: '',
    bio: '',
    investorBio: '',
    whyBuilding: '',
    lookingFor: '',
    linkedinUrl: '',
    ticketSize: '',
    isOpenToPitches: false,
    investmentFocus: '',
    preferredStage: '',
    lookingForCofounder: false,
    cofounderSkills: '',
    cofounderRole: '',
    equityOffer: '',
    commitmentType: '',
    socialLinks: {
      linkedin: '',
      website: '',
      twitter: '',
    },
    availability: {
      openToInvestment: false,
      hiring: false,
      coFounder: false,
    },
    experience: [{ company: '', role: '', duration: '', description: '' }],
    achievements: [''],
  });

  useEffect(() => {
    async function loadProfile() {
      if (!firestore || !user?.uid) return;
      setIsLoading(true);
      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const profile = snap.data();
          setUserRole(profile.role);
          setFormData({
            fullName: profile.fullName || '',
            imageUrl: profile.imageUrl || '',
            headline: profile.headline || '',
            investorHeadline: profile.investorHeadline || '',
            location: profile.location || '',
            stage: profile.stage || '',
            skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
            bio: profile.bio || '',
            investorBio: profile.investorBio || '',
            whyBuilding: profile.whyBuilding || '',
            lookingFor: profile.lookingFor || '',
            linkedinUrl: profile.linkedinUrl || profile.socialLinks?.linkedin || '',
            ticketSize: profile.ticketSize || '',
            isOpenToPitches: profile.isOpenToPitches || false,
            investmentFocus: Array.isArray(profile.investmentFocus) ? profile.investmentFocus.join(', ') : '',
            preferredStage: Array.isArray(profile.preferredStage) ? profile.preferredStage.join(', ') : '',
            lookingForCofounder: profile.lookingForCofounder || false,
            cofounderSkills: Array.isArray(profile.cofounderSkills) ? profile.cofounderSkills.join(', ') : '',
            cofounderRole: profile.cofounderRole || '',
            equityOffer: profile.equityOffer || '',
            commitmentType: profile.commitmentType || '',
            socialLinks: profile.socialLinks || { linkedin: '', website: '', twitter: '' },
            availability: profile.availability || { openToInvestment: false, hiring: false, coFounder: false },
            experience: profile.experience && profile.experience.length > 0 ? profile.experience : [{ company: '', role: '', duration: '', description: '' }],
            achievements: profile.achievements && profile.achievements.length > 0 ? profile.achievements : [''],
          });
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, [firestore, user?.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    setIsSaving(true);
    try {
      // Process comma-separated strings into arrays for structured data storage
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s !== '');
      const focusArray = formData.investmentFocus.split(',').map(s => s.trim()).filter(s => s !== '');
      const stageArray = formData.preferredStage.split(',').map(s => s.trim()).filter(s => s !== '');
      const cofounderSkillsArray = formData.cofounderSkills.split(',').map(s => s.trim()).filter(s => s !== '');
      
      const updatedData = {
        ...formData,
        skills: skillsArray,
        investmentFocus: focusArray,
        preferredStage: stageArray,
        cofounderSkills: cofounderSkillsArray,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(firestore, 'users', user.uid), updatedData, { merge: true });

      toast({
        title: "Success",
        description: "Profile updated successfully.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update profile.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addExperience = () => {
    setFormData({
      ...formData,
      experience: [...formData.experience, { company: '', role: '', duration: '', description: '' }]
    });
  };

  const removeExperience = (index: number) => {
    const newExp = [...formData.experience];
    newExp.splice(index, 1);
    setFormData({ ...formData, experience: newExp });
  };

  const updateExperience = (index: number, field: string, value: string) => {
    const newExp = [...formData.experience];
    newExp[index] = { ...newExp[index], [field]: value };
    setFormData({ ...formData, experience: newExp });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isInvestor = userRole === 'investor';
  const isFounder = userRole === 'founder';

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{isInvestor ? 'Investor Profile' : 'Founder Profile'}</h1>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Your public identity on TabStartup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    value={formData.fullName} 
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input 
                    id="location" 
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl" className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> Profile Image URL
                </Label>
                <Input 
                  id="imageUrl" 
                  placeholder="https://..."
                  value={formData.imageUrl}
                  onChange={e => setFormData({...formData, imageUrl: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">{isInvestor ? 'Investor Headline' : 'Headline'}</Label>
                <Input 
                  id="headline" 
                  placeholder={isInvestor ? "e.g. Managing Partner at Delta VC" : "e.g. Building the future of AgriTech"}
                  value={isInvestor ? formData.investorHeadline : formData.headline}
                  onChange={e => setFormData({...formData, [isInvestor ? 'investorHeadline' : 'headline']: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">{isInvestor ? 'Investor Biography' : 'About Me'}</Label>
                <Textarea 
                  id="bio" 
                  rows={4} 
                  placeholder={isInvestor ? "Tell founders about your investment philosophy..." : "Tell us your story..."}
                  value={isInvestor ? formData.investorBio : formData.bio}
                  onChange={e => setFormData({...formData, [isInvestor ? 'investorBio' : 'bio']: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

          {isFounder && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Co-founder
                </CardTitle>
                <CardDescription>Looking for a partner to build with?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2 bg-primary/5 p-4 rounded-xl border border-primary/10">
                  <Checkbox 
                    id="lookingForCofounder" 
                    checked={formData.lookingForCofounder}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      lookingForCofounder: !!checked
                    })}
                  />
                  <Label htmlFor="lookingForCofounder" className="font-bold cursor-pointer text-primary">Looking for Co-founder</Label>
                </div>

                {formData.lookingForCofounder && (
                  <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="commitmentType">Expected Commitment</Label>
                        <Select 
                          value={formData.commitmentType} 
                          onValueChange={v => setFormData({...formData, commitmentType: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Full-time">Full-time</SelectItem>
                            <SelectItem value="Part-time">Part-time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="equityOffer">Equity Range (%)</Label>
                        <Input 
                          id="equityOffer" 
                          placeholder="e.g. 10-25%"
                          value={formData.equityOffer}
                          onChange={e => setFormData({...formData, equityOffer: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cofounderRole">Role Description</Label>
                      <Textarea 
                        id="cofounderRole" 
                        placeholder="Describe the responsibilities and expectations for your co-founder..."
                        value={formData.cofounderRole}
                        rows={3}
                        onChange={e => setFormData({...formData, cofounderRole: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cofounderSkills">Required Skills (comma separated)</Label>
                      <Input 
                        id="cofounderSkills" 
                        placeholder="e.g. React, Node.js, Sales, Operations"
                        value={formData.cofounderSkills}
                        onChange={e => setFormData({...formData, cofounderSkills: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isInvestor ? (
            <Card>
              <CardHeader>
                <CardTitle>Investment Strategy</CardTitle>
                <CardDescription>Define your investment criteria to attract the right founders.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ticketSize">Ticket Size</Label>
                    <Input 
                      id="ticketSize" 
                      placeholder="e.g. $10k - $50k"
                      value={formData.ticketSize}
                      onChange={e => setFormData({...formData, ticketSize: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredStage">Preferred Stages</Label>
                    <Input 
                      id="preferredStage" 
                      placeholder="e.g. Idea, Early, Growth (comma separated)"
                      value={formData.preferredStage}
                      onChange={e => setFormData({...formData, preferredStage: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="focus">Investment Focus</Label>
                  <Input 
                    id="focus" 
                    placeholder="e.g. Fintech, AI, SaaS (comma separated)"
                    value={formData.investmentFocus}
                    onChange={e => setFormData({...formData, investmentFocus: e.target.value})}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox 
                    id="openToPitches" 
                    checked={formData.isOpenToPitches}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      isOpenToPitches: !!checked
                    })}
                  />
                  <Label htmlFor="openToPitches" className="font-normal cursor-pointer">Open to direct pitches from founders</Label>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Professional Experience</CardTitle>
                  <CardDescription>Share your career journey.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {formData.experience.map((exp, index) => (
                    <div key={index} className="space-y-4 p-4 border rounded-lg relative group">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeExperience(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Company</Label>
                          <Input 
                            value={exp.company} 
                            onChange={e => updateExperience(index, 'company', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <Input 
                            value={exp.role} 
                            onChange={e => updateExperience(index, 'role', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Duration</Label>
                        <Input 
                          value={exp.duration} 
                          onChange={e => updateExperience(index, 'duration', e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full" onClick={addExperience}>
                    <Plus className="h-4 w-4 mr-2" /> Add Experience
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Motivation & Vision</CardTitle>
                  <CardDescription>Why are you building this startup?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="why">The "Why" Behind Your Vision</Label>
                    <Textarea 
                      id="why" 
                      rows={6} 
                      placeholder="Investors look for passion and purpose."
                      value={formData.whyBuilding}
                      onChange={e => setFormData({...formData, whyBuilding: e.target.value})}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          {!isInvestor && (
            <Card>
              <CardHeader>
                <CardTitle>Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="investment" 
                    checked={formData.availability.openToInvestment}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      availability: {...formData.availability, openToInvestment: !!checked}
                    })}
                  />
                  <Label htmlFor="investment" className="font-normal cursor-pointer">Open to Investment</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="hiring" 
                    checked={formData.availability.hiring}
                    onCheckedChange={(checked) => setFormData({
                      ...formData, 
                      availability: {...formData.availability, hiring: !!checked}
                    })}
                  />
                  <Label htmlFor="hiring" className="font-normal cursor-pointer">Currently Hiring</Label>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Social Presence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Linkedin className="h-4 w-4" /> LinkedIn URL</Label>
                <Input 
                  placeholder="https://linkedin.com/in/..."
                  value={formData.linkedinUrl}
                  onChange={e => setFormData({
                    ...formData, 
                    linkedinUrl: e.target.value
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Globe className="h-4 w-4" /> Website</Label>
                <Input 
                  placeholder="https://..."
                  value={formData.socialLinks.website}
                  onChange={e => setFormData({
                    ...formData, 
                    socialLinks: {...formData.socialLinks, website: e.target.value}
                  })}
                />
              </div>
            </CardContent>
          </Card>

          {isInvestor && (
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm">Quick Tips for Investors</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2 text-muted-foreground">
                <p>• Clear <strong>Investment Focus</strong> helps founders find you faster.</p>
                <p>• Setting a <strong>Ticket Size</strong> reduces mismatched inquiries.</p>
                <p>• Being <strong>Open to Pitches</strong> allows verified founders to contact you directly.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

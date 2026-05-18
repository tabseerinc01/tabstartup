'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useStorage } from '@/firebase';
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { Loader2, Plus, Trash2, Linkedin, Globe, Camera, Upload, ShieldCheck, Zap, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { validateImage, uploadProfileImage } from '@/lib/storage-helpers';

const AVAILABLE_ROLES = [
  { id: 'founder', label: 'Founder', icon: Zap },
  { id: 'investor', label: 'Investor', icon: ShieldCheck },
  { id: 'mentor', label: 'Mentor', icon: Users },
];

export default function ProfilePage() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [isActivatingRole, setIsActivatingRole] = useState<string | null>(null);
  
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
    isMentor: false,
    mentorSkills: '',
    mentorBio: '',
    yearsOfExperience: '',
    mentorAvailability: '',
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
          const roles = profile.roles || [profile.role] || ['founder'];
          setUserRoles(roles);
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
            isMentor: profile.isMentor || roles.includes('mentor') || false,
            mentorSkills: Array.isArray(profile.mentorSkills) ? profile.mentorSkills.join(', ') : '',
            mentorBio: profile.mentorBio || '',
            yearsOfExperience: profile.yearsOfExperience || '',
            mentorAvailability: profile.mentorAvailability || '',
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !storage || !firestore) return;

    // 1. Validation
    const { error } = validateImage(file);
    if (error) {
      toast({ title: "Validation Error", description: error, variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 2. Upload to Storage
      const downloadURL = await uploadProfileImage(storage, user.uid, file, (progress) => {
        setUploadProgress(progress);
      });

      // 3. Update Firestore immediately
      await updateDoc(doc(firestore, 'users', user.uid), {
        imageUrl: downloadURL,
        updatedAt: serverTimestamp()
      });

      // 4. Update Local State
      setFormData(prev => ({ ...prev, imageUrl: downloadURL }));
      
      toast({ title: "Image Uploaded", description: "Your profile picture has been updated." });
    } catch (error: any) {
      console.error("Upload failed:", error);
      toast({ title: "Upload Failed", description: error.message || "Could not upload image.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || isUploading) return;

    setIsSaving(true);
    try {
      const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s !== '');
      const focusArray = formData.investmentFocus.split(',').map(s => s.trim()).filter(s => s !== '');
      const stageArray = formData.preferredStage.split(',').map(s => s.trim()).filter(s => s !== '');
      const cofounderSkillsArray = formData.cofounderSkills.split(',').map(s => s.trim()).filter(s => s !== '');
      const mentorSkillsArray = formData.mentorSkills.split(',').map(s => s.trim()).filter(s => s !== '');
      
      const updatedData = {
        ...formData,
        skills: skillsArray,
        investmentFocus: focusArray,
        preferredStage: stageArray,
        cofounderSkills: cofounderSkillsArray,
        mentorSkills: mentorSkillsArray,
        isMentor: userRoles.includes('mentor'),
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

  const activateRole = async (roleId: string) => {
    if (!firestore || !user?.uid || isActivatingRole) return;
    
    setIsActivatingRole(roleId);
    try {
      await updateDoc(doc(firestore, 'users', user.uid), {
        roles: arrayUnion(roleId),
        updatedAt: serverTimestamp()
      });
      setUserRoles(prev => [...new Set([...prev, roleId])]);
      toast({ title: "Role Activated", description: `You have successfully joined the ecosystem as a ${roleId}.` });
    } catch (error) {
      toast({ title: "Activation Failed", variant: "destructive" });
    } finally {
      setIsActivatingRole(null);
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

  const initials = formData.fullName?.charAt(0) || user?.email?.charAt(0).toUpperCase() || '?';

  return (
    <div className="max-w-4xl mx-auto w-full space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Profile Settings</h1>
          <div className="flex gap-1.5 mt-2">
            {userRoles.map(role => (
              <Badge key={role} className="capitalize bg-primary/10 text-primary border-none text-[10px] font-bold">
                {role}
              </Badge>
            ))}
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving || isUploading}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Ecosystem Roles
              </CardTitle>
              <CardDescription>Activate additional profiles to unlock more features.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AVAILABLE_ROLES.map(role => {
                  const isActive = userRoles.includes(role.id);
                  return (
                    <Button
                      key={role.id}
                      variant={isActive ? "default" : "outline"}
                      className={`h-auto py-4 flex-col gap-2 rounded-2xl ${isActive ? 'bg-white text-primary shadow-sm hover:bg-white' : 'border-dashed'}`}
                      onClick={() => !isActive && activateRole(role.id)}
                      disabled={isActive || isActivatingRole === role.id}
                    >
                      {isActivatingRole === role.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <role.icon className={`h-6 w-6 ${isActive ? 'text-primary' : 'text-muted-foreground opacity-40'}`} />
                      )}
                      <span className="font-bold text-xs">{role.label}</span>
                      {isActive && <Badge variant="secondary" className="h-4 px-1.5 text-[8px] bg-green-50 text-green-700">ACTIVE</Badge>}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Your public identity on TabStartup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col items-center sm:flex-row gap-6 p-4 bg-muted/20 rounded-2xl">
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-xl rounded-2xl overflow-hidden">
                    <AvatarImage src={formData.imageUrl} className="object-cover" />
                    <AvatarFallback className="text-2xl font-bold rounded-2xl">{initials}</AvatarFallback>
                  </Avatar>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                    disabled={isUploading}
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </button>
                </div>
                
                <div className="flex-1 space-y-3 w-full">
                  <Label>Profile Picture</Label>
                  <div className="flex flex-col gap-2">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/jpeg,image/png,image/webp" 
                      onChange={handleImageUpload}
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full sm:w-fit rounded-xl gap-2"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {formData.imageUrl ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">Supported: JPG, PNG, WebP. Max 5MB.</p>
                  </div>
                  {isUploading && (
                    <div className="space-y-1">
                      <Progress value={uploadProgress} className="h-1" />
                      <p className="text-[9px] text-primary font-bold text-right">{Math.round(uploadProgress)}%</p>
                    </div>
                  )}
                </div>
              </div>

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
                <Label htmlFor="headline">Professional Headline</Label>
                <Input 
                  id="headline" 
                  placeholder="e.g. Building the future of Fintech in Bangladesh"
                  value={formData.headline}
                  onChange={e => setFormData({...formData, headline: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">About Me</Label>
                <Textarea 
                  id="bio" 
                  rows={4} 
                  placeholder="Tell the community about your journey and vision..."
                  value={formData.bio}
                  onChange={e => setFormData({...formData, bio: e.target.value})}
                />
              </div>
            </CardContent>
          </Card>

          {userRoles.includes('mentor') && (
            <Card className="animate-in fade-in slide-in-from-top-4 duration-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Mentor Details
                </CardTitle>
                <CardDescription>Share your experience and guide others.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="yearsExp">Years of Experience</Label>
                      <Input 
                        id="yearsExp" 
                        placeholder="e.g. 10+ years"
                        value={formData.yearsOfExperience}
                        onChange={e => setFormData({...formData, yearsOfExperience: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mentorAvailability">Availability</Label>
                      <Select 
                        value={formData.mentorAvailability} 
                        onValueChange={v => setFormData({...formData, mentorAvailability: v})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select availability" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Open to mentoring">Open to mentoring</SelectItem>
                          <SelectItem value="Limited availability">Limited availability</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mentorSkills">Mentor Skills (comma separated)</Label>
                    <Input 
                      id="mentorSkills" 
                      placeholder="e.g. Leadership, Scaling, Fundraising"
                      value={formData.mentorSkills}
                      onChange={e => setFormData({...formData, mentorSkills: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mentorBio">Mentor Biography</Label>
                    <Textarea 
                      id="mentorBio" 
                      placeholder="Describe your areas of expertise and how you can help founders..."
                      value={formData.mentorBio}
                      rows={4}
                      onChange={e => setFormData({...formData, mentorBio: e.target.value})}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {userRoles.includes('founder') && (
            <Card className="animate-in fade-in slide-in-from-top-4 duration-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" /> Founder & Co-founder
                </CardTitle>
                <CardDescription>Looking for a partner to build with?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="why">The "Why" Behind Your Vision</Label>
                    <Textarea 
                      id="why" 
                      rows={4} 
                      placeholder="Investors look for passion and purpose."
                      value={formData.whyBuilding}
                      onChange={e => setFormData({...formData, whyBuilding: e.target.value})}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2 bg-primary/5 p-4 rounded-xl border border-primary/10">
                    <Checkbox 
                      id="lookingForCofounder" 
                      checked={formData.lookingForCofounder}
                      onCheckedChange={(checked) => setFormData({
                        ...formData, 
                        lookingForCofounder: !!checked
                      })}
                    />
                    <Label htmlFor="lookingForCofounder" className="font-bold cursor-pointer text-primary">Actively seeking a Co-founder</Label>
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
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {userRoles.includes('investor') && (
            <Card className="animate-in fade-in slide-in-from-top-4 duration-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Investor Profile
                </CardTitle>
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
                <div className="space-y-2">
                  <Label htmlFor="investorBio">Investment Philosophy</Label>
                  <Textarea 
                    id="investorBio" 
                    rows={4} 
                    placeholder="Tell founders about your approach to supporting startups..."
                    value={formData.investorBio}
                    onChange={e => setFormData({...formData, investorBio: e.target.value})}
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
          )}

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
        </div>

        <div className="space-y-6">
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

          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-sm">Ecosystem Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground leading-relaxed">
              <p>• <strong>Multiple Roles:</strong> You can be both a builder and a backer. Toggle roles to customize your experience.</p>
              <p>• <strong>Visibility:</strong> Profiles with photos and completed bios receive 3x more connection requests.</p>
              <p>• <strong>Mentorship:</strong> Sharing knowledge is the fastest way to grow your own network.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
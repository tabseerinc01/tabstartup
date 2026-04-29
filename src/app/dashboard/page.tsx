
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  User as UserIcon, 
  Rocket, 
  Target, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  Share2, 
  ExternalLink, 
  Copy, 
  HandCoins,
  Eye,
  Users,
  MessageSquare,
  TrendingUp,
  FileText,
  Clock,
  Mail,
  Plus,
  Send
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

export default function DashboardOverviewPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const userRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const startupRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'startups', user.uid);
  }, [firestore, user]);

  const { data: profile, isLoading: isProfileLoading } = useDoc(userRef);
  const { data: startup, isLoading: isStartupLoading } = useDoc(startupRef);

  if (isUserLoading || isProfileLoading || isStartupLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName = profile?.fullName || user?.email?.split('@')[0] || "Founder";
  const roleDisplay = profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Founder";
  const isFounder = profile?.role === 'founder';

  const getCompleteness = () => {
    if (!profile) return 0;
    const coreFields = ['headline', 'location', 'stage', 'skills', 'bio', 'whyBuilding', 'lookingFor', 'imageUrl'];
    let score = 0;
    
    const filledCore = coreFields.filter(f => profile[f] && (Array.isArray(profile[f]) ? profile[f].length > 0 : profile[f] !== ''));
    score += (filledCore.length / coreFields.length) * 70;
    
    if (profile.experience && profile.experience.length > 0 && profile.experience[0].company) score += 15;
    if (profile.socialLinks && (profile.socialLinks.linkedin || profile.socialLinks.website)) score += 15;
    
    return Math.min(Math.round(score), 100);
  };

  const completeness = getCompleteness();

  const copyToClipboard = (path: string, type: string) => {
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied!",
      description: `${type} link has been copied to your clipboard.`,
    });
  };

  const activities = [
    { id: 1, type: 'view', text: 'An investor from London viewed your startup', time: '2 hours ago', icon: Eye, color: 'text-blue-500' },
    { id: 2, type: 'interest', text: 'Jasmine Akter expressed interest in your venture', time: '5 hours ago', icon: Users, color: 'text-green-500' },
    { id: 3, type: 'message', text: 'New message from Marcus Thorne regarding pitch deck', time: 'Yesterday', icon: MessageSquare, color: 'text-purple-500' },
    { id: 4, type: 'view', text: 'Startup viewed 15 times in the last 24 hours', time: '1 day ago', icon: TrendingUp, color: 'text-primary' },
    { id: 5, type: 'milestone', text: 'Profile completeness reached 85%', time: '2 days ago', icon: CheckCircle2, color: 'text-orange-500' },
  ];

  const messages = [
    { id: 1, sender: 'Marcus Thorne', text: 'Hey! Can you send over the updated financial model?', time: '2h ago', avatar: 'https://picsum.photos/seed/m1/40/40' },
    { id: 2, sender: 'Jasmine Akter', text: 'I\'d love to chat more about your scale plan for next year.', time: '5h ago', avatar: 'https://picsum.photos/seed/m2/40/40' },
    { id: 3, sender: 'Elena Rodriguez', text: 'Thanks for the intro! Let\'s schedule a call for Tuesday.', time: '1d ago', avatar: 'https://picsum.photos/seed/m3/40/40' },
  ];

  const interestedInvestors = [
    { id: 'inv1', name: 'Jasmine Akter', firm: 'Delta VC', info: 'Early-stage Fintech focus', avatar: 'https://picsum.photos/seed/inv1/40/40' },
    { id: 'inv2', name: 'Marcus Thorne', firm: 'Angel Investor', info: 'Sustainability & AI advisor', avatar: 'https://picsum.photos/seed/inv2/40/40' },
    { id: 'inv3', name: 'Elena Rodriguez', firm: 'Impact Fund', info: 'Scaling social ventures', avatar: 'https://picsum.photos/seed/inv3/40/40' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Welcome, {displayName} {profile?.isVerified && <CheckCircle2 className="h-6 w-6 text-primary fill-primary/10" />}
          </h1>
          <p className="text-muted-foreground">
            {roleDisplay} • {user?.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/founders/${user?.uid}`} className="gap-2">
              <ExternalLink className="h-4 w-4" /> View Public Profile
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/profile">Edit Profile</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile Score</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completeness}%</div>
            <Progress value={completeness} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {completeness < 100 ? "Add experience and vision to attract investors." : "Your profile is investor-ready!"}
            </p>
            
            {completeness < 100 && (
              <div className="mt-4 pt-4 border-t border-dashed space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Suggestions</p>
                <div className="space-y-2">
                  {!profile?.bio && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Add professional bio
                    </Link>
                  )}
                  {!profile?.imageUrl && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Upload profile photo
                    </Link>
                  )}
                  {(!profile?.experience || profile.experience.length === 0) && (
                    <Link href="/dashboard/profile" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Add work experience
                    </Link>
                  )}
                  {isFounder && !startup?.pitchDeckUrl && (
                    <Link href="/dashboard/fundraising" className="flex items-center gap-2 text-[11px] text-primary hover:underline group">
                      <Plus className="h-3 w-3 group-hover:scale-110 transition-transform" /> Upload pitch deck
                    </Link>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Startup Listing</CardTitle>
            <Rocket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{startup ? startup.name : "Unlisted"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {startup 
                ? `${startup.industry} • ${startup.stage}` 
                : "Pitch your venture to the community."}
            </p>
            <div className="flex gap-2 mt-4">
              <Button size="sm" variant="ghost" asChild className="flex-1 border border-dashed border-primary/20 hover:bg-primary/5">
                <Link href="/dashboard/startup">
                  {startup ? "Update Venture" : "Create Startup Listing"}
                </Link>
              </Button>
              {startup && (
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(`/startups/${user?.uid}`, 'Startup')} title="Copy Startup Link">
                  <Share2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isFounder && (
          <Card className="border-primary/10 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fundraising</CardTitle>
              <HandCoins className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {startup?.fundraisingStatus || 'Inactive'}
              </div>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Goal: {startup?.fundingNeed || '$0'}
              </p>
              
              <div className="space-y-3">
                <div className="flex justify-between text-[10px] font-medium">
                  <span>Funding Progress</span>
                  <span>45%</span>
                </div>
                <Progress value={45} className="h-1.5" />
                
                <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-dashed border-primary/10 mt-2">
                  <div className="text-center border-r border-dashed border-primary/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Investors</p>
                    <p className="text-sm font-bold text-primary">12</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Interest</p>
                    <p className="text-sm font-bold text-primary">$22.5k</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" asChild className="flex-1">
                  <Link href="/dashboard/fundraising">
                    Edit Campaign
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" className="flex-1">
                  View Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Startup Views</CardTitle>
            <Eye className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">1,284</div>
            <p className="text-[10px] text-muted-foreground mt-1">+12% from last month</p>
          </CardContent>
        </Card>
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Investor Interests</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">12</div>
            <p className="text-[10px] text-muted-foreground mt-1">3 new this week</p>
          </CardContent>
        </Card>
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unread Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">5</div>
            <p className="text-[10px] text-muted-foreground mt-1">Check your inbox</p>
          </CardContent>
        </Card>
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Funding Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">45%</div>
            <Progress value={45} className="mt-2 h-1" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/10 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common tasks you might want to perform.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/dashboard/fundraising">
              <HandCoins className="h-4 w-4" /> Launch / Edit Fundraising
            </Link>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/dashboard/fundraising">
              <FileText className="h-4 w-4" /> Upload Pitch Deck
            </Link>
          </Button>
          <Button variant="outline" className="gap-2" asChild>
            <Link href="/dashboard/startup">
              <Rocket className="h-4 w-4" /> Edit Startup Profile
            </Link>
          </Button>
          <Button variant="outline" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Open Messages
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next Milestones</CardTitle>
            <CardDescription>Actions to strengthen your presence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!startup?.pitchDeckUrl && isFounder && (
              <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                  <HandCoins className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Upload Pitch Deck</p>
                  <p className="text-xs text-muted-foreground">Add your presentation to attract investors.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/fundraising">Add Deck</Link>
                </Button>
              </div>
            )}
            {!profile?.whyBuilding && (
              <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group">
                <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">Share your "Why"</p>
                  <p className="text-xs text-muted-foreground">Explain the passion behind your startup.</p>
                </div>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/dashboard/profile">Start</Link>
                </Button>
              </div>
            )}
            <div className="flex items-center gap-4 p-4 border rounded-xl hover:bg-muted/30 transition-all cursor-pointer group opacity-60">
              <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary/20">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Verified Founder Badge</p>
                <p className="text-xs text-muted-foreground">Submit documents for official verification.</p>
              </div>
              <Badge variant="secondary">Upcoming</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 shadow-sm">
          <CardHeader>
            <CardTitle>Investor Engagement</CardTitle>
            <CardDescription>Your appearance and interested leads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Public Preview</p>
              <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-2xl border border-dashed border-primary/10">
                <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-muted shadow-sm">
                  <Image src={profile?.imageUrl || `https://picsum.photos/seed/${user?.uid || 'user'}/128/128`} alt={displayName} fill className="object-cover" />
                </div>
                <div>
                  <p className="text-sm font-bold flex items-center gap-1">
                    {displayName} 
                    {profile?.isVerified && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  </p>
                  <Badge variant="secondary" className="text-[9px] h-4">{profile?.stage || "Early"} Stage</Badge>
                </div>
              </div>
            </div>

            <Separator className="bg-primary/5" />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Interested Investors</p>
                <Badge variant="outline" className="text-[9px] h-4 bg-primary/5">{interestedInvestors.length} Leads</Badge>
              </div>
              <div className="space-y-3">
                {interestedInvestors.map((investor) => (
                  <div key={investor.id} className="flex items-center gap-3 group">
                    <Avatar className="h-8 w-8 border border-primary/10">
                      <AvatarImage src={investor.avatar} alt={investor.name} />
                      <AvatarFallback>{investor.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold leading-none">{investor.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{investor.firm} • {investor.info}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" title="Send Message">
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link href={`/founders/${user?.uid}`}>View Full Public Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> Recent Activity
              </CardTitle>
              <CardDescription>Track interactions with your startup and profile.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs">View All</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 group cursor-default">
                  <div className={`mt-1 p-2 rounded-lg bg-muted/50 ${activity.color} group-hover:scale-110 transition-transform`}>
                    <activity.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">{activity.text}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/10 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" /> Messages Preview
              </CardTitle>
              <CardDescription>Latest correspondence from your network.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link href="/dashboard">View All Messages</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className="flex items-start gap-4 group cursor-pointer hover:bg-muted/30 p-2 rounded-lg transition-colors">
                  <Avatar className="h-10 w-10 border">
                    <AvatarImage src={message.avatar} alt={message.sender} />
                    <AvatarFallback>{message.sender.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold leading-none">{message.sender}</p>
                      <p className="text-[10px] text-muted-foreground">{message.time}</p>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{message.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

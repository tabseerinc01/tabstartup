'use client';

import { mockFounders } from '@/lib/mock-data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { User, Rocket, Target, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function DashboardOverviewPage() {
  const user = mockFounders[0]; // Ahmed Rafiq (demo)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
        <p className="text-muted-foreground">
          Founder (demo) • {user.headline}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile Completeness</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">60%</div>
            <Progress value={60} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Add your experience to reach 100%.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Startup Status</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Draft</div>
            <p className="text-xs text-muted-foreground mt-1">
              Startup profile not created yet.
            </p>
            <Button size="sm" variant="outline" asChild className="mt-4 w-full">
              <Link href="/dashboard/startup">Create Startup Listing</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Community Interaction</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0 Connections</div>
            <p className="text-xs text-muted-foreground mt-1">
              Start connecting with investors.
            </p>
            <Button size="sm" variant="link" asChild className="mt-4 px-0">
              <Link href="/investors">Explore Investors <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Actionable items to grow your startup presence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="bg-primary/10 p-2 rounded-full">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">Complete your bio</p>
                <p className="text-xs text-muted-foreground">Help mentors understand your background better.</p>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/dashboard/profile">Edit</Link>
              </Button>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="bg-primary/10 p-2 rounded-full">
                <Rocket className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">List your startup</p>
                <p className="text-xs text-muted-foreground">Make your venture discoverable by investors.</p>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/dashboard/startup">Create</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>My Current Profile</CardTitle>
            <CardDescription>How you appear to others.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-4">
              <div className="relative h-16 w-16 rounded-full overflow-hidden bg-muted">
                <Image src={user.imageUrl} alt={user.name} fill className="object-cover" />
              </div>
              <div>
                <p className="font-bold">{user.name}</p>
                <Badge variant="secondary">{user.stage} Stage</Badge>
              </div>
            </div>
            <p className="text-sm italic text-muted-foreground mb-4">
              &quot;{user.headline}&quot;
            </p>
            <div className="flex flex-wrap gap-1">
              {user.skills.map(s => <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

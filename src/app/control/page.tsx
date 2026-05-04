'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ShieldAlert, Users, Rocket, Wrench, Settings, Activity, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';

export default function ControlPanelPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuthorization() {
      if (isUserLoading) return;
      
      if (!user) {
        router.push('/login');
        return;
      }

      try {
        const snap = await getDoc(doc(firestore, 'users', user.uid));
        if (snap.exists()) {
          const role = snap.data().role;
          if (role === 'admin' || role === 'super_admin') {
            setIsAuthorized(true);
          } else {
            // Not authorized, send back to dashboard
            router.push('/dashboard');
          }
        } else {
          router.push('/dashboard');
        }
      } catch (error) {
        console.error("Authorization check failed:", error);
        router.push('/dashboard');
      }
    }

    checkAuthorization();
  }, [user, isUserLoading, firestore, router]);

  if (isUserLoading || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <DashboardSidebar />
      <div className="flex flex-col">
        <DashboardHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40">
          <div className="max-w-6xl mx-auto w-full space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-destructive/10 rounded-2xl">
                  <ShieldAlert className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Control Panel</h1>
                  <p className="text-muted-foreground">Admin-only system overview and platform management.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-4 py-2 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100 flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3" /> SESSION VERIFIED
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">User Base</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">...</div>
                  <p className="text-xs text-muted-foreground mt-1">Total registered accounts</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Startups</CardTitle>
                  <Rocket className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">...</div>
                  <p className="text-xs text-muted-foreground mt-1">Live listings in marketplace</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Marketplace</CardTitle>
                  <Wrench className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">...</div>
                  <p className="text-xs text-muted-foreground mt-1">Professional services active</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">System</CardTitle>
                  <Activity className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">Stable</div>
                  <p className="text-xs text-muted-foreground mt-1">API & database latency normal</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-none shadow-md overflow-hidden">
                  <CardHeader className="bg-muted/30">
                    <CardTitle>Management Tools</CardTitle>
                    <CardDescription>Direct access to administrative modules.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2 p-6">
                    <Button variant="outline" className="h-24 justify-start gap-4 px-6 rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Users className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">User Management</p>
                        <p className="text-xs text-muted-foreground">Ban, verify, or update roles.</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="h-24 justify-start gap-4 px-6 rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Rocket className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">Startup Reviews</p>
                        <p className="text-xs text-muted-foreground">Approve new venture listings.</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="h-24 justify-start gap-4 px-6 rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Wrench className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">Service Audit</p>
                        <p className="text-xs text-muted-foreground">Moderate marketplace offerings.</p>
                      </div>
                    </Button>
                    <Button variant="outline" className="h-24 justify-start gap-4 px-6 rounded-2xl hover:bg-primary/5 hover:border-primary/20 transition-all">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Settings className="h-6 w-6" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold">Platform Stats</p>
                        <p className="text-xs text-muted-foreground">Detailed usage and traffic logs.</p>
                      </div>
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="border-none shadow-sm bg-destructive/5">
                  <CardHeader>
                    <CardTitle className="text-sm text-destructive">Security Alerts</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-4">
                    <div className="flex gap-2">
                      <Activity className="h-4 w-4 shrink-0 opacity-50" />
                      <p>No abnormal login patterns detected in the last 24 hours.</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm">Admin Quick-Log</CardTitle>
                  </CardHeader>
                  <CardContent className="text-[10px] text-muted-foreground font-mono space-y-1">
                    <p>[2024-10-25 14:32] Admin session initiated.</p>
                    <p>[2024-10-25 14:30] Global rule set synchronized.</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

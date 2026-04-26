
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockFounders } from '@/lib/mock-data';
import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';
import { 
  Rocket, 
  Users, 
  Lightbulb, 
  Target, 
  Handshake, 
  Globe, 
  ArrowRight,
  TrendingUp,
  MapPin
} from 'lucide-react';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 flex flex-col gap-20 pb-20">
        <section className="relative overflow-hidden pt-20 md:pt-32">
          <div className="container mx-auto px-4 relative z-10 text-center">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
              Build and fund your startup with <span className="text-primary">TabStartup</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              A platform for founders, mentors, and investors. 
              Focused on empowering Bangladeshi founders to go global.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="px-8">
                <Link href="/signup?role=founder">Join as Founder</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="px-8">
                <Link href="/signup?role=investor">Join as Investor</Link>
              </Button>
            </div>
          </div>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-10">
            <div className="w-[800px] h-[800px] bg-primary rounded-full blur-3xl mx-auto -translate-y-1/2" />
          </div>
        </section>

        <section className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Users className="h-8 w-8 text-primary" />, title: "Create your profile", desc: "Build a professional founder profile and showcase your journey." },
              { icon: <Lightbulb className="h-8 w-8 text-primary" />, title: "List your startup", desc: "Pitch what you are building and share your vision with the world." },
              { icon: <Handshake className="h-8 w-8 text-primary" />, title: "Connect with mentors", desc: "Get guidance from experienced builders and industry experts." },
              { icon: <Target className="h-8 w-8 text-primary" />, title: "Access resources", desc: "Get funding, courses, and a supportive community of founders." },
            ].map((item, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="mb-4">{item.icon}</div>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-muted/30 py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-12">Who is TabStartup for?</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              <Card>
                <CardHeader className="text-center">
                  <Rocket className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <CardTitle>Founders</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  Showcase your startup, find mentors, and secure funding for your vision.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="text-center">
                  <Globe className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <CardTitle>Mentors</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  Share your experience and guide new founders through their challenges.
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 text-primary" />
                  <CardTitle>Investors</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  Discover high-potential early-stage startups and invest in the future.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold">Community Spotlight</h2>
              <p className="text-muted-foreground">Meet some of the talented founders building on TabStartup.</p>
            </div>
            <Button variant="outline" asChild className="hidden md:flex">
              <Link href="/founders">View all founders <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockFounders.slice(0, 3).map((founder) => (
              <Card key={founder.id} className="overflow-hidden hover:shadow-xl transition-all">
                <div className="relative h-48 w-full bg-muted">
                  <Image 
                    src={founder.imageUrl} 
                    alt={founder.name} 
                    fill 
                    className="object-cover" 
                    data-ai-hint="founder portrait"
                  />
                </div>
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <CardTitle className="text-xl">{founder.name}</CardTitle>
                    <Badge variant="secondary">{founder.stage}</Badge>
                  </div>
                  <p className="text-sm font-medium line-clamp-1">{founder.headline}</p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center text-xs text-muted-foreground mb-4">
                    <MapPin className="mr-1 h-3 w-3" />
                    {founder.location}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {founder.skills.slice(0, 3).map(skill => (
                      <Badge key={skill} variant="outline" className="text-[10px]">{skill}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex md:hidden">
            <Button variant="outline" className="w-full" asChild>
              <Link href="/founders">View all founders</Link>
            </Button>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="bg-primary text-primary-foreground rounded-3xl p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to grow your startup?</h2>
            <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
              Join the community today and start building something amazing.
            </p>
            <Button size="lg" variant="secondary" asChild className="px-10">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

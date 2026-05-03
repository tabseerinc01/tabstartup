'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { useUser } from '@/firebase';
import { 
  Menu, 
  Users,
  Briefcase,
  TrendingUp,
  Handshake
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function PublicHeader() {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: '/founders', label: 'Founders', icon: Users },
    { href: '/investors', label: 'Investors', icon: TrendingUp },
    { href: '/cofounders', label: 'Co-founders', icon: Handshake },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Button asChild variant="default" className="rounded-full px-6 h-10">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="rounded-full px-6 h-10 font-semibold">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild className="rounded-full px-6 h-10 font-semibold">
                  <Link href="/signup">Join Now</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Navigation */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-6 mt-12">
                <div className="px-2">
                   <Logo />
                </div>
                <nav className="flex flex-col gap-2">
                  {navLinks.map((link) => (
                    <Link 
                      key={link.href} 
                      href={link.href} 
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-4 text-lg font-bold p-4 hover:bg-muted rounded-2xl transition-all"
                    >
                      <link.icon className="h-5 w-5 text-primary" />
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="border-t pt-6 mt-4 flex flex-col gap-3 px-2">
                  {user ? (
                    <Button asChild className="w-full rounded-2xl h-12 text-base" onClick={() => setIsOpen(false)}>
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="outline" className="w-full rounded-2xl h-12 text-base font-bold" onClick={() => setIsOpen(false)}>
                        <Link href="/login">Log in</Link>
                      </Button>
                      <Button asChild className="w-full rounded-2xl h-12 text-base font-bold" onClick={() => setIsOpen(false)}>
                        <Link href="/signup">Sign up</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

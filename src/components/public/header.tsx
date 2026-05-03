'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { useUser } from '@/firebase';
import { Menu, X, Rocket, Users, Target, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function PublicHeader() {
  const { user } = useUser();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: '/founders', label: 'Founders', icon: Rocket },
    { href: '/investors', label: 'Investors', icon: Target },
    { href: '/cofounders', label: 'Co-founders', icon: Users },
    { href: '/mentors', label: 'Mentors', icon: GraduationCap },
  ];

  const isActive = (path: string) => pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 flex h-16 items-center justify-between">
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                isActive(link.href) ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Button asChild rounded-full px-6>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild rounded-full>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild rounded-full px-6>
                  <Link href="/signup">Join Now</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-8 py-8">
                <Logo />
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 text-lg font-medium transition-colors hover:text-primary ${
                        isActive(link.href) ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      <link.icon className="h-5 w-5" />
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="flex flex-col gap-3 pt-4 border-t">
                  {user ? (
                    <Button asChild className="w-full rounded-xl" onClick={() => setIsOpen(false)}>
                      <Link href="/dashboard">Go to Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild className="w-full rounded-xl" onClick={() => setIsOpen(false)}>
                        <Link href="/signup">Sign Up</Link>
                      </Button>
                      <Button variant="outline" asChild className="w-full rounded-xl" onClick={() => setIsOpen(false)}>
                        <Link href="/login">Log In</Link>
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

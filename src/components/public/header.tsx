'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth, initiateSignOut } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { 
  Menu, 
  X, 
  User as UserIcon, 
  LogOut, 
  LayoutDashboard,
  Users,
  Briefcase,
  Handshake,
  GraduationCap,
  Wrench
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export function PublicHeader() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: '/founders', label: 'Founders', icon: Users },
    { href: '/investors', label: 'Investors', icon: Briefcase },
    { href: '/cofounders', label: 'Co-founders', icon: Handshake },
    { href: '/mentors', label: 'Mentors', icon: GraduationCap },
    { href: '/services', label: 'Services', icon: Wrench },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          {!isUserLoading && (
            <>
              {user ? (
                <Button asChild className="rounded-full px-6">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" asChild className="font-bold text-slate-700">
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button asChild className="rounded-full px-8 shadow-lg shadow-primary/20">
                    <Link href="/signup">Join Community</Link>
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px] border-none">
              <div className="flex flex-col gap-8 mt-12 px-2">
                <Logo />
                <nav className="flex flex-col gap-4">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-4 text-lg font-bold text-slate-700 hover:text-primary p-3 rounded-2xl hover:bg-primary/5 transition-all"
                    >
                      <link.icon className="h-5 w-5 text-primary" />
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <div className="flex flex-col gap-3 pt-6 border-t">
                  {user ? (
                    <Button asChild className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => setIsOpen(false)}>
                      <Link href="/dashboard">Go to Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" asChild className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => setIsOpen(false)}>
                        <Link href="/login">Log in</Link>
                      </Button>
                      <Button asChild className="w-full h-14 rounded-2xl text-lg font-bold" onClick={() => setIsOpen(false)}>
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

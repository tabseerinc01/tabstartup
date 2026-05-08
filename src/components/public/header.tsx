'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { useUser } from '@/firebase';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function PublicHeader() {
  const { user } = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/founders', label: 'Founders' },
    { href: '/investors', label: 'Investors' },
    { href: '/community', label: 'Community' },
    { href: '/cofounders', label: 'Co-founders' },
    { href: '/mentors', label: 'Mentors' },
    { href: '/services', label: 'Services' },
  ];

  return (
    <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Logo />
        
        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              className="text-sm font-bold text-slate-600 hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3">
            {user ? (
              <Button asChild className="rounded-full px-6 shadow-lg shadow-primary/20">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="font-bold">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild className="rounded-full px-6 shadow-lg shadow-primary/20">
                  <Link href="/signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t bg-background animate-in slide-in-from-top-4 duration-300">
          <nav className="flex flex-col p-4 space-y-4">
            {navLinks.map((link) => (
              <Link 
                key={link.href} 
                href={link.href} 
                className="text-lg font-bold text-slate-700 px-4 py-2 hover:bg-muted rounded-xl transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4 border-t flex flex-col gap-3">
              {user ? (
                <Button asChild className="w-full rounded-xl h-12 text-lg">
                  <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="outline" asChild className="w-full rounded-xl h-12 text-lg border-primary/20 text-primary">
                    <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>Log in</Link>
                  </Button>
                  <Button asChild className="w-full rounded-xl h-12 text-lg shadow-lg shadow-primary/20">
                    <Link href="/signup" onClick={() => setIsMobileMenuOpen(false)}>Sign up</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

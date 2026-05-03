'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useUser } from '@/firebase';

export function PublicHeader() {
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/founders" className="text-sm font-medium hover:text-primary">
              Founders
            </Link>
            <Link href="/investors" className="text-sm font-medium hover:text-primary">
              Investors
            </Link>
            <Link href="/cofounders" className="text-sm font-medium hover:text-primary">
              Co-founders
            </Link>
            <Link href="/mentors" className="text-sm font-medium hover:text-primary">
              Mentors
            </Link>
            <Link href="/services" className="text-sm font-medium hover:text-primary">
              Services
            </Link>
            <Link href="/about" className="text-sm font-medium hover:text-primary">
              About
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <Button asChild className="rounded-full px-6">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild className="rounded-full px-6">
                <Link href="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

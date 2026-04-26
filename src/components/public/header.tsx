
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <Link href="/founders" className="transition-colors hover:text-primary">Founders</Link>
          <Link href="/investors" className="transition-colors hover:text-primary">Investors</Link>
          <Link href="/about" className="transition-colors hover:text-primary">About</Link>
          <Link href="/community" className="transition-colors hover:text-primary">Community</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="hidden sm:flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

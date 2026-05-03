'use client';

import { Logo } from '@/components/logo';
import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Logo className="mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs">
              Building the infrastructure for the next generation of global startups. 
              Connecting founders with capital, mentorship, and community.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-4">Platform</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/founders" className="text-muted-foreground hover:text-primary">Founders</Link></li>
              <li><Link href="/investors" className="text-muted-foreground hover:text-primary">Investors</Link></li>
              <li><Link href="/cofounders" className="text-muted-foreground hover:text-primary">Co-founders</Link></li>
              <li><Link href="/mentors" className="text-muted-foreground hover:text-primary">Mentors</Link></li>
              <li><Link href="/services" className="text-muted-foreground hover:text-primary">Services</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/about" className="text-muted-foreground hover:text-primary">About Us</Link></li>
              <li><Link href="/community" className="text-muted-foreground hover:text-primary">Community</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-primary">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-primary">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} TabStartup. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

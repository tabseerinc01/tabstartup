'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';

export function PublicFooter() {
  return (
    <footer className="bg-muted/30 border-t py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <Logo className="mb-4" />
            <p className="text-muted-foreground max-w-xs">
              Building the future of global entrepreneurship by connecting talent with opportunity and capital.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Directory</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/founders" className="hover:text-primary transition-colors">Founders</Link></li>
              <li><Link href="/investors" className="hover:text-primary transition-colors">Investors</Link></li>
              <li><Link href="/cofounders" className="hover:text-primary transition-colors">Co-founders</Link></li>
              <li><Link href="/mentors" className="hover:text-primary transition-colors">Mentors</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Platform</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/community" className="hover:text-primary transition-colors">Community</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
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

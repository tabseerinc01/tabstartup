'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-1 space-y-4">
            <Logo />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Empowering the next generation of global entrepreneurs. Build, connect, and scale your vision.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Directory</h4>
            <ul className="space-y-4 text-sm text-muted-foreground font-medium">
              <li><Link href="/founders" className="hover:text-primary transition-colors">Explore Founders</Link></li>
              <li><Link href="/investors" className="hover:text-primary transition-colors">Meet Investors</Link></li>
              <li><Link href="/cofounders" className="hover:text-primary transition-colors">Find Co-founders</Link></li>
              <li><Link href="/mentors" className="hover:text-primary transition-colors">Get Mentorship</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Platform</h4>
            <ul className="space-y-4 text-sm text-muted-foreground font-medium">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/community" className="hover:text-primary transition-colors">Community</Link></li>
              <li><Link href="/signup" className="hover:text-primary transition-colors">Join Ecosystem</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-sm uppercase tracking-widest mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-muted-foreground font-medium">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground font-medium">
          <p>© {currentYear} TabStartup. All rights reserved.</p>
          <div className="flex gap-6">
             <span>Built for builders</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

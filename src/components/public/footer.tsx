'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Github, Twitter, Linkedin, Mail } from 'lucide-react';

export function PublicFooter() {
  return (
    <footer className="bg-background border-t">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="space-y-6">
            <Logo />
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Empowering founders, connecting investors, and building the future of the startup ecosystem in emerging markets.
            </p>
            <div className="flex items-center gap-5 pt-2">
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors"><Twitter className="h-5 w-5" /></Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors"><Linkedin className="h-5 w-5" /></Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors"><Github className="h-5 w-5" /></Link>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-6">Ecosystem</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/founders" className="hover:text-primary transition-colors">Founders Directory</Link></li>
              <li><Link href="/investors" className="hover:text-primary transition-colors">Investors Network</Link></li>
              <li><Link href="/cofounders" className="hover:text-primary transition-colors">Co-founder Search</Link></li>
              <li><Link href="/community" className="hover:text-primary transition-colors">Community Forum</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-6">Platform</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">Our Vision</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Success Stories</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Resource Center</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Contact Support</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-6">Legal</h4>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link href="#" className="hover:text-primary transition-colors">Cookie Settings</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t mt-16 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} TabStartup. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="mailto:hello@tabstartup.com" className="flex items-center gap-2 hover:text-primary transition-colors">
              <Mail className="h-4 w-4" /> hello@tabstartup.com
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

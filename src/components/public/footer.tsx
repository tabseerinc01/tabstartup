'use client';

import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Github, Twitter, Linkedin, Mail } from 'lucide-react';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 text-slate-300 pt-20 pb-10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="space-y-6">
            <Logo className="brightness-0 invert" />
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              The premier platform for founders, investors, and mentors in emerging startup ecosystems. Build global from day one.
            </p>
            <div className="flex gap-4">
              <a href="#" className="p-2 bg-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all"><Twitter className="h-5 w-5" /></a>
              <a href="#" className="p-2 bg-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all"><Linkedin className="h-5 w-5" /></a>
              <a href="#" className="p-2 bg-slate-800 rounded-lg hover:bg-primary hover:text-white transition-all"><Github className="h-5 w-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Platform</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/founders" className="hover:text-primary transition-colors">Find Founders</Link></li>
              <li><Link href="/investors" className="hover:text-primary transition-colors">Meet Investors</Link></li>
              <li><Link href="/mentors" className="hover:text-primary transition-colors">Expert Mentors</Link></li>
              <li><Link href="/cofounders" className="hover:text-primary transition-colors">Co-founder Jobs</Link></li>
              <li><Link href="/services" className="hover:text-primary transition-colors">Founder Services</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Company</h4>
            <ul className="space-y-4 text-sm">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/community" className="hover:text-primary transition-colors">Community</Link></li>
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-6 uppercase text-xs tracking-widest">Contact</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /> support@tabstartup.com</li>
              <li className="text-slate-400">Dhaka, Bangladesh</li>
              <li className="text-slate-400">Singapore</li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-slate-800 text-center text-xs text-slate-500">
          <p>© {currentYear} TabStartup. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

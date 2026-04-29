'use client';

import Link from 'next/link';

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <h3 className="text-xl font-bold text-primary mb-4">TabStartup</h3>
            <p className="text-muted-foreground max-w-sm">
              Empowering Founders. Connecting Investors. Building the Future.
              The leading platform for emerging startups.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Platform</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/founders" className="text-sm text-muted-foreground hover:text-primary transition-colors">Founders</Link>
              <Link href="/investors" className="text-sm text-muted-foreground hover:text-primary transition-colors">Investors</Link>
              <Link href="/community" className="text-sm text-muted-foreground hover:text-primary transition-colors">Community</Link>
            </nav>
          </div>
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/about" className="text-sm text-muted-foreground hover:text-primary transition-colors">About</Link>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms</Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy</Link>
            </nav>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          © {currentYear} TabStartup – Your Startup Growth Partner.
        </div>
      </div>
    </footer>
  );
}

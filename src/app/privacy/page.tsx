
'use client';

import { PublicHeader } from '@/components/public/header';
import { PublicFooter } from '@/components/public/footer';

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-20">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-muted-foreground">
          Your privacy matters. TabStartup is committed to protecting your data. 
          Detailed information on how we collect and use your data will be provided here shortly.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

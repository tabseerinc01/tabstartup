import type { Metadata } from 'next';

import InvitationAcceptance from './invitation-acceptance';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Event Invitation | TabStartup',
  robots: {
    index: false,
    follow: false,
  },
  referrer: 'no-referrer',
};

export default function InvitationPage() {
  return <InvitationAcceptance />;
}

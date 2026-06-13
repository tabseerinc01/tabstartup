import { redirect } from 'next/navigation';

/**
 * DEPRECATED: This route is now consolidated into /startups/[slug].
 * We use this file as a simple redirect to the master dynamic route
 * while ensuring no dynamic parameter conflict at the directory level.
 */
export default async function LegacyRedirect() {
  // This file will only be hit if a direct URL exists for a folder named exactly '[uid]'
  // but in practice Next.js 15 requires dynamic segments to be unique.
  // We've moved all logic to [slug].
  redirect('/founders');
}

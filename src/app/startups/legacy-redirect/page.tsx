import { redirect } from 'next/navigation';

/**
 * DEPRECATED: This route is part of a migration to consolidate dynamic startup routing.
 * The logic is now handled exclusively by /startups/[slug].
 */
export default async function LegacyRedirectHandler() {
  redirect('/founders');
}

import { redirect } from 'next/navigation';

/**
 * OBSOLETE BACKUP: This folder is no longer used.
 * Public access is handled via /startups/[slug].
 */
export default async function ObsoleteSlugBackup() {
  redirect('/founders');
}

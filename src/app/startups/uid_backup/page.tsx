import { redirect } from 'next/navigation';

/**
 * OBSOLETE BACKUP: This folder is no longer used.
 * ID-based lookups are now handled as fallbacks within /startups/[slug].
 */
export default async function ObsoleteUidBackup() {
  redirect('/founders');
}

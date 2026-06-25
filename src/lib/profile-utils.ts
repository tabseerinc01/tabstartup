
/**
 * Utility functions for calculating profile strength and trust scores.
 */

export interface ProfileData {
  fullName?: string;
  imageUrl?: string;
  coverImageUrl?: string;
  headline?: string;
  investorHeadline?: string;
  bio?: string;
  investorBio?: string;
  location?: string;
  website?: string;
  linkedinUrl?: string;
  skills?: string[];
  investmentFocus?: string | string[];
  mentorBio?: string;
  referralCount?: number;
  roles?: string[];
  role?: string;
}

export interface ProfileChecklistItem {
  label: string;
  completed: boolean;
  weight: number;
}

export function getProfileChecklist(profile: ProfileData, startup?: any): ProfileChecklistItem[] {
  const roles = profile.roles || (profile.role ? [profile.role] : []);
  const isFounder = roles.includes('founder');
  const isInvestor = roles.includes('investor');
  
  const items: ProfileChecklistItem[] = [
    { label: 'Profile Photo', completed: !!profile.imageUrl, weight: 10 },
    { label: 'Display Name', completed: !!profile.fullName, weight: 10 },
    { label: 'Professional Headline', completed: !!(profile.headline || profile.investorHeadline), weight: 10 },
    { label: 'Bio/About', completed: !!(profile.bio || profile.investorBio), weight: 15 },
    { label: 'Location', completed: !!profile.location, weight: 10 },
    { label: 'Website', completed: !!profile.website, weight: 10 },
    { label: 'LinkedIn URL', completed: !!profile.linkedinUrl, weight: 10 },
    { label: 'Skills / Interests', completed: !!(profile.skills && profile.skills.length > 0), weight: 10 },
    { label: 'Cover Image', completed: !!profile.coverImageUrl, weight: 5 },
  ];

  // Specific 10% item based on role
  if (isFounder) {
    items.push({ label: 'Startup Profile', completed: !!startup, weight: 10 });
  } else if (isInvestor) {
    items.push({ label: 'Investment Focus', completed: !!(profile.investmentFocus && profile.investmentFocus.length > 0), weight: 10 });
  } else {
    items.push({ label: 'Mentor Details', completed: !!profile.mentorBio, weight: 10 });
  }

  return items;
}

export function calculateProfileStrength(profile: ProfileData, startup?: any): number {
  const checklist = getProfileChecklist(profile, startup);
  const strength = checklist.reduce((acc, item) => item.completed ? acc + item.weight : acc, 0);
  return Math.min(strength, 100);
}

export function calculateTrustScore(profile: ProfileData, startup?: any): number {
  const strength = calculateProfileStrength(profile, startup);
  
  // 50% from profile strength
  let trust = strength * 0.5;

  // Verification Badges (informational check)
  if (profile.linkedinUrl) trust += 10;
  if (profile.website) trust += 10;
  if (startup?.startupVerified) trust += 10;
  
  // Role verification (at least a bio exists)
  const roles = profile.roles || (profile.role ? [profile.role] : []);
  if (roles.includes('investor') && profile.investorBio) trust += 10;
  if (roles.includes('mentor') && profile.mentorBio) trust += 10;

  // Referral history bonus
  const referralBonus = Math.min((profile.referralCount || 0) * 2, 10);
  trust += referralBonus;

  return Math.round(Math.min(trust, 100));
}

export function getStrengthFeedback(strength: number): string {
  if (strength >= 100) return "Legendary profile! You are fully verified.";
  if (strength >= 80) return "Great profile! Complete a few more items to build maximum trust.";
  if (strength >= 50) return "Good progress. Adding professional links increases your visibility.";
  return "Let's build your identity. Complete your profile to connect with the ecosystem.";
}

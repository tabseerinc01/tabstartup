const SIGNUP_ROLES = ['founder', 'investor', 'mentor'] as const;

export type SignupRole = typeof SIGNUP_ROLES[number];

export interface ValidatedSignup {
  fullName: string;
  email: string;
  password: string;
  role: SignupRole;
  referralCode: string | null;
}

export function validateSignup(input: unknown): ValidatedSignup {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_SIGNUP_INPUT');
  }

  const data = input as Record<string, unknown>;

  const allowedFields = [
    'fullName',
    'email',
    'password',
    'role',
    'referralCode'
  ];

  if (Object.keys(data).some(key => !allowedFields.includes(key))) {
    throw new Error('INVALID_SIGNUP_FIELDS');
  }

  const fullName =
    typeof data.fullName === 'string' ? data.fullName.trim() : '';

  const email =
    typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';

  const password =
    typeof data.password === 'string' ? data.password : '';

  const role = data.role as SignupRole;

  if (!fullName || fullName.length > 120) {
    throw new Error('INVALID_FULL_NAME');
  }

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('INVALID_EMAIL');
  }

  if (password.length < 6 || password.length > 128) {
    throw new Error('INVALID_PASSWORD');
  }

  if (!SIGNUP_ROLES.includes(role)) {
    throw new Error('INVALID_SIGNUP_ROLE');
  }

  let referralCode: string | null = null;

  if (
    data.referralCode !== undefined &&
    data.referralCode !== null &&
    data.referralCode !== ''
  ) {
    if (typeof data.referralCode !== 'string') {
      throw new Error('INVALID_REFERRAL_CODE');
    }

    referralCode = data.referralCode.trim().toUpperCase();

    if (!/^TAB-[A-Z0-9]{10}$/.test(referralCode)) {
      throw new Error('INVALID_REFERRAL_CODE');
    }
  }

  return {
    fullName,
    email,
    password,
    role,
    referralCode
  };
}

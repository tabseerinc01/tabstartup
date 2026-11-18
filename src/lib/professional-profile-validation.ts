/**
 * TabStartup shared professional profile validation.
 *
 * Used by profile readiness and public projection.
 *
 * Pure validation helpers.
 * No Firebase dependencies.
 * No database reads or writes.
 *
 * Validation does not establish identity,
 * publication authorization or URL ownership.
 */

export const PROFESSIONAL_TEXT_MAX_LENGTH = 10000;

export const PROFESSIONAL_NAME_MAX_LENGTH = 120;

export const PROFESSIONAL_ARRAY_MAX_ITEMS = 100;

export const PROFESSIONAL_ARRAY_ITEM_MAX_LENGTH = 1000;

export const PROFESSIONAL_URL_MAX_LENGTH = 10000;

/**
 * Validate and normalize public text.
 *
 * Never coerce unknown values into strings.
 */
export function sanitizePublicText(
  value: unknown,
  maxLength = PROFESSIONAL_TEXT_MAX_LENGTH
): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length > maxLength
  ) {
    return undefined;
  }

  const cleaned = value.trim();

  return cleaned.length > 0
    ? cleaned
    : undefined;
}

/**
 * Read only an own array data item.
 *
 * Reject missing, inherited and accessor items.
 * Never invoke an array item getter.
 *
 * This helper does not protect against
 * arbitrary JavaScript Proxy traps.
 */
export function getOwnProfessionalArrayItem(
  value: unknown,
  index: number
): unknown {
  if (
    !Array.isArray(value) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= value.length
  ) {
    return undefined;
  }

  const descriptor =
    Object.getOwnPropertyDescriptor(
      value,
      index
    );

  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(
      descriptor,
      'value'
    )
  ) {
    return undefined;
  }

  return descriptor.value;
}

/**
 * Validate and normalize public string arrays.
 *
 * Reject malformed items and sparse arrays.
 * Preserve original order while removing duplicates.
 *
 * Empty arrays are permitted here.
 * Required-field readiness must separately
 * enforce at least one valid item.
 */
export function sanitizePublicStringArray(
  value: unknown
): string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length > PROFESSIONAL_ARRAY_MAX_ITEMS
  ) {
    return undefined;
  }

  const result: string[] = [];

  for (let index = 0; index < value.length; index++) {
    const cleaned = sanitizePublicText(
      getOwnProfessionalArrayItem(
        value,
        index
      ),
      PROFESSIONAL_ARRAY_ITEM_MAX_LENGTH
    );

    if (cleaned === undefined) {
      return undefined;
    }

    result.push(cleaned);
  }

  return [...new Set(result)];
}

/**
 * Validate and normalize public HTTPS URLs.
 *
 * Reject unsupported schemes, embedded control
 * characters, malformed URLs and credentials.
 *
 * Enforce length limits before and after
 * URL normalization.
 *
 * This does not verify URL ownership,
 * remote content or storage authorization.
 */
export function sanitizePublicUrl(
  value: unknown
): string | undefined {
  const cleaned = sanitizePublicText(
    value,
    PROFESSIONAL_URL_MAX_LENGTH
  );

  if (
    !cleaned ||
    !/^https:\/\//i.test(cleaned) ||
    /[\u0000-\u001F\u007F]/.test(cleaned)
  ) {
    return undefined;
  }

  try {
    const url = new URL(cleaned);

    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return undefined;
    }

    const normalized = url.href;

    if (
      normalized.length >
      PROFESSIONAL_URL_MAX_LENGTH
    ) {
      return undefined;
    }

    return normalized;
  } catch {
    return undefined;
  }
}

/**
 * Professional profile canonical UID validation.
 *
 * This validator applies only to professional
 * profile readiness and publication.
 *
 * It does not change global account identity,
 * authentication or event organizer access.
 */

export const PROFESSIONAL_UID_MAX_LENGTH = 128;

export function isValidProfessionalProfileUid(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PROFESSIONAL_UID_MAX_LENGTH &&
    value.trim() === value &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    !/^__[\s\S]*__$/.test(value) &&
    !/[\u0000-\u001F\u007F]/.test(value)
  );
}

/**
 * Accept ordinary records and null-prototype records.
 *
 * Reject arrays, dates and class instances.
 *
 * Object shape alone does not establish trust.
 */

export function isPlainProfessionalRecord(
  value: unknown
): value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

/**
 * Read only an own data property.
 *
 * Inherited properties and accessor properties
 * must not supply trusted authorization flags.
 *
 * Do not invoke getters.
 */

export function getOwnProfessionalValue(
  value: unknown,
  key: string
): unknown {
  if (!isPlainProfessionalRecord(value)) {
    return undefined;
  }

  const descriptor =
    Object.getOwnPropertyDescriptor(
      value,
      key
    );

  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(
      descriptor,
      'value'
    )
  ) {
    return undefined;
  }

  return descriptor.value;
}

/**
 * Only an explicit own boolean true is accepted.
 *
 * Missing, inherited, accessor and non-boolean
 * values cannot grant a positive claim.
 */

export function hasOwnProfessionalTrue(
  value: unknown,
  key: string
): boolean {
  return (
    getOwnProfessionalValue(
      value,
      key
    ) === true
  );
}

/**
 * Maximum number of canonical role entries
 * inspected by the professional profile boundary.
 *
 * Independent of global account authorization.
 */
export const PROFESSIONAL_ROLE_ARRAY_MAX_ITEMS = 100;

/**
 * Build a safe identity-only snapshot for the
 * existing legacy Startup profile resolver.
 *
 * Preserve genuinely missing legacy fields.
 * Reject accessor and inherited identity fields
 * instead of treating them as missing.
 *
 * Copy role arrays without invoking item getters,
 * custom iterators or source array methods.
 *
 * This is a professional profile data boundary,
 * not an authentication or authorization service.
 *
 * Arbitrary JavaScript Proxy traps are outside
 * the supported input contract.
 */
export function buildProfessionalIdentitySnapshot(
  value: unknown
): Record<string, unknown> | undefined {
  if (!isPlainProfessionalRecord(value)) {
    return undefined;
  }

  const snapshot: Record<string, unknown> =
    Object.create(null);

  for (const field of [
    'uid',
    'status',
    'roles',
    'role',
  ] as const) {
    const descriptor =
      Object.getOwnPropertyDescriptor(
        value,
        field
      );

    if (!descriptor) {
      if (field in value) {
        return undefined;
      }

      continue;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        descriptor,
        'value'
      )
    ) {
      return undefined;
    }

    const item: unknown = descriptor.value;

    if (
      field === 'roles' &&
      Array.isArray(item)
    ) {
      if (
        item.length >
        PROFESSIONAL_ROLE_ARRAY_MAX_ITEMS
      ) {
        return undefined;
      }

      const roles: unknown[] = [];

      for (
        let index = 0;
        index < item.length;
        index++
      ) {
        const roleDescriptor =
          Object.getOwnPropertyDescriptor(
            item,
            index
          );

        if (
          !roleDescriptor ||
          !Object.prototype.hasOwnProperty.call(
            roleDescriptor,
            'value'
          )
        ) {
          return undefined;
        }

        roles.push(
          getOwnProfessionalArrayItem(
            item,
            index
          )
        );
      }

      snapshot[field] = roles;
      continue;
    }

    snapshot[field] = item;
  }

  return snapshot;
}

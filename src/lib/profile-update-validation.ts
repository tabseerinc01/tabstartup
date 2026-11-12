import {
  PUBLIC_PROFILE_STRING_FIELDS,
  PUBLIC_PROFILE_ARRAY_FIELDS,
} from '@/lib/public-profile';

export function validateProfileUpdate(
  input: unknown
): Record<string, unknown> {
  const invalid = () => {
    throw new Error('INVALID_PROFILE_UPDATE');
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid();
  }

  const data = input as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  const stringFields = new Set<string>(PUBLIC_PROFILE_STRING_FIELDS);
  const arrayFields = new Set<string>(PUBLIC_PROFILE_ARRAY_FIELDS);

  const booleanFields = new Set([
    'isOpenToPitches',
    'lookingForCofounder',
  ]);

  function cleanString(value: unknown, max = 10000): string {
    if (typeof value !== 'string' || value.length > max) {
      return invalid();
    }
    return value;
  }

  function cleanObject(
    value: unknown,
    fields: string[],
    type: 'string' | 'boolean'
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return invalid();
    }

    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      if (!fields.includes(key)) return invalid();

      if (type === 'boolean') {
        if (typeof item !== 'boolean') return invalid();
        output[key] = item;
      } else {
        output[key] = cleanString(item);
      }
    }

    return output;
  }

  for (const [key, value] of Object.entries(data)) {
    if (stringFields.has(key)) {
      result[key] = cleanString(value);
    } else if (arrayFields.has(key)) {
      if (!Array.isArray(value) || value.length > 100) {
        return invalid();
      }

      result[key] = value.map(item => cleanString(item, 1000));
    } else if (booleanFields.has(key)) {
      if (typeof value !== 'boolean') return invalid();
      result[key] = value;
    } else if (key === 'socialLinks') {
      result[key] = cleanObject(
        value,
        ['linkedin', 'website', 'twitter'],
        'string'
      );
    } else if (key === 'availability') {
      result[key] = cleanObject(
        value,
        ['openToInvestment', 'hiring', 'coFounder'],
        'boolean'
      );
    } else if (key === 'experience') {
      if (!Array.isArray(value) || value.length > 50) {
        return invalid();
      }

      result[key] = value.map(item =>
        cleanObject(
          item,
          ['company', 'role', 'duration', 'description'],
          'string'
        )
      );
    } else {
      return invalid();
    }
  }

  if (Object.keys(result).length === 0) return invalid();

  return result;
}

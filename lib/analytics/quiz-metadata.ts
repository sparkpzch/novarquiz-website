export const AUDIENCE_OPTIONS = ['public', 'mixed', 'hcp'] as const;
export type IntendedAudience = (typeof AUDIENCE_OPTIONS)[number];

export type ConsentPurposes = {
  platform_account: boolean;
  marketing_follow_up: boolean;
};

export const DEFAULT_CONSENT_PURPOSES: ConsentPurposes = {
  platform_account: true,
  marketing_follow_up: false,
};

export type ChoiceMetadata = {
  behavior_meaning: string | null;
  clinical_tags: string[];
};

export const DEFAULT_CHOICE_METADATA: ChoiceMetadata = {
  behavior_meaning: null,
  clinical_tags: [],
};

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeChoiceMetadata(
  input: Partial<ChoiceMetadata> | Record<string, unknown> | null | undefined,
): ChoiceMetadata {
  const behaviorMeaning = typeof input?.behavior_meaning === 'string' ? input.behavior_meaning : null;
  return {
    behavior_meaning: behaviorMeaning?.trim() || null,
    clinical_tags: normalizeStringArray(input?.clinical_tags),
  };
}

export const HCP_VECTOR_KEYS = [
  'guideline_adherence',
  'innovation_adoption',
  'patient_centricity',
  'diagnostic_proactivity',
  'therapy_escalation',
  'evidence_depth',
] as const;

export type HcpVectorKey = (typeof HCP_VECTOR_KEYS)[number];
export type HcpVectorMap = Record<HcpVectorKey, number>;

export const AUDIENCE_OPTIONS = ['public', 'mixed', 'hcp'] as const;
export type IntendedAudience = (typeof AUDIENCE_OPTIONS)[number];

export const ALLOWED_USAGE_OPTIONS = [
  'anonymous',
  'tracked_profile',
] as const;
export type AllowedUsage = (typeof ALLOWED_USAGE_OPTIONS)[number];

export const REVIEW_STATUS_OPTIONS = [
  'draft',
  'reviewed',
  'approved',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUS_OPTIONS)[number];

export type ChoiceMetadata = {
  behavior_meaning: string | null;
  vector_deltas: HcpVectorMap;
  clinical_tags: string[];
  confidence_weight: number;
  allowed_usage: AllowedUsage;
  requires_hcp_version: boolean;
  review_status: ReviewStatus;
};

export type QuestionMetadata = {
  intended_audience: IntendedAudience;
  reading_level: string | null;
  jurisdiction_tags: string[];
  medical_review_version: string | null;
  legal_document_versions_required: Record<string, string>;
};

export type ConsentPurposes = {
  platform_account: boolean;
  analytics_profiling: boolean;
  marketing_follow_up: boolean;
  /** Explicitly acknowledged by HCP users before participating in HCP-audience sessions. */
  hcp_vectors_acknowledged?: boolean;
};

export const DEFAULT_CONSENT_PURPOSES: ConsentPurposes = {
  platform_account: true,
  analytics_profiling: true,
  marketing_follow_up: false,
  hcp_vectors_acknowledged: false,
};

/**
 * Human-readable labels for the 6 HCP clinical profiling vectors.
 * Referenced in consent text so users understand exactly what behavioral
 * dimensions are measured during HCP-audience quiz sessions.
 */
export const HCP_VECTOR_LABELS: Record<HcpVectorKey, string> = {
  guideline_adherence: 'Guideline Adherence',
  innovation_adoption: 'Innovation Adoption',
  patient_centricity: 'Patient Centricity',
  diagnostic_proactivity: 'Diagnostic Proactivity',
  therapy_escalation: 'Therapy Escalation',
  evidence_depth: 'Evidence Depth',
};

export function emptyHcpVectorMap(): HcpVectorMap {
  return {
    guideline_adherence: 0,
    innovation_adoption: 0,
    patient_centricity: 0,
    diagnostic_proactivity: 0,
    therapy_escalation: 0,
    evidence_depth: 0,
  };
}

export const DEFAULT_QUESTION_METADATA: QuestionMetadata = {
  intended_audience: 'public',
  reading_level: null,
  jurisdiction_tags: [],
  medical_review_version: null,
  legal_document_versions_required: {},
};

export const DEFAULT_CHOICE_METADATA: ChoiceMetadata = {
  behavior_meaning: null,
  vector_deltas: emptyHcpVectorMap(),
  clinical_tags: [],
  confidence_weight: 1,
  allowed_usage: 'anonymous',
  requires_hcp_version: false,
  review_status: 'approved',
};

export function clampConfidenceWeight(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(0, Number(value)));
}

export function normalizeVectorMap(
  value: Partial<Record<string, number>> | null | undefined,
): HcpVectorMap {
  const base = emptyHcpVectorMap();
  if (!value) return base;

  for (const key of HCP_VECTOR_KEYS) {
    const raw = value[key];
    base[key] = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  }

  return base;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeQuestionMetadata(
  input: Partial<QuestionMetadata> | Record<string, unknown> | null | undefined,
): QuestionMetadata {
  const readingLevel = typeof input?.reading_level === 'string' ? input.reading_level : null;
  const medicalReviewVersion =
    typeof input?.medical_review_version === 'string' ? input.medical_review_version : null;
  const legalDocumentVersions =
    input?.legal_document_versions_required &&
    typeof input.legal_document_versions_required === 'object'
      ? Object.fromEntries(
          Object.entries(input.legal_document_versions_required).filter(
            ([key, value]) => key.trim() && typeof value === 'string' && value.trim(),
          ),
        )
      : {};

  return {
    intended_audience: AUDIENCE_OPTIONS.includes(input?.intended_audience as IntendedAudience)
      ? (input?.intended_audience as IntendedAudience)
      : DEFAULT_QUESTION_METADATA.intended_audience,
    reading_level: readingLevel?.trim() || null,
    jurisdiction_tags: normalizeStringArray(input?.jurisdiction_tags),
    medical_review_version: medicalReviewVersion?.trim() || null,
    legal_document_versions_required: legalDocumentVersions,
  };
}

export function normalizeChoiceMetadata(
  input: Partial<ChoiceMetadata> | Record<string, unknown> | null | undefined,
): ChoiceMetadata {
  const behaviorMeaning = typeof input?.behavior_meaning === 'string' ? input.behavior_meaning : null;
  
  // Backward compatibility mapping for old database values
  let usage = input?.allowed_usage;
  if (usage === 'aggregate_only') usage = 'anonymous';
  if (usage === 'pseudonymous_profile' || usage === 'crm_eligible') usage = 'tracked_profile';

  return {
    behavior_meaning: behaviorMeaning?.trim() || null,
    vector_deltas: normalizeVectorMap(
      input?.vector_deltas && typeof input.vector_deltas === 'object'
        ? (input.vector_deltas as Partial<Record<string, number>>)
        : undefined,
    ),
    clinical_tags: normalizeStringArray(input?.clinical_tags),
    confidence_weight: clampConfidenceWeight(
      typeof input?.confidence_weight === 'number' ? input.confidence_weight : undefined,
    ),
    allowed_usage: ALLOWED_USAGE_OPTIONS.includes(usage as AllowedUsage)
      ? (usage as AllowedUsage)
      : DEFAULT_CHOICE_METADATA.allowed_usage,
    requires_hcp_version: Boolean(input?.requires_hcp_version),
    review_status: REVIEW_STATUS_OPTIONS.includes(input?.review_status as ReviewStatus)
      ? (input?.review_status as ReviewStatus)
      : DEFAULT_CHOICE_METADATA.review_status,
  };
}

export function accumulateVectors(
  vectors: Array<Partial<Record<string, number>> | null | undefined>,
): HcpVectorMap {
  const total = emptyHcpVectorMap();

  for (const vector of vectors) {
    const normalized = normalizeVectorMap(vector);
    for (const key of HCP_VECTOR_KEYS) {
      total[key] += normalized[key];
    }
  }

  return total;
}

export function normalizeProfileVectors(raw: HcpVectorMap): HcpVectorMap {
  const normalized = emptyHcpVectorMap();

  for (const key of HCP_VECTOR_KEYS) {
    normalized[key] = Math.max(-100, Math.min(100, Math.round(raw[key] * 10)));
  }

  return normalized;
}

export function classifyArchetype(vector: HcpVectorMap) {
  if (vector.guideline_adherence >= 20 && vector.innovation_adoption <= 0) {
    return 'conservative_guideline_follower';
  }
  if (vector.innovation_adoption >= 20 && vector.therapy_escalation >= 15) {
    return 'evidence_seeking_early_adopter';
  }
  if (vector.patient_centricity >= 20 && vector.diagnostic_proactivity < 10) {
    return 'qol_driven_prescriber';
  }
  if (vector.diagnostic_proactivity >= 20 && vector.evidence_depth >= 10) {
    return 'diagnostic_evidence_builder';
  }
  return 'balanced_clinician';
}

export function mostExpressiveVector(vector: HcpVectorMap) {
  return HCP_VECTOR_KEYS.reduce((best, key) => {
    if (Math.abs(vector[key]) > Math.abs(vector[best])) return key;
    return best;
  }, HCP_VECTOR_KEYS[0]);
}

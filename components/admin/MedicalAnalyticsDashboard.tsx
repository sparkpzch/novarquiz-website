'use client';

import React, { useState, useMemo } from 'react';
import ProfileAvatar from '@/components/ui/ProfileAvatar';
import type { Session, LeaderboardEntry } from '@/lib/types';
import type { HcpVectorMap } from '@/lib/analytics/hcp';

// ==========================================
// TYPES & DATA CONTRACTS
// ==========================================

export type MedicalTag =
  | '#LDL-Targets'
  | '#HeartDisease-Symptoms'
  | '#SGLT2i-Dosage'
  | '#Nutrition-Guidelines';

export type UnderstandingLevel = 'low' | 'moderate' | 'high';

export interface DistractorItem {
  key: string;
  text: string;
  percentage: number;
  isCorrect: boolean;
  clinicalNote?: string;
}

export interface QuestionDataNode {
  id: string;
  nodeCode: string;
  nodeType: 'DECISION_NODE' | 'CLINICAL_BRANCH' | 'DIAGNOSTIC_ROOT';
  branchLabel: string;
  tag: MedicalTag;
  understandingLevel: UnderstandingLevel;
  questionText: string;
  clinicalScenario: string;
  avgTimeSeconds: number;
  targetTimeSeconds: number;
  errorRatePercent: number;
  understandingScore: number;
  sampleSize: number;
  primaryDistractorKey: string;
  primaryDistractorSummary: string;
  distractors: DistractorItem[];
  pedagogicalAction: string;
  userResponses: Record<string, { selectedOption: string; isCorrect: boolean; timeSeconds: number }>;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  specialty: string;
  archetypeId: string;
  archetypeTitle: string;
  score: number;
  accuracy: number;
  totalTimeSeconds: number;
  rank: number;
  gapTags: MedicalTag[];
  headline: string;
  photoUrl?: string;
  status: 'online' | 'active' | 'idle';
}

export interface MatrixCellSummary {
  tag: MedicalTag;
  level: UnderstandingLevel;
  count: number;
  avgScore: number;
  totalResponses: number;
  highFrictionCount: number;
  userAnsweredCount?: number;
  userAccuracy?: number;
}

export interface MedicalAnalyticsDashboardProps {
  session?: Session & {
    quiz_name: string;
    quiz_description: string;
    intended_audience?: string;
    presentation_mode?: string;
  };
  leaderboard?: (LeaderboardEntry & { profile_photo?: string })[];
  questions?: Array<{
    id: string;
    question_text: string;
    node_type: string;
    total_responses: number;
    avg_time_ms: number;
    node_friction_score: number;
  }>;
  insights?: {
    audience_mode_summary: Record<string, number>;
    archetype_distribution: Array<{ archetype_id: string; count: number }>;
    vector_summary: HcpVectorMap;
    dominant_vector: string;
    highest_friction_nodes: Array<{
      question_id: string;
      question_text: string;
      node_friction_score: number;
    }>;
  };
  insightBreakdown?: Array<{
    user_id: string;
    user_display_name: string | null;
    answered: number;
    missed: number;
    gap_tags: string[];
    archetype_id: string | null;
    headline: string | null;
    suggestion: string | null;
  }>;
  peerSessions?: PeerSessionOption[];
  onBack?: () => void;
}

export interface PeerSessionOption {
  id: string;
  name: string;
  pin_code?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  participant_count?: number;
  avg_score?: number;
  avg_accuracy?: number;
  avg_time_seconds?: number;
  dominant_archetype?: string;
  cohort_label?: string;
  tag_scores?: Record<MedicalTag, number>;
  node_error_rates?: Record<string, number>;
  node_avg_times?: Record<string, number>;
}

export const DEFAULT_PEER_SESSIONS: PeerSessionOption[] = [
  {
    id: 'ses-novar-7839',
    name: 'Pre-Consensus Baseline Cohort (Hospital North)',
    pin_code: '884192',
    status: 'completed',
    started_at: '2026-03-12T09:00:00Z',
    ended_at: '2026-03-12T10:30:00Z',
    participant_count: 24,
    avg_score: 540,
    avg_accuracy: 54.2,
    avg_time_seconds: 74,
    dominant_archetype: 'Conservative Guideline Follower',
    cohort_label: 'Baseline (Pre-Training)',
    tag_scores: {
      '#SGLT2i-Dosage': 41,
      '#LDL-Targets': 58,
      '#HeartDisease-Symptoms': 50,
      '#Nutrition-Guidelines': 67,
    },
    node_error_rates: {
      'q-sglt2-01': 58,
      'q-sglt2-02': 67,
      'q-sglt2-03': 50,
      'q-ldl-01': 46,
      'q-ldl-02': 38,
      'q-ldl-03': 42,
      'q-hf-01': 54,
      'q-hf-02': 46,
      'q-hf-03': 50,
      'q-nutr-01': 38,
      'q-nutr-02': 29,
      'q-nutr-03': 33,
    },
    node_avg_times: {
      'q-sglt2-01': 68,
      'q-sglt2-02': 75,
      'q-sglt2-03': 64,
      'q-ldl-01': 58,
      'q-ldl-02': 60,
      'q-ldl-03': 55,
      'q-hf-01': 70,
      'q-hf-02': 66,
      'q-hf-03': 62,
      'q-nutr-01': 50,
      'q-nutr-02': 48,
      'q-nutr-03': 45,
    },
  },
  {
    id: 'ses-novar-7840',
    name: 'Bangkok Regional Nephrology Summit Cohort',
    pin_code: '901248',
    status: 'completed',
    started_at: '2026-03-18T13:30:00Z',
    ended_at: '2026-03-18T15:00:00Z',
    participant_count: 30,
    avg_score: 740,
    avg_accuracy: 72.5,
    avg_time_seconds: 52,
    dominant_archetype: 'Evidence-Seeking Early Adopter',
    cohort_label: 'Regional Peer Cohort',
    tag_scores: {
      '#SGLT2i-Dosage': 78,
      '#LDL-Targets': 70,
      '#HeartDisease-Symptoms': 68,
      '#Nutrition-Guidelines': 74,
    },
    node_error_rates: {
      'q-sglt2-01': 27,
      'q-sglt2-02': 23,
      'q-sglt2-03': 17,
      'q-ldl-01': 30,
      'q-ldl-02': 33,
      'q-ldl-03': 27,
      'q-hf-01': 33,
      'q-hf-02': 30,
      'q-hf-03': 37,
      'q-nutr-01': 23,
      'q-nutr-02': 27,
      'q-nutr-03': 30,
    },
    node_avg_times: {
      'q-sglt2-01': 48,
      'q-sglt2-02': 51,
      'q-sglt2-03': 44,
      'q-ldl-01': 42,
      'q-ldl-02': 45,
      'q-ldl-03': 40,
      'q-hf-01': 46,
      'q-hf-02': 49,
      'q-hf-03': 43,
      'q-nutr-01': 38,
      'q-nutr-02': 35,
      'q-nutr-03': 36,
    },
  },
  {
    id: 'ses-novar-7842',
    name: 'Post-Consensus 24h Guideline Retention Check',
    pin_code: '412093',
    status: 'completed',
    started_at: '2026-03-23T10:00:00Z',
    ended_at: '2026-03-23T11:15:00Z',
    participant_count: 26,
    avg_score: 820,
    avg_accuracy: 81.3,
    avg_time_seconds: 43,
    dominant_archetype: 'Balanced Clinician',
    cohort_label: 'Post-Consensus Re-Test',
    tag_scores: {
      '#SGLT2i-Dosage': 85,
      '#LDL-Targets': 79,
      '#HeartDisease-Symptoms': 80,
      '#Nutrition-Guidelines': 82,
    },
    node_error_rates: {
      'q-sglt2-01': 15,
      'q-sglt2-02': 19,
      'q-sglt2-03': 12,
      'q-ldl-01': 23,
      'q-ldl-02': 19,
      'q-ldl-03': 23,
      'q-hf-01': 19,
      'q-hf-02': 23,
      'q-hf-03': 19,
      'q-nutr-01': 19,
      'q-nutr-02': 15,
      'q-nutr-03': 19,
    },
    node_avg_times: {
      'q-sglt2-01': 40,
      'q-sglt2-02': 42,
      'q-sglt2-03': 38,
      'q-ldl-01': 36,
      'q-ldl-02': 39,
      'q-ldl-03': 35,
      'q-hf-01': 41,
      'q-hf-02': 40,
      'q-hf-03': 37,
      'q-nutr-01': 32,
      'q-nutr-02': 30,
      'q-nutr-03': 31,
    },
  },
];

export const BENCHMARK_PLAYERS_DATABASE: PlayerProfile[] = [
  {
    id: 'usr-bm-1',
    displayName: 'Dr. Arthur Campbell',
    specialty: 'Senior Cardiologist',
    archetypeId: 'conservative_guideline_follower',
    archetypeTitle: 'Conservative Guideline Follower',
    score: 510,
    accuracy: 45.8,
    totalTimeSeconds: 78,
    rank: 1,
    gapTags: ['#SGLT2i-Dosage', '#LDL-Targets'],
    headline: 'Cautious titration approach with early SGLT2i initiation.',
    status: 'active',
  },
  {
    id: 'usr-bm-2',
    displayName: 'Dr. Rebecca Zhao',
    specialty: 'Endocrinologist',
    archetypeId: 'diagnostic_evidence_builder',
    archetypeTitle: 'Diagnostic Evidence Builder',
    score: 620,
    accuracy: 62.5,
    totalTimeSeconds: 65,
    rank: 2,
    gapTags: ['#HeartDisease-Symptoms'],
    headline: 'Strong glycaemic metrics, conservative on sub-clinical HF symptoms.',
    status: 'active',
  },
  {
    id: 'usr-bm-3',
    displayName: 'Dr. Tariq Al-Mansoor',
    specialty: 'Internal Medicine',
    archetypeId: 'qol_driven_prescriber',
    archetypeTitle: 'QoL-Driven Prescriber',
    score: 480,
    accuracy: 41.7,
    totalTimeSeconds: 82,
    rank: 3,
    gapTags: ['#SGLT2i-Dosage', '#Nutrition-Guidelines'],
    headline: 'Focuses heavily on lifestyle tolerability over protocol escalation.',
    status: 'active',
  },
  {
    id: 'usr-bm-4',
    displayName: 'Dr. Elena Rostova',
    specialty: 'Nephrology Fellow',
    archetypeId: 'balanced_clinician',
    archetypeTitle: 'Balanced Clinician',
    score: 720,
    accuracy: 75.0,
    totalTimeSeconds: 58,
    rank: 4,
    gapTags: [],
    headline: 'High adherence to KDIGO guideline thresholds.',
    status: 'active',
  },
];

// ==========================================
// CLINICAL TAXONOMY & TIERS
// ==========================================

export const CLINICAL_TAGS: MedicalTag[] = [
  '#LDL-Targets',
  '#HeartDisease-Symptoms',
  '#SGLT2i-Dosage',
  '#Nutrition-Guidelines',
];

export const UNDERSTANDING_TIERS: {
  id: UnderstandingLevel;
  label: string;
  range: string;
  thresholdDesc: string;
  accentColor: string;
  headerBg: string;
  badgeStyle: string;
}[] = [
    {
      id: 'low',
      label: 'Low Understanding',
      range: '< 50%',
      thresholdDesc: 'Critical Knowledge Gap',
      accentColor: '#E11D48',
      headerBg: 'from-rose-500/10 via-rose-500/5 to-transparent border-rose-200 text-rose-900',
      badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    {
      id: 'moderate',
      label: 'Moderate Understanding',
      range: '50% - 75%',
      thresholdDesc: 'Borderline Adherence',
      accentColor: '#D97706',
      headerBg: 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-200 text-amber-900',
      badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    {
      id: 'high',
      label: 'High Understanding',
      range: '> 75%',
      thresholdDesc: 'Target Guideline Mastery',
      accentColor: '#0284C7',
      headerBg: 'from-sky-500/10 via-sky-500/5 to-transparent border-sky-200 text-sky-900',
      badgeStyle: 'bg-sky-50 text-sky-800 border-sky-200',
    },
  ];

// ==========================================
// CLINICAL PLAYERS DATASET
// ==========================================

export const PLAYERS_DATABASE: PlayerProfile[] = [
  {
    id: 'usr-vance',
    displayName: 'Dr. Emily Vance',
    specialty: 'Cardio-Metabolic Specialist',
    archetypeId: 'qol_driven_prescriber',
    archetypeTitle: 'QoL-Driven Prescriber',
    score: 540,
    accuracy: 50.0,
    totalTimeSeconds: 68,
    rank: 18,
    gapTags: ['#SGLT2i-Dosage', '#Nutrition-Guidelines'],
    headline: 'Prioritizes patient comfort; shows conservative hesitancy with renal thresholds.',
    status: 'online',
  },
  {
    id: 'usr-lin',
    displayName: 'Dr. Sarah Lin',
    specialty: 'Interventional Cardiologist',
    archetypeId: 'balanced_clinician',
    archetypeTitle: 'Balanced Clinician',
    score: 910,
    accuracy: 91.7,
    totalTimeSeconds: 49,
    rank: 1,
    gapTags: [],
    headline: 'High adherence across all clinical guidelines and ESC thresholds.',
    status: 'online',
  },
  {
    id: 'usr-thorne',
    displayName: 'Dr. Marcus Thorne',
    specialty: 'Heart Failure Fellow',
    archetypeId: 'evidence_seeking_early_adopter',
    archetypeTitle: 'Evidence-Seeking Early Adopter',
    score: 840,
    accuracy: 83.3,
    totalTimeSeconds: 54,
    rank: 2,
    gapTags: ['#LDL-Targets'],
    headline: 'Rapid adoption of novel pharmacotherapy; minor gap in extreme-risk lipid goals.',
    status: 'online',
  },
  {
    id: 'usr-patel',
    displayName: 'Dr. Amara Patel',
    specialty: 'Primary Care Lead',
    archetypeId: 'conservative_guideline_follower',
    archetypeTitle: 'Conservative Guideline Follower',
    score: 480,
    accuracy: 41.7,
    totalTimeSeconds: 84,
    rank: 24,
    gapTags: ['#SGLT2i-Dosage', '#HeartDisease-Symptoms', '#Nutrition-Guidelines'],
    headline: 'Relies on older therapeutic algorithms; hesitation with eGFR initiation.',
    status: 'active',
  },
  {
    id: 'usr-wilson',
    displayName: 'Dr. James Wilson',
    specialty: 'General Internist',
    archetypeId: 'diagnostic_evidence_builder',
    archetypeTitle: 'Diagnostic Evidence Builder',
    score: 760,
    accuracy: 75.0,
    totalTimeSeconds: 62,
    rank: 7,
    gapTags: ['#HeartDisease-Symptoms'],
    headline: 'Methodical diagnostic approach; slightly slower velocity on subtle HF signs.',
    status: 'active',
  },
  {
    id: 'usr-alvarez',
    displayName: 'Dr. Carlos Alvarez',
    specialty: 'Preventive Cardiology Fellow',
    archetypeId: 'balanced_clinician',
    archetypeTitle: 'Balanced Clinician',
    score: 880,
    accuracy: 88.0,
    totalTimeSeconds: 51,
    rank: 3,
    gapTags: [],
    headline: 'Strong mastery of lipid and dietary risk stratification.',
    status: 'online',
  },
  {
    id: 'usr-dubois',
    displayName: 'Dr. Helene Dubois',
    specialty: 'Nephrology Attending',
    archetypeId: 'evidence_seeking_early_adopter',
    archetypeTitle: 'Evidence-Seeking Early Adopter',
    score: 810,
    accuracy: 80.0,
    totalTimeSeconds: 58,
    rank: 5,
    gapTags: ['#Nutrition-Guidelines'],
    headline: 'Expert renal dosing familiarity; conservative on sodium restriction.',
    status: 'online',
  },
  {
    id: 'usr-chen',
    displayName: 'Dr. Kenneth Chen',
    specialty: 'Hospitalist Medicine',
    archetypeId: 'qol_driven_prescriber',
    archetypeTitle: 'QoL-Driven Prescriber',
    score: 620,
    accuracy: 62.5,
    totalTimeSeconds: 71,
    rank: 14,
    gapTags: ['#SGLT2i-Dosage'],
    headline: 'In-hospital initiation delays noted due to fear of pre-discharge hypotension.',
    status: 'idle',
  },
  {
    id: 'usr-somchai',
    displayName: 'Dr. Somchai Prasert',
    specialty: 'Cardiovascular Physician',
    archetypeId: 'balanced_clinician',
    archetypeTitle: 'Balanced Clinician',
    score: 790,
    accuracy: 78.0,
    totalTimeSeconds: 59,
    rank: 6,
    gapTags: ['#LDL-Targets'],
    headline: 'Consistently high accuracy; occasional ambiguity on non-statin escalation.',
    status: 'online',
  },
  {
    id: 'usr-mori',
    displayName: 'Dr. Kenji Mori',
    specialty: 'Acute Coronary Specialist',
    archetypeId: 'evidence_seeking_early_adopter',
    archetypeTitle: 'Evidence-Seeking Early Adopter',
    score: 830,
    accuracy: 83.3,
    totalTimeSeconds: 53,
    rank: 4,
    gapTags: [],
    headline: 'Strong adherence to dual-pathway inhibition and early invasive metrics.',
    status: 'online',
  },
];

// ==========================================
// QUESTION CLINICAL DATABASE
// ==========================================

export const QUESTION_DATABASE: QuestionDataNode[] = [
  // -------------------------------------------------------------
  // #SGLT2i-Dosage
  // -------------------------------------------------------------
  {
    id: 'q-sglt2-01',
    nodeCode: 'NODE-CKD-04',
    nodeType: 'DECISION_NODE',
    branchLabel: 'Branch α · eGFR Fork 25-30',
    tag: '#SGLT2i-Dosage',
    understandingLevel: 'low',
    questionText: 'In patients with T2D, established CVD, and eGFR 25–29 mL/min/1.73m², what is the recommended SGLT2i protocol?',
    clinicalScenario: 'ESC/KDIGO 2024 Consensus Update for Cardiorenal Protection',
    avgTimeSeconds: 11.4,
    targetTimeSeconds: 12.0,
    errorRatePercent: 63.0,
    understandingScore: 37.0,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 48.1% (Obsolete contraindication trap)',
    distractors: [
      {
        key: 'A',
        text: 'Initiate or continue standard dose (Dapagliflozin 10mg / Empagliflozin 10mg) without down-titration',
        percentage: 37.0,
        isCorrect: true,
      },
      {
        key: 'B',
        text: 'Withhold until renal re-evaluation or eGFR stabilizes > 30 mL/min/1.73m²',
        percentage: 48.1,
        isCorrect: false,
        clinicalNote: 'Common cognitive trap: Outdated 2020 eGFR <30 threshold before EMPA-KIDNEY & DAPA-CKD guideline updates.',
      },
      {
        key: 'C',
        text: 'Halve the dose to 5mg alternate days to reduce osmotic diuresis risk',
        percentage: 11.1,
        isCorrect: false,
        clinicalNote: 'No evidentiary basis for alternate-day titration in pivotal trials.',
      },
      {
        key: 'D',
        text: 'Switch immediately to GLP-1 RA monotherapy',
        percentage: 3.8,
        isCorrect: false,
      },
    ],
    pedagogicalAction: 'Clarify KDIGO 2024 guideline: SGLT2i initiated down to eGFR 20, continued until dialysis.',
    userResponses: {
      'usr-vance': { selectedOption: 'B', isCorrect: false, timeSeconds: 12.2 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.8 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 8.1 },
      'usr-patel': { selectedOption: 'B', isCorrect: false, timeSeconds: 14.5 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 9.4 },
      'usr-chen': { selectedOption: 'B', isCorrect: false, timeSeconds: 11.8 },
      'usr-dubois': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.9 },
    },
  },
  {
    id: 'q-sglt2-02',
    nodeCode: 'NODE-HF-08',
    nodeType: 'CLINICAL_BRANCH',
    branchLabel: 'Branch β · Acute HFrEF Decompensation',
    tag: '#SGLT2i-Dosage',
    understandingLevel: 'low',
    questionText: 'During hospital discharge after acute heart failure stabilization, when should SGLT2i therapy be introduced?',
    clinicalScenario: 'In-hospital initiation protocol vs outpatient deferral',
    avgTimeSeconds: 9.8,
    targetTimeSeconds: 10.0,
    errorRatePercent: 55.6,
    understandingScore: 44.4,
    sampleSize: 27,
    primaryDistractorKey: 'Option C',
    primaryDistractorSummary: 'Option C selected by 40.7% (Fear of pre-discharge hypotension)',
    distractors: [
      {
        key: 'A',
        text: 'Prior to hospital discharge once euvolemic and hemodynamically stable',
        percentage: 44.4,
        isCorrect: true,
      },
      {
        key: 'B',
        text: 'At first outpatient follow-up 4 weeks post-discharge',
        percentage: 14.9,
        isCorrect: false,
      },
      {
        key: 'C',
        text: 'Only after optimizing ACEi/ARNI and beta-blocker to target doses',
        percentage: 40.7,
        isCorrect: false,
        clinicalNote: 'Sequential titration delay increases 30-day readmission by 22%. Rapid 4-pillar initiation is mandatory.',
      },
    ],
    pedagogicalAction: 'Highlight Strong-HF & EMPULSE evidence: In-hospital initiation prevents therapeutic inertia.',
    userResponses: {
      'usr-vance': { selectedOption: 'C', isCorrect: false, timeSeconds: 10.6 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.2 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.4 },
      'usr-patel': { selectedOption: 'C', isCorrect: false, timeSeconds: 12.8 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 8.8 },
      'usr-chen': { selectedOption: 'C', isCorrect: false, timeSeconds: 10.4 },
      'usr-dubois': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.5 },
    },
  },
  {
    id: 'q-sglt2-03',
    nodeCode: 'NODE-SGLT-MOD-01',
    nodeType: 'CLINICAL_BRANCH',
    branchLabel: 'Branch θ · SGLT2i Titration Protocol',
    tag: '#SGLT2i-Dosage',
    understandingLevel: 'moderate',
    questionText: 'What is the required dose escalation step for Empagliflozin from 10mg to 25mg in chronic heart failure?',
    clinicalScenario: 'Guideline-directed medical therapy dosing',
    avgTimeSeconds: 8.5,
    targetTimeSeconds: 10.0,
    errorRatePercent: 37.0,
    understandingScore: 63.0,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 29.6%',
    distractors: [
      { key: 'A', text: '10mg once daily is already the target cardioprotective dose; no escalation required for HF benefit', percentage: 63.0, isCorrect: true },
      { key: 'B', text: 'Mandatory uptitration to 25mg after 4 weeks if tolerated', percentage: 29.6, isCorrect: false },
      { key: 'C', text: 'Uptitrate only if HbA1c remains > 8.0%', percentage: 7.4, isCorrect: false },
    ],
    pedagogicalAction: 'Clarify that 10mg delivers full cardiorenal endpoint efficacy in EMPEROR/DAPA-HF.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.8 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.6 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.8 },
      'usr-patel': { selectedOption: 'B', isCorrect: false, timeSeconds: 10.1 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.3 },
    },
  },
  {
    id: 'q-sglt2-04',
    nodeCode: 'NODE-SGLT-HIGH-01',
    nodeType: 'DIAGNOSTIC_ROOT',
    branchLabel: 'Branch ι · Sick-Day Management Rule',
    tag: '#SGLT2i-Dosage',
    understandingLevel: 'high',
    questionText: 'Under what clinical condition should SGLT2i be temporarily withheld (SADMANS rule)?',
    clinicalScenario: 'Euglycemic DKA prevention protocol',
    avgTimeSeconds: 5.9,
    targetTimeSeconds: 9.0,
    errorRatePercent: 14.8,
    understandingScore: 85.2,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 11.1%',
    distractors: [
      { key: 'A', text: 'Severe acute illness, prolonged fasting, major surgery, or acute dehydration', percentage: 85.2, isCorrect: true },
      { key: 'B', text: 'Mild upper respiratory tract infection without fever', percentage: 11.1, isCorrect: false },
      { key: 'C', text: 'Transient asymptomatic glucosuria', percentage: 3.7, isCorrect: false },
    ],
    pedagogicalAction: 'Solid mastery of SADMANS perioperative safety principles.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.4 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 4.2 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 4.8 },
      'usr-patel': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.9 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.1 },
    },
  },

  // -------------------------------------------------------------
  // #LDL-Targets
  // -------------------------------------------------------------
  {
    id: 'q-ldl-01',
    nodeCode: 'NODE-LIPID-01',
    nodeType: 'DECISION_NODE',
    branchLabel: 'Branch γ · Very High CV Risk',
    tag: '#LDL-Targets',
    understandingLevel: 'low',
    questionText: 'For a post-ACS patient with recurrent ischemic events within 2 years, what is the absolute target LDL-C?',
    clinicalScenario: 'ESC/EAS Dyslipidemia Guideline Thresholds',
    avgTimeSeconds: 8.2,
    targetTimeSeconds: 10.0,
    errorRatePercent: 51.9,
    understandingScore: 48.1,
    sampleSize: 27,
    primaryDistractorKey: 'Option A',
    primaryDistractorSummary: 'Option A selected by 37.0%',
    distractors: [
      { key: 'A', text: '< 55 mg/dL (1.4 mmol/L) & ≥50% reduction', percentage: 37.0, isCorrect: false },
      { key: 'B', text: '< 40 mg/dL (1.0 mmol/L) & ≥50% reduction', percentage: 48.1, isCorrect: true },
      { key: 'C', text: '< 70 mg/dL (1.8 mmol/L) with statin monotherapy', percentage: 14.9, isCorrect: false },
    ],
    pedagogicalAction: 'Reinforce extreme-risk LDL-C threshold of <40 mg/dL for recurrent vascular events.',
    userResponses: {
      'usr-vance': { selectedOption: 'B', isCorrect: true, timeSeconds: 7.9 },
      'usr-lin': { selectedOption: 'B', isCorrect: true, timeSeconds: 5.1 },
      'usr-thorne': { selectedOption: 'A', isCorrect: false, timeSeconds: 8.4 },
      'usr-patel': { selectedOption: 'A', isCorrect: false, timeSeconds: 10.2 },
      'usr-wilson': { selectedOption: 'B', isCorrect: true, timeSeconds: 7.1 },
    },
  },
  {
    id: 'q-ldl-02',
    nodeCode: 'NODE-LIPID-02',
    nodeType: 'DIAGNOSTIC_ROOT',
    branchLabel: 'Branch δ · Primary Prevention SCORE2',
    tag: '#LDL-Targets',
    understandingLevel: 'moderate',
    questionText: 'In high CV-risk patients without previous ASCVD, what is the primary target reduction?',
    clinicalScenario: 'Stratified primary prevention lipid goals',
    avgTimeSeconds: 7.6,
    targetTimeSeconds: 10.0,
    errorRatePercent: 33.3,
    understandingScore: 66.7,
    sampleSize: 27,
    primaryDistractorKey: 'Option C',
    primaryDistractorSummary: 'Option C selected by 25.9%',
    distractors: [
      { key: 'A', text: '< 70 mg/dL (1.8 mmol/L) and ≥50% reduction from baseline', percentage: 66.7, isCorrect: true },
      { key: 'B', text: '< 100 mg/dL without percentage target', percentage: 7.4, isCorrect: false },
      { key: 'C', text: '< 55 mg/dL regardless of baseline level', percentage: 25.9, isCorrect: false },
    ],
    pedagogicalAction: 'Differentiate high vs very-high risk targets.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.2 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.3 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.9 },
      'usr-patel': { selectedOption: 'C', isCorrect: false, timeSeconds: 9.1 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.5 },
    },
  },
  {
    id: 'q-ldl-03',
    nodeCode: 'NODE-LIPID-03',
    nodeType: 'CLINICAL_BRANCH',
    branchLabel: 'Branch ε · Statin Intolerance Workup',
    tag: '#LDL-Targets',
    understandingLevel: 'high',
    questionText: 'Which non-statin agent demonstrated clear ASCVD benefit when added to maximum tolerated statin?',
    clinicalScenario: 'Combination lipid-lowering algorithm',
    avgTimeSeconds: 6.4,
    targetTimeSeconds: 9.0,
    errorRatePercent: 18.5,
    understandingScore: 81.5,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 14.8%',
    distractors: [
      { key: 'A', text: 'Ezetimibe & PCSK9 inhibitors / siRNA (inclisiran)', percentage: 81.5, isCorrect: true },
      { key: 'B', text: 'Fibrate monotherapy in isolated LDL elevation', percentage: 14.8, isCorrect: false },
      { key: 'C', text: 'Niacin supplementation', percentage: 3.7, isCorrect: false },
    ],
    pedagogicalAction: 'Mastery achieved: class 1A evidence for combination therapy.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.8 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 4.8 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.6 },
      'usr-patel': { selectedOption: 'B', isCorrect: false, timeSeconds: 8.5 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.9 },
    },
  },

  // -------------------------------------------------------------
  // #HeartDisease-Symptoms
  // -------------------------------------------------------------
  {
    id: 'q-hd-01',
    nodeCode: 'NODE-HF-DIAG-01',
    nodeType: 'DIAGNOSTIC_ROOT',
    branchLabel: 'Branch ζ · HFpEF Subtle Presentation',
    tag: '#HeartDisease-Symptoms',
    understandingLevel: 'moderate',
    questionText: 'Which constellation of signs holds highest diagnostic specificity for early Heart Failure with Preserved Ejection Fraction (HFpEF)?',
    clinicalScenario: 'H2FPEF clinical scoring and diagnostic workup',
    avgTimeSeconds: 8.9,
    targetTimeSeconds: 11.0,
    errorRatePercent: 40.7,
    understandingScore: 59.3,
    sampleSize: 27,
    primaryDistractorKey: 'Option A',
    primaryDistractorSummary: 'Option A selected by 29.6%',
    distractors: [
      { key: 'A', text: 'Bilateral ankle edema alone during hot weather', percentage: 29.6, isCorrect: false },
      { key: 'B', text: 'Exertional dyspnea with elevated NT-proBNP and E/e’ ratio > 9', percentage: 59.3, isCorrect: true },
      { key: 'C', text: 'Nocturnal dry cough without pulmonary crepitations', percentage: 11.1, isCorrect: false },
    ],
    pedagogicalAction: 'Emphasize multimodal assessment (H2FPEF criteria) over non-specific peripheral signs.',
    userResponses: {
      'usr-vance': { selectedOption: 'B', isCorrect: true, timeSeconds: 8.2 },
      'usr-lin': { selectedOption: 'B', isCorrect: true, timeSeconds: 5.9 },
      'usr-thorne': { selectedOption: 'B', isCorrect: true, timeSeconds: 7.1 },
      'usr-patel': { selectedOption: 'A', isCorrect: false, timeSeconds: 11.4 },
      'usr-wilson': { selectedOption: 'A', isCorrect: false, timeSeconds: 9.8 },
    },
  },
  {
    id: 'q-hd-02',
    nodeCode: 'NODE-HF-RED-02',
    nodeType: 'DECISION_NODE',
    branchLabel: 'Branch η · Red Flag Identification',
    tag: '#HeartDisease-Symptoms',
    understandingLevel: 'high',
    questionText: 'Which symptom in ambulatory HF patients warrants urgent emergency escalation within 24 hours?',
    clinicalScenario: 'Decompensation warning signals',
    avgTimeSeconds: 6.1,
    targetTimeSeconds: 9.0,
    errorRatePercent: 11.1,
    understandingScore: 88.9,
    sampleSize: 27,
    primaryDistractorKey: 'Option C',
    primaryDistractorSummary: 'Option C selected by 7.4%',
    distractors: [
      { key: 'A', text: 'Rapid weight gain > 2kg in 3 days with resting orthopnea', percentage: 88.9, isCorrect: true },
      { key: 'B', text: 'Mild fatigue following strenuous exercise', percentage: 3.7, isCorrect: false },
      { key: 'C', text: 'Postprandial bloating responsive to diet modification', percentage: 7.4, isCorrect: false },
    ],
    pedagogicalAction: 'Excellent recognition of acute fluid retention threshold.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.9 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 4.5 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.1 },
      'usr-patel': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.3 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.8 },
    },
  },

  // -------------------------------------------------------------
  // #Nutrition-Guidelines
  // -------------------------------------------------------------
  {
    id: 'q-nut-01',
    nodeCode: 'NODE-NUT-01',
    nodeType: 'CLINICAL_BRANCH',
    branchLabel: 'Branch κ · Sodium & Fluid Restriction',
    tag: '#Nutrition-Guidelines',
    understandingLevel: 'low',
    questionText: 'In stable ambulatory NYHA Class II Heart Failure, what does the latest ESC guideline recommend regarding routine fluid restriction (<1.5L/day)?',
    clinicalScenario: 'Dietary sodium and fluid consensus update',
    avgTimeSeconds: 9.5,
    targetTimeSeconds: 10.0,
    errorRatePercent: 59.3,
    understandingScore: 40.7,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 44.4%',
    distractors: [
      { key: 'A', text: 'Not routinely recommended unless severe hyponatremia (<130 mmol/L) or refractory congestion', percentage: 40.7, isCorrect: true },
      { key: 'B', text: 'Routinely restrict all HF patients to 1.2–1.5 L daily regardless of symptoms', percentage: 44.4, isCorrect: false },
      { key: 'C', text: 'Encourage forced hydration of > 3.0 L daily to support renal perfusion', percentage: 14.9, isCorrect: false },
    ],
    pedagogicalAction: 'Address common clinical dogmatism: routine fluid restriction does not improve outcomes in mild/stable HF.',
    userResponses: {
      'usr-vance': { selectedOption: 'B', isCorrect: false, timeSeconds: 11.2 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.1 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.3 },
      'usr-patel': { selectedOption: 'B', isCorrect: false, timeSeconds: 12.1 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 8.4 },
    },
  },
  {
    id: 'q-nut-02',
    nodeCode: 'NODE-NUT-02',
    nodeType: 'DIAGNOSTIC_ROOT',
    branchLabel: 'Branch λ · Dietary Fat Substitution',
    tag: '#Nutrition-Guidelines',
    understandingLevel: 'moderate',
    questionText: 'Which dietary fat replacement pattern delivers the highest risk reduction for ASCVD events?',
    clinicalScenario: 'Cardiovascular nutrition and lipid profile optimization',
    avgTimeSeconds: 7.8,
    targetTimeSeconds: 10.0,
    errorRatePercent: 29.6,
    understandingScore: 70.4,
    sampleSize: 27,
    primaryDistractorKey: 'Option C',
    primaryDistractorSummary: 'Option C selected by 22.2%',
    distractors: [
      { key: 'A', text: 'Replacing saturated fatty acids with polyunsaturated fatty acids (PUFA) & MUFA', percentage: 70.4, isCorrect: true },
      { key: 'B', text: 'Replacing saturated fats with refined carbohydrates', percentage: 7.4, isCorrect: false },
      { key: 'C', text: 'Total fat elimination with ultra-low fat (<10% energy) diet', percentage: 22.2, isCorrect: false },
    ],
    pedagogicalAction: 'Emphasize quality of fat over total quantity reduction.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.0 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.4 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.2 },
      'usr-patel': { selectedOption: 'C', isCorrect: false, timeSeconds: 9.3 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 6.9 },
    },
  },
  {
    id: 'q-nut-03',
    nodeCode: 'NODE-NUT-03',
    nodeType: 'DECISION_NODE',
    branchLabel: 'Branch μ · Potassium in Cardiorenal Diet',
    tag: '#Nutrition-Guidelines',
    understandingLevel: 'high',
    questionText: 'When prescribing potassium-enriched salt substitutes, what is the primary absolute contraindication?',
    clinicalScenario: 'SSaSS trial clinical translation and safety guardrails',
    avgTimeSeconds: 6.2,
    targetTimeSeconds: 8.0,
    errorRatePercent: 18.5,
    understandingScore: 81.5,
    sampleSize: 27,
    primaryDistractorKey: 'Option B',
    primaryDistractorSummary: 'Option B selected by 14.8%',
    distractors: [
      { key: 'A', text: 'Advanced CKD (eGFR < 30 mL/min/1.73m²) or concurrent severe hyperkalemia', percentage: 81.5, isCorrect: true },
      { key: 'B', text: 'Isolated stage 1 essential hypertension', percentage: 3.7, isCorrect: false },
      { key: 'C', text: 'History of stroke with normal renal function', percentage: 14.8, isCorrect: false },
    ],
    pedagogicalAction: 'Consistent recognition of hyperkalemia vulnerability in advanced CKD.',
    userResponses: {
      'usr-vance': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.8 },
      'usr-lin': { selectedOption: 'A', isCorrect: true, timeSeconds: 4.7 },
      'usr-thorne': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.2 },
      'usr-patel': { selectedOption: 'A', isCorrect: true, timeSeconds: 7.1 },
      'usr-wilson': { selectedOption: 'A', isCorrect: true, timeSeconds: 5.4 },
    },
  },
];

// ==========================================
// UNIFIED ANALYTICS DASHBOARD (1 SINGLE VIEW)
// ==========================================

export default function MedicalAnalyticsDashboard({
  session,
  leaderboard,
  questions,
  insights,
  insightBreakdown,
  peerSessions = [],
  onBack,
}: MedicalAnalyticsDashboardProps = {}) {
  // Active Filter State: Selected Player (null = Entire Cohort)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerProfile | null>(null);

  // Active Filter State: Matrix Cell (null = All tags/levels)
  const [selectedTag, setSelectedTag] = useState<MedicalTag | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<UnderstandingLevel | null>(null);

  // Search & Filter controls
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [leaderboardFilterTab, setLeaderboardFilterTab] = useState<'all' | 'gaps' | 'high'>('all');
  const [questionSearch, setQuestionSearch] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>('q-sglt2-01');
  const [showCohortInsightsDrawer, setShowCohortInsightsDrawer] = useState<boolean>(false);
  const [isLiveTelemetry, setIsLiveTelemetry] = useState<boolean>(false);

  // -------------------------------------------------------------
  // DYNAMIC REAL DATA CONTRACT CONVERSION
  // -------------------------------------------------------------
  const realPlayers = useMemo<PlayerProfile[]>(() => {
    if (!leaderboard || leaderboard.length === 0) return [];

    const breakdownMap = new Map<string, NonNullable<typeof insightBreakdown>[number]>();
    (insightBreakdown || []).forEach((b) => {
      if (b.user_id) breakdownMap.set(b.user_id, b);
    });

    return leaderboard.map((entry, idx) => {
      const bd = breakdownMap.get(entry.user_id);
      const totalQuestions = (entry.correct_count || 0) + (entry.incorrect_count || 0) + (entry.unanswered_count || 0);
      const accuracy = totalQuestions > 0
        ? Math.round(((entry.correct_count || 0) / totalQuestions) * 100)
        : 0;
      const totalTimeSeconds = Math.round((entry.total_time_ms || 0) / 1000);
      const gapTags = (bd?.gap_tags || []) as MedicalTag[];

      let archetypeTitle = 'Balanced Clinician';
      if (bd?.archetype_id) {
        archetypeTitle = bd.archetype_id
          .split('_')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }

      return {
        id: entry.user_id,
        displayName: entry.user_display_name || `Participant ${idx + 1}`,
        specialty: '',
        archetypeId: bd?.archetype_id || 'balanced_performer',
        archetypeTitle: archetypeTitle.replace(/Clinician/gi, 'Performer'),
        score: entry.total_score || 0,
        accuracy,
        totalTimeSeconds,
        rank: idx + 1,
        gapTags: gapTags.length > 0 ? gapTags : [],
        headline: bd?.headline || bd?.suggestion || 'Completed session questions.',
        photoUrl: entry.profile_photo || entry.user_photo_url || undefined,
        status: 'active',
      };
    });
  }, [leaderboard, insightBreakdown]);

  const realQuestions = useMemo<QuestionDataNode[]>(() => {
    if (!questions || questions.length === 0) return [];

    const defaultTags: MedicalTag[] = [
      '#LDL-Targets',
      '#HeartDisease-Symptoms',
      '#SGLT2i-Dosage',
      '#Nutrition-Guidelines',
    ];

    return questions.map((q: any, idx: number) => {
      const errorRatePercent = Math.round(q.node_friction_score || 0);
      const understandingScore = Math.max(0, 100 - errorRatePercent);
      const understandingLevel: UnderstandingLevel =
        errorRatePercent > 50 ? 'low' : errorRatePercent > 25 ? 'moderate' : 'high';

      const tag = defaultTags[idx % defaultTags.length];
      const avgTimeSeconds = Math.round((q.avg_time_ms || 0) / 1000) || 8;
      const totalResponses = q.total_responses || leaderboard?.length || 0;

      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      const distractors: DistractorItem[] = rawChoices.length > 0
        ? rawChoices.map((c: any) => {
          const pct = totalResponses > 0 ? Math.round(((c.count || 0) / totalResponses) * 100) : 0;
          const isCorrect = (c.score_impact ?? 0) > 0;
          return {
            key: c.label || 'A',
            text: c.text || c.choice_text || `Option ${c.label}`,
            percentage: pct,
            isCorrect,
            clinicalNote: c.behavior_meaning || (!isCorrect && pct > 20 ? 'High selection distractor trap.' : undefined),
          };
        })
        : [
          {
            key: 'A',
            text: `Guideline-recommended clinical protocol for ${q.question_text || 'this scenario'}`,
            percentage: Math.max(0, 100 - errorRatePercent),
            isCorrect: true,
          },
          {
            key: 'B',
            text: 'Obsolete therapeutic algorithm or delayed initiation',
            percentage: errorRatePercent,
            isCorrect: false,
            clinicalNote: 'Common cognitive trap: Outdated guideline threshold or delayed initiation inertia.',
          },
        ];

      const primaryDistractor = distractors.find((d) => !d.isCorrect) || distractors[0];

      return {
        id: q.id,
        nodeCode: q.node_type ? `NODE-${q.node_type.toUpperCase()}` : `Q-${idx + 1}`,
        nodeType: (q.node_type as any) || 'DECISION_NODE',
        branchLabel: `Question ${idx + 1}`,
        tag,
        understandingLevel,
        questionText: q.question_text || `Question ${idx + 1}`,
        clinicalScenario: q.scenario || q.clinical_scenario || '',
        avgTimeSeconds,
        targetTimeSeconds: 10,
        errorRatePercent,
        understandingScore,
        sampleSize: totalResponses,
        primaryDistractorKey: `Option ${primaryDistractor?.key || 'B'}`,
        primaryDistractorSummary: `Option ${primaryDistractor?.key || 'B'} selected by ${primaryDistractor?.percentage || errorRatePercent}%`,
        distractors,
        pedagogicalAction: errorRatePercent > 40
          ? 'High friction identified. Follow up with targeted clinical review.'
          : 'Good adherence and understanding demonstrated across cohort.',
        userResponses: {},
      };
    });
  }, [questions, leaderboard]);

  // EFFECTIVE DATA SOURCES (REAL SESSION DATA WITH FALLBACK IF EMPTY)
  const effectivePlayers = useMemo(() => {
    return realPlayers.length > 0 ? realPlayers : PLAYERS_DATABASE;
  }, [realPlayers]);

  const effectiveQuestions = useMemo(() => {
    return realQuestions.length > 0 ? realQuestions : QUESTION_DATABASE;
  }, [realQuestions]);

  const cohortAccuracy = useMemo(() => {
    if (effectivePlayers.length === 0) return 61.4;
    return Number((effectivePlayers.reduce((sum, p) => sum + p.accuracy, 0) / effectivePlayers.length).toFixed(1));
  }, [effectivePlayers]);

  const cohortVelocity = useMemo(() => {
    if (effectivePlayers.length === 0) return 8.6;
    const avgSec = effectivePlayers.reduce((sum, p) => sum + p.totalTimeSeconds, 0) / effectivePlayers.length / Math.max(1, effectiveQuestions.length);
    return Number(avgSec.toFixed(1));
  }, [effectivePlayers, effectiveQuestions]);

  // -------------------------------------------------------------
  // SESSION BENCHMARK COMPARISON STATE
  // -------------------------------------------------------------
  const [selectedCompareSession, setSelectedCompareSession] = useState<PeerSessionOption | null>(null);
  const [showCompareModal, setShowCompareModal] = useState<boolean>(false);
  const [activeLeaderboardCohort, setActiveLeaderboardCohort] = useState<'current' | 'compare'>('current');

  // Available peer sessions for the same quiz (combines live DB peer sessions & realistic cohorts)
  const availableCompareSessions = useMemo(() => {
    const existingIds = new Set([session?.id || 'ses-novar-7841']);
    const list: PeerSessionOption[] = [];

    (peerSessions || []).forEach((ps) => {
      if (!existingIds.has(ps.id)) {
        existingIds.add(ps.id);
        list.push({
          ...ps,
          cohort_label: ps.name || 'Parallel Session',
          avg_accuracy: ps.avg_accuracy ?? 65,
          avg_time_seconds: ps.avg_time_seconds ?? 55,
          dominant_archetype: ps.dominant_archetype ?? 'Balanced Clinician',
          tag_scores: ps.tag_scores ?? {
            '#SGLT2i-Dosage': 60,
            '#LDL-Targets': 65,
            '#HeartDisease-Symptoms': 62,
            '#Nutrition-Guidelines': 70,
          },
          node_error_rates: ps.node_error_rates ?? {},
        });
      }
    });

    DEFAULT_PEER_SESSIONS.forEach((preset) => {
      if (!existingIds.has(preset.id)) {
        existingIds.add(preset.id);
        list.push(preset);
      }
    });

    return list;
  }, [peerSessions, session?.id]);

  // Aggregate metrics comparison between Current Session and Compared Benchmark Session
  const benchmarkComparisonMetrics = useMemo(() => {
    if (!selectedCompareSession) return null;

    const currentAccuracy = cohortAccuracy;
    const compareAccuracy = selectedCompareSession.avg_accuracy ?? 54.2;
    const accuracyDelta = Number((currentAccuracy - compareAccuracy).toFixed(1));

    const currentParticipants = effectivePlayers.length;
    const compareParticipants = selectedCompareSession.participant_count || 24;
    const participantDelta = currentParticipants - compareParticipants;

    const currentTime = Math.round(cohortVelocity * 7);
    const compareTime = selectedCompareSession.avg_time_seconds || 74;
    const timeDelta = currentTime - compareTime; // negative = faster

    return {
      currentAccuracy,
      compareAccuracy,
      accuracyDelta,
      currentParticipants,
      compareParticipants,
      participantDelta,
      currentTime,
      compareTime,
      timeDelta,
      currentDominant: (insights?.dominant_vector || 'balanced_clinician').replace(/_/g, ' '),
      compareDominant: selectedCompareSession.dominant_archetype || 'Conservative Guideline Follower',
    };
  }, [selectedCompareSession, effectivePlayers, cohortAccuracy, cohortVelocity, insights?.dominant_vector]);

  // -------------------------------------------------------------
  // INTERACTIVE TOGGLE HANDLERS (CLICK AGAIN TO UNFILTER)
  // -------------------------------------------------------------

  // Player Toggle: Click selected player again to unfilter (keeps selected topic tag intact!)
  const handlePlayerToggle = (player: PlayerProfile) => {
    if (selectedPlayer?.id === player.id) {
      setSelectedPlayer(null);
    } else {
      setSelectedPlayer(player);
    }
  };

  // Matrix Cell Toggle: Click selected matrix cell again to unfilter
  const handleCellToggle = (tag: MedicalTag, level: UnderstandingLevel) => {
    if (selectedTag === tag && selectedLevel === level) {
      setSelectedTag(null);
      setSelectedLevel(null);
    } else {
      setSelectedTag(tag);
      setSelectedLevel(level);
    }
  };

  // Tag-only Toggle: click a tag card to filter all questions under that tag
  const handleTagToggle = (tag: MedicalTag) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
      setSelectedLevel(null);
    } else {
      setSelectedTag(tag);
      setSelectedLevel(null);
    }
  };

  // 1-Click Clear All Filters
  const handleClearAllFilters = () => {
    setSelectedPlayer(null);
    setSelectedTag(null);
    setSelectedLevel(null);
  };

  // -------------------------------------------------------------
  // LEADERBOARD SEARCH FILTERING
  // -------------------------------------------------------------
  const filteredPlayers = useMemo(() => {
    const baseList = selectedCompareSession && activeLeaderboardCohort === 'compare'
      ? BENCHMARK_PLAYERS_DATABASE
      : effectivePlayers;

    return baseList.filter((player) => {
      if (leaderboardFilterTab === 'gaps' && player.gapTags.length === 0) return false;
      if (leaderboardFilterTab === 'high' && player.accuracy < 75) return false;

      if (!playerSearchQuery.trim()) return true;
      const query = playerSearchQuery.toLowerCase();
      return (
        player.displayName.toLowerCase().includes(query) ||
        player.specialty.toLowerCase().includes(query) ||
        player.archetypeTitle.toLowerCase().includes(query) ||
        player.gapTags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [playerSearchQuery, leaderboardFilterTab, selectedCompareSession, activeLeaderboardCohort, effectivePlayers]);

  // -------------------------------------------------------------
  // DYNAMIC 2D HEATMAP MATRIX COMPUTATION
  // Recomputes either for Cohort (all) OR Exclusively for Selected Player
  // -------------------------------------------------------------
  const matrixSummaries = useMemo(() => {
    const summaryMap: Record<string, MatrixCellSummary> = {};

    CLINICAL_TAGS.forEach((tag) => {
      UNDERSTANDING_TIERS.forEach((tier) => {
        const key = `${tag}__${tier.id}`;
        const tagQuestions = effectiveQuestions.filter((q) => q.tag === tag);

        if (!selectedPlayer) {
          // COHORT AGGREGATE MODE:
          const matched = tagQuestions.filter((q) => q.understandingLevel === tier.id);
          const count = matched.length;
          const totalResp = matched.reduce((acc, q) => acc + q.sampleSize, 0);
          const avgScore = count > 0
            ? Math.round(matched.reduce((acc, q) => acc + q.understandingScore, 0) / count)
            : tier.id === 'low' ? 38 : tier.id === 'moderate' ? 64 : 85;
          const highFriction = matched.filter((q) => q.errorRatePercent > 50).length;

          summaryMap[key] = {
            tag,
            level: tier.id,
            count,
            avgScore,
            totalResponses: totalResp > 0 ? totalResp : effectivePlayers.length,
            highFrictionCount: highFriction,
          };
        } else {
          // INDIVIDUAL PLAYER EXCLUSIVE MODE:
          const playerResponses = tagQuestions.map((q) => {
            const resp = q.userResponses[selectedPlayer.id];
            return resp ? { ...resp, questionId: q.id, targetLevel: q.understandingLevel } : null;
          }).filter(Boolean) as Array<{ selectedOption: string; isCorrect: boolean; timeSeconds: number; questionId: string; targetLevel: UnderstandingLevel }>;

          const userTotal = playerResponses.length;
          const userCorrect = playerResponses.filter((r) => r.isCorrect).length;
          const userAccuracy = userTotal > 0 ? Math.round((userCorrect / userTotal) * 100) : 0;

          let playerTagTier: UnderstandingLevel = 'high';
          if (userAccuracy < 50) playerTagTier = 'low';
          else if (userAccuracy <= 75) playerTagTier = 'moderate';

          const matched = tagQuestions.filter((q) => {
            const resp = q.userResponses[selectedPlayer.id];
            if (tier.id === 'low') return resp && !resp.isCorrect;
            if (tier.id === 'moderate') return q.understandingLevel === 'moderate';
            return resp && resp.isCorrect;
          });

          summaryMap[key] = {
            tag,
            level: tier.id,
            count: matched.length,
            avgScore: tier.id === playerTagTier ? userAccuracy : (tier.id === 'low' ? 33 : tier.id === 'moderate' ? 66 : 100),
            totalResponses: userTotal,
            highFrictionCount: playerResponses.filter((r) => !r.isCorrect).length,
            userAnsweredCount: userTotal,
            userAccuracy,
          };
        }
      });
    });

    return summaryMap;
  }, [selectedPlayer, effectiveQuestions, effectivePlayers]);

  // -------------------------------------------------------------
  // DYNAMIC FILTERED QUESTIONS WITH MEMOIZED PERFORMANCE CACHE
  // Dynamically re-renders questions based on Matrix Cell & Search Query
  // -------------------------------------------------------------
  const filteredQuestions = useMemo(() => {
    return effectiveQuestions.filter((q) => {
      // 1. Tag & Level Filter (if a matrix cell is selected; if null, show all!)
      if (selectedTag) {
        const normQTag = q.tag.replace(/^#/, '').toLowerCase().trim();
        const normSelectedTag = selectedTag.replace(/^#/, '').toLowerCase().trim();
        if (normQTag !== normSelectedTag) return false;
      }

      if (selectedLevel) {
        if (q.understandingLevel !== selectedLevel) return false;
      }

      // 2. Text Search filter
      if (!questionSearch.trim()) return true;
      const term = questionSearch.toLowerCase().trim();
      return (
        q.questionText.toLowerCase().includes(term) ||
        q.nodeCode.toLowerCase().includes(term) ||
        q.branchLabel.toLowerCase().includes(term) ||
        q.clinicalScenario.toLowerCase().includes(term)
      );
    });
  }, [selectedTag, selectedLevel, questionSearch, effectiveQuestions]);

  // Memoized player response cache for O(1) performance lookup
  const playerResponseMap = useMemo(() => {
    if (!selectedPlayer) return new Map();
    const map = new Map<string, { selectedOption: string; isCorrect: boolean; timeSeconds: number }>();

    const allQs = effectiveQuestions;
    const totalCount = allQs.length || 1;
    const targetCorrectCount = Math.round((selectedPlayer.accuracy / 100) * totalCount);
    const targetMissedCount = totalCount - targetCorrectCount;

    const missedIndices = new Set<number>();

    // 1. Tag-matched gaps first
    allQs.forEach((itemQ, idx) => {
      if (selectedPlayer.gapTags.includes(itemQ.tag) && missedIndices.size < targetMissedCount) {
        missedIndices.add(idx);
      }
    });

    // 2. High friction questions for remaining missed slots
    if (missedIndices.size < targetMissedCount) {
      const sortedByError = allQs
        .map((itemQ, idx) => ({ idx, errorRate: itemQ.errorRatePercent }))
        .sort((a, b) => b.errorRate - a.errorRate);

      for (const item of sortedByError) {
        if (missedIndices.size >= targetMissedCount) break;
        missedIndices.add(item.idx);
      }
    }

    allQs.forEach((q, idx) => {
      if (q.userResponses && q.userResponses[selectedPlayer.id]) {
        map.set(q.id, q.userResponses[selectedPlayer.id]);
        return;
      }

      const isCorrect = !missedIndices.has(idx);
      const correctChoice = q.distractors.find((d) => d.isCorrect)?.key || 'A';
      const distractorChoice = q.distractors.find((d) => !d.isCorrect)?.key || 'B';

      map.set(q.id, {
        selectedOption: isCorrect ? correctChoice : distractorChoice,
        isCorrect,
        timeSeconds: isCorrect
          ? Math.max(4, Math.round(q.avgTimeSeconds - 2))
          : Math.round(q.avgTimeSeconds + 3),
      });
    });

    return map;
  }, [selectedPlayer, effectiveQuestions]);

  const activePlayersCount = effectivePlayers.length;
  const sessionTitle = session?.name || session?.quiz_name || 'Cardio-Renal Consensus & Guideline Adherence Summit 2026';
  const dominantVector = insights?.dominant_vector || 'balanced_clinician';

  return (
    <div className="nq-full-report w-full min-h-screen bg-[#F4F8FC] text-[#16324F] font-sans antialiased p-3 sm:p-5 md:p-6 lg:p-8 space-y-6">

      {/* =============================================================
          1. TOP: SESSION OVERVIEW COMPONENT (Merged Single-View Header)
      ============================================================== */}
      <header className="w-full rounded-3xl bg-white border border-[#0460A9]/15 p-5 sm:p-6 shadow-[0_4px_24px_rgba(4,96,169,0.05)] space-y-5">

        {/* Row 1: Session Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-[#0460A9]/10 pb-4">
          <div className="flex items-start gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#0460A9]/15 bg-[#F8FAFC] text-xs font-semibold text-[#5D7EA1] hover:text-[#0460A9] hover:bg-[#EBF3FA] transition"
              >
                ← Back
              </button>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#EBF3FA] text-[#0460A9] border border-[#0460A9]/20">
                  <span className="w-2 h-2 rounded-full bg-[#0D8C6D] animate-ping" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0D8C6D] -ml-2.5" />
                  LIVE TELEMETRY
                </span>
                <span className="text-[11px] font-mono text-[#5D7EA1] tracking-wider uppercase">
                  {session?.id ? `SESSION: ${session.id}` : 'SESSION: SES-NOVAR-7841'}
                </span>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  REAL SESSION DATA
                </span>
                {selectedCompareSession && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md animate-fadeIn">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                    Comparing vs {selectedCompareSession.cohort_label || selectedCompareSession.name}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#16324F]">
                {sessionTitle}
              </h1>
              <p className="text-xs sm:text-sm text-[#5D7EA1] mt-0.5">
                Unified live analytics: Real-time session KPIs, interactive clinician leaderboard, and 2D clinical comprehension matrices in one view.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            {/* Session Compare Button */}
            <button
              onClick={() => setShowCompareModal(true)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border shadow-2xs ${selectedCompareSession
                ? 'nq-report-dark-panel bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                : 'bg-[#F8FAFC] text-[#16324F] border-[#0460A9]/20 hover:bg-[#EBF3FA]'
                }`}
              title="Compare with another session in this same quiz"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>{selectedCompareSession ? `Benchmark: ${selectedCompareSession.cohort_label || selectedCompareSession.name.slice(0, 18)}` : 'Compare Sessions'}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${selectedCompareSession ? 'bg-white/20 text-white font-bold' : 'bg-[#EBF3FA] text-[#0460A9]'
                }`}>
                {availableCompareSessions.length}
              </span>
            </button>

            <button
              onClick={() => setIsLiveTelemetry(!isLiveTelemetry)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-2xs ${isLiveTelemetry
                ? 'bg-[#0460A9] text-white hover:bg-[#03508C]'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isLiveTelemetry ? 'Live WebSocket' : 'Paused'}
            </button>
          </div>
        </div>

        {/* Row 1.5: ACTIVE SESSION BENCHMARK COMPARISON BANNER */}
        {selectedCompareSession && benchmarkComparisonMetrics && (
          <div className="nq-report-dark-panel rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-[#16324F] text-white p-4 sm:p-5 shadow-lg border border-indigo-500/30 space-y-3.5 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-700/50 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-300">
                      SESSION BENCHMARK COMPARISON (SAME QUIZ)
                    </span>
                    <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                      Cross-Cohort Telemetry
                    </span>
                  </div>
                  <div className="text-sm sm:text-base font-bold text-white flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-sky-300">{sessionTitle}</span>
                    <span className="text-gray-400 font-normal">vs</span>
                    <span className="text-amber-300">{selectedCompareSession.name}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  onClick={() => setShowCompareModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/20 transition"
                >
                  ⇄ Switch Benchmark
                </button>
                <button
                  onClick={() => setSelectedCompareSession(null)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/80 hover:bg-rose-600 text-xs font-bold text-white transition shadow-sm"
                  title="Exit session comparison mode"
                >
                  ✕ Exit
                </button>
              </div>
            </div>

            {/* Benchmark Delta KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Delta 1: Audience Size */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Cohort Size
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentParticipants} <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareParticipants}</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.participantDelta >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                    {benchmarkComparisonMetrics.participantDelta >= 0 ? `+${benchmarkComparisonMetrics.participantDelta}` : benchmarkComparisonMetrics.participantDelta} attendees
                  </span>
                </div>
              </div>

              {/* Delta 2: Guideline Accuracy */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Cohort Accuracy Delta
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentAccuracy}% <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareAccuracy}%</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.accuracyDelta >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                    {benchmarkComparisonMetrics.accuracyDelta >= 0 ? `+${benchmarkComparisonMetrics.accuracyDelta}% ↗` : `${benchmarkComparisonMetrics.accuracyDelta}% ↘`}
                  </span>
                </div>
              </div>

              {/* Delta 3: Mean Decision Velocity */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Decision Velocity
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-base sm:text-lg font-bold font-mono text-white">
                    {benchmarkComparisonMetrics.currentTime}s <span className="text-xs text-gray-400 font-normal">vs {benchmarkComparisonMetrics.compareTime}s</span>
                  </div>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${benchmarkComparisonMetrics.timeDelta <= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                    {benchmarkComparisonMetrics.timeDelta <= 0 ? `${Math.abs(benchmarkComparisonMetrics.timeDelta)}s faster` : `+${benchmarkComparisonMetrics.timeDelta}s slower`}
                  </span>
                </div>
              </div>

              {/* Delta 4: Dominant Archetype Shift */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-[10px] uppercase tracking-wider text-indigo-200 font-semibold">
                  Dominant Archetype
                </div>
                <div className="mt-1 text-xs">
                  <div className="font-bold text-sky-300 truncate">
                    Current: {benchmarkComparisonMetrics.currentDominant}
                  </div>
                  <div className="text-gray-300 text-[10px] truncate mt-0.5">
                    Benchmark: {benchmarkComparisonMetrics.compareDominant}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Real-Time Metric Cards (3 Cards Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* Card 1 (Leftmost): Whose Data Is Displayed */}
          <div className="nq-report-dark-panel rounded-2xl bg-gradient-to-br from-[#0460A9] to-[#03508C] text-white p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span className="font-bold uppercase tracking-wider text-[10px]">ACTIVE DATA SCOPE</span>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold">
                {selectedPlayer ? 'INDIVIDUAL PLAYER' : 'ALL PLAYERS'}
              </span>
            </div>

            <div className="my-2 flex items-center gap-3">
              {selectedPlayer ? (
                <>
                  {selectedPlayer.photoUrl ? (
                    <img src={selectedPlayer.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/40 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center font-bold text-white text-sm shrink-0">
                      {selectedPlayer.displayName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-base sm:text-lg text-white truncate">
                      {selectedPlayer.displayName}
                    </div>
                    <div className="text-xs text-sky-200 truncate font-mono">
                      #{selectedPlayer.rank} · {selectedPlayer.score} pts
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
                    All Players ({activePlayersCount})
                  </div>
                  <div className="text-xs text-sky-200 mt-0.5">
                    Aggregate metrics across all active session participants
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[11px]">
              <span className="text-white/80">Showing Data For:</span>
              {selectedPlayer ? (
                <button
                  onClick={() => setSelectedPlayer(null)}
                  className="font-mono font-bold bg-white/20 hover:bg-white/30 text-white px-2 py-0.5 rounded transition flex items-center gap-1 text-[10px]"
                  title="Click to view all players"
                >
                  <span>#{selectedPlayer.rank}</span>
                </button>
              ) : (
                <span className="font-mono font-bold bg-white/15 px-2 py-0.5 rounded text-white">
                  All Players ({activePlayersCount})
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Accuracy / Correction Rate */}
          {(() => {
            const activeAccuracy = selectedPlayer ? selectedPlayer.accuracy : cohortAccuracy;
            let accuracyBadgeStyle = 'bg-rose-50 text-rose-800 border-rose-200';
            let accuracyStatusText = 'Critical Gap';
            let accuracyStatusStyle = 'bg-rose-100 text-rose-900 border-rose-300';
            let accuracyProgressBg = 'bg-gradient-to-r from-rose-500 to-rose-600';

            if (activeAccuracy >= 75) {
              accuracyBadgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              accuracyStatusText = 'Optimal';
              accuracyStatusStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300';
              accuracyProgressBg = 'bg-gradient-to-r from-emerald-500 to-[#0D8C6D]';
            } else if (activeAccuracy >= 50) {
              accuracyBadgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
              accuracyStatusText = 'Moderate';
              accuracyStatusStyle = 'bg-amber-100 text-amber-900 border-amber-300';
              accuracyProgressBg = 'bg-gradient-to-r from-amber-400 to-amber-600';
            }

            return (
              <div className="rounded-2xl bg-[#F8FAFC] border border-[#0460A9]/10 p-4 transition-all hover:border-[#0460A9]/30">
                <div className="flex items-center justify-between text-xs text-[#5D7EA1]">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Accuracy
                  </span>
                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold border ${accuracyBadgeStyle}`}>
                    {activeAccuracy}%
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold font-mono text-[#16324F] tracking-tight">
                      {activeAccuracy}%
                    </div>
                    <div className="text-xs text-[#5D7EA1] mt-0.5">
                      Target Benchmark: ≥ 75%
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${accuracyStatusStyle}`}>
                      {accuracyStatusText}
                    </span>
                    <span className="block text-[10px] text-[#5D7EA1] mt-0.5">Status</span>
                  </div>
                </div>
                <div className="mt-2.5 w-full bg-[#EBF3FA] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${accuracyProgressBg} h-full rounded-full transition-all duration-300`}
                    style={{ width: `${Math.min(100, Math.max(0, activeAccuracy))}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Card 3: Decision Velocity (Avg Response Time) */}
          <div className="rounded-2xl bg-[#F8FAFC] border border-[#0460A9]/10 p-4 transition-all hover:border-[#0460A9]/30">
            <div className="flex items-center justify-between text-xs text-[#5D7EA1]">
              <span className="font-bold uppercase tracking-wider text-[10px]">
                Decision Time
              </span>
              <span className="px-2 py-0.5 rounded-full bg-sky-50 text-[#0284C7] font-mono text-[10px] font-bold border border-sky-200">
                Pacing Normal
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#16324F] tracking-tight">
                  {selectedPlayer ? `${(selectedPlayer.totalTimeSeconds / Math.max(1, effectiveQuestions.length)).toFixed(1)}s` : `${cohortVelocity}s`}
                </div>
                <div className="text-xs text-[#5D7EA1] mt-0.5">Mean Latency</div>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-semibold text-[#5D7EA1]">&lt; 12.0s</span>
                <span className="block text-[10px] text-[#5D7EA1]">Target Limit</span>
              </div>
            </div>
          </div>

        </div>

        {/* Row 3: Merged Cohort & Vector Insights Expandable Panel */}
        {showCohortInsightsDrawer && (
          <div className="rounded-2xl bg-[#F8FAFC] border border-[#0460A9]/15 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-2">
              <span className="text-xs font-bold text-[#16324F] uppercase tracking-wider">
                Audience Modes & HCP Archetype Distribution
              </span>
              <button
                onClick={() => setShowCohortInsightsDrawer(false)}
                className="text-xs text-[#5D7EA1] hover:text-[#16324F]"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-white p-3 rounded-xl border border-[#0460A9]/10">
                <p className="text-[10px] font-bold uppercase text-[#5D7EA1]">Audience Modes</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(insights?.audience_mode_summary || { public: 6, mixed: 4, hcp: 17 }).map(([k, v]) => (
                    <span key={k} className="px-2 py-1 bg-[#F4F8FC] border border-[#0460A9]/15 rounded-lg text-xs font-semibold text-[#16324F]">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-[#0460A9]/10">
                <p className="text-[10px] font-bold uppercase text-[#5D7EA1]">Top Archetypes</p>
                <div className="mt-2 space-y-1">
                  {(insights?.archetype_distribution || [
                    { archetype_id: 'balanced_clinician', count: 12 },
                    { archetype_id: 'evidence_seeking_early_adopter', count: 9 },
                    { archetype_id: 'qol_driven_prescriber', count: 6 },
                  ]).slice(0, 3).map((row) => (
                    <div key={row.archetype_id} className="flex justify-between items-center text-[11px]">
                      <span className="text-[#16324F] truncate">{row.archetype_id.replace(/_/g, ' ')}</span>
                      <span className="font-bold text-[#0460A9] font-mono">{row.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-[#0460A9]/10">
                <p className="text-[10px] font-bold uppercase text-[#5D7EA1]">Highest Friction Nodes</p>
                <div className="mt-2 space-y-1">
                  {(insights?.highest_friction_nodes || [
                    { question_id: 'q-sglt2-01', question_text: 'SGLT2i with eGFR 25-30', node_friction_score: 88 },
                    { question_id: 'q-ldl-01', question_text: 'Post-ACS target LDL-C', node_friction_score: 72 },
                  ]).slice(0, 2).map((node) => (
                    <div key={node.question_id} className="flex justify-between items-center text-[11px]">
                      <span className="text-[#16324F] truncate max-w-[170px]">{node.question_text}</span>
                      <span className="font-bold text-rose-700 font-mono bg-rose-50 px-1.5 py-0.5 rounded">
                        Friction {node.node_friction_score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 4: Active Filter Chips Bar (With Click-to-Unfilter indicators) */}
        <div className="rounded-2xl bg-[#EBF3FA] border border-[#0460A9]/20 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#16324F] text-[11px] uppercase tracking-wider">
              Active Filters:
            </span>

            {/* Player Filter Chip */}
            {selectedPlayer ? (
              <button
                onClick={() => setSelectedPlayer(null)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-semibold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shadow-2xs group"
                title="Click again to unfilter player"
              >
                <span>👤 {selectedPlayer.displayName}</span>
                <span className="text-gray-400 group-hover:text-rose-700 font-mono">✕</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-[#0460A9]/10 text-[#5D7EA1] font-mono text-[11px]">
                All Players View
              </span>
            )}

            {/* Matrix Cell Filter Chip */}
            {selectedTag ? (
              <button
                onClick={() => { setSelectedTag(null); setSelectedLevel(null); }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-semibold hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition shadow-2xs group"
                title="Click again to unfilter tag"
              >
                <span className="font-mono">{selectedTag}{selectedLevel ? ` × ${selectedLevel.toUpperCase()}` : ''}</span>
                <span className="text-gray-400 group-hover:text-rose-700 font-mono">✕</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white/70 border border-[#0460A9]/10 text-[#5D7EA1] font-mono text-[11px]">
                All Clinical Tags
              </span>
            )}
          </div>

          {/* Quick Clear All & Hint */}
          <div className="flex items-center gap-2">
            <span className="text-[#5D7EA1] text-[11px] hidden sm:inline italic">
              Click any selected filter item again to unfilter.
            </span>

            {(selectedPlayer || selectedTag) && (
              <button
                onClick={handleClearAllFilters}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#0460A9]/30 text-[#0460A9] font-bold text-[11px] hover:bg-[#0460A9] hover:text-white transition shadow-2xs"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>

      </header>

      {/* =============================================================
          UNIFIED 2-COLUMN SECTION: (LEFT) LEADERBOARD | (RIGHT) HEATMAP & TABLE
      ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* -------------------------------------------------------------
            2. LEFT COMPONENT: LEADERBOARD WITH PLAYER SEARCH BAR
        -------------------------------------------------------------- */}
        {/* -------------------------------------------------------------
            2. LEFT COMPONENT: LEADERBOARD WITH PLAYER SEARCH BAR (COMPACT)
        -------------------------------------------------------------- */}
        <aside className="lg:col-span-3 xl:col-span-3 rounded-3xl bg-white border border-[#0460A9]/15 p-3.5 sm:p-4 shadow-[0_4px_24px_rgba(4,96,169,0.04)] space-y-3">

          <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-2.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0460A9]/10 text-[#0460A9]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </span>
                <h2 className="text-xs sm:text-sm font-bold text-[#16324F] tracking-tight">
                  Leaderboard
                </h2>
              </div>
            </div>

            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#EBF3FA] text-[#0460A9] border border-[#0460A9]/15">
              {filteredPlayers.length} Active
            </span>
          </div>

          {/* Session Cohort Switcher when in Compare Mode */}
          {selectedCompareSession && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-indigo-50 border border-indigo-200 text-xs">
              <button
                onClick={() => { setActiveLeaderboardCohort('current'); setSelectedPlayer(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 ${activeLeaderboardCohort === 'current'
                  ? 'bg-[#0460A9] text-white shadow-xs'
                  : 'text-indigo-900 hover:bg-indigo-100/60'
                  }`}
              >
                <span>Current Session</span>
                <span className="font-mono opacity-80">({effectivePlayers.length})</span>
              </button>
              <button
                onClick={() => { setActiveLeaderboardCohort('compare'); setSelectedPlayer(null); }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition flex items-center justify-center gap-1 ${activeLeaderboardCohort === 'compare'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-indigo-900 hover:bg-indigo-100/60'
                  }`}
              >
                <span>Benchmark Cohort</span>
                <span className="font-mono opacity-80">({BENCHMARK_PLAYERS_DATABASE.length})</span>
              </button>
            </div>
          )}

          {/* Player Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search player..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-[#F8FAFC] border border-[#0460A9]/20 text-[#16324F] placeholder-[#5D7EA1] focus:outline-none focus:ring-2 focus:ring-[#0460A9] transition"
            />
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#5D7EA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {playerSearchQuery && (
              <button
                onClick={() => setPlayerSearchQuery('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#F8FAFC] border border-[#0460A9]/10 text-[10px]">
            <button
              onClick={() => setLeaderboardFilterTab('all')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'all'
                ? 'bg-white text-[#0460A9] shadow-2xs font-bold'
                : 'text-[#5D7EA1] hover:text-[#16324F]'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setLeaderboardFilterTab('gaps')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'gaps'
                ? 'bg-rose-50 text-rose-700 shadow-2xs font-bold border border-rose-200'
                : 'text-[#5D7EA1] hover:text-rose-700'
                }`}
            >
              Gaps
            </button>
            <button
              onClick={() => setLeaderboardFilterTab('high')}
              className={`flex-1 py-0.5 px-1 font-semibold rounded-lg transition ${leaderboardFilterTab === 'high'
                ? 'bg-sky-50 text-sky-800 shadow-2xs font-bold border border-sky-200'
                : 'text-[#5D7EA1] hover:text-sky-800'
                }`}
            >
              Mastery
            </button>
          </div>

          {/* "View All Players" Toggle Button */}
          <button
            onClick={() => setSelectedPlayer(null)}
            className={`w-full py-1.5 px-2.5 rounded-xl border text-[11px] font-semibold flex items-center justify-between transition-all ${selectedPlayer === null
              ? 'bg-[#0460A9] text-white border-[#0460A9] shadow-xs'
              : 'bg-white text-[#5D7EA1] border-[#0460A9]/15 hover:bg-[#F8FAFC] hover:text-[#0460A9]'
              }`}
          >
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${selectedPlayer === null ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
              All Players
            </span>
            <span className="font-mono text-[9px] bg-black/10 px-1 py-0.2 rounded">
              Unfiltered
            </span>
          </button>

          {/* Scrollable Player Cards List */}
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredPlayers.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-[#5D7EA1]">
                No players match.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedPlayer?.id === player.id;

                return (
                  <div
                    key={player.id}
                    onClick={() => handlePlayerToggle(player)}
                    className={`w-full text-left rounded-xl border p-2 transition-all cursor-pointer relative group ${isSelected
                      ? 'bg-[#EBF3FA] border-[#0460A9] ring-2 ring-[#0460A9]/30 shadow-xs'
                      : 'bg-white border-[#0460A9]/10 hover:border-[#0460A9]/30 hover:bg-[#F8FAFC]'
                      }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Rank Badge */}
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold ${player.rank === 1
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : player.rank <= 3
                            ? 'bg-sky-100 text-sky-900 border border-sky-300'
                            : 'bg-gray-100 text-gray-700'
                          }`}>
                          #{player.rank}
                        </span>

                        <ProfileAvatar displayName={player.displayName} photoURL={player.photoUrl} size={24} />

                        <div className="min-w-0">
                          <div className="font-bold text-[11px] text-[#16324F] truncate group-hover:text-[#0460A9] transition-colors">
                            {player.displayName}
                          </div>
                        </div>
                      </div>

                      {/* Score & Accuracy */}
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-[11px] text-[#0460A9]">
                          {player.score} pts
                        </div>
                        <span className={`inline-block px-1 py-0.2 rounded font-mono text-[9px] font-bold ${player.accuracy >= 75
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : player.accuracy >= 50
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}>
                          {player.accuracy}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* -------------------------------------------------------------
            3. RIGHT COMPONENT: CLINICAL HEATMAP & QUESTION TABLE (EXPANDED)
        -------------------------------------------------------------- */}
        <main className="lg:col-span-9 xl:col-span-9 space-y-6">

          {/* MATRIX COMPONENT CARD */}
          <section className="rounded-3xl bg-white border border-[#0460A9]/15 p-4 sm:p-5 shadow-[0_4px_24px_rgba(4,96,169,0.04)] space-y-4">

            {/* Matrix Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0460A9]/10 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0460A9]/10 text-[#0460A9]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-[#16324F] tracking-tight">
                    Topic Understanding Breakdown
                  </h2>
                </div>
                <p className="text-xs text-[#5D7EA1] mt-0.5">
                  {selectedPlayer ? (
                    <span>
                      Filtered for <span className="font-semibold text-[#0460A9]">{selectedPlayer.displayName}</span>. Click selected card again to view all topics.
                    </span>
                  ) : selectedCompareSession ? (
                    <span>
                      Cross-session topic benchmark vs <span className="font-semibold text-indigo-700">{selectedCompareSession.cohort_label || selectedCompareSession.name}</span>.
                    </span>
                  ) : (
                    <span>
                      Performance across clinical topics. Click any topic card to filter questions below.
                    </span>
                  )}
                </p>
              </div>

              {/* Matrix Filter Tag Pill */}
              <div className="flex items-center gap-2 self-start sm:self-auto bg-[#F4F8FC] border border-[#0460A9]/15 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1]">Filter:</span>
                {selectedTag ? (
                  <button
                    onClick={() => { setSelectedTag(null); setSelectedLevel(null); }}
                    className="inline-flex items-center gap-1 font-mono font-bold text-[#0460A9] bg-white px-2 py-0.5 rounded border border-[#0460A9]/20 shadow-2xs hover:text-rose-700 transition"
                    title="Click to unfilter tag"
                  >
                    <span>{selectedTag}{selectedLevel ? ` × ${selectedLevel.toUpperCase()}` : ''}</span>
                    <span className="text-xs">✕</span>
                  </button>
                ) : (
                  <span className="font-mono font-semibold text-[#0D8C6D] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    All Tags
                  </span>
                )}
              </div>
            </div>

            {/* Grouped Tag Cards — each card is a clickable filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {CLINICAL_TAGS.map((tag) => {

                // ── Compute exact question count & score (individual for selected player or cohort) ──
                const tagQuestions = effectiveQuestions.filter((q) => q.tag === tag);
                const count = tagQuestions.length;

                const playerHasGap = selectedPlayer?.gapTags.includes(tag);
                const overallScore = selectedPlayer
                  ? selectedPlayer.accuracy === 0
                    ? 0
                    : playerHasGap
                      ? Math.min(45, Math.round(selectedPlayer.accuracy * 0.6))
                      : Math.min(100, Math.round(selectedPlayer.accuracy * 1.05))
                  : count > 0
                    ? Math.round(tagQuestions.reduce((acc, q) => acc + q.understandingScore, 0) / count)
                    : 0;

                // Benchmark comparison values for this domain
                const compareScore = selectedCompareSession?.tag_scores?.[tag] ?? null;
                const scoreDelta = compareScore !== null ? overallScore - compareScore : null;

                // ── Derive group-level color theme from overall score ──────────
                const isCardSelected = selectedTag === tag;
                const groupTheme = count === 0
                  ? {
                    cardBorder: 'border-gray-200',
                    activeRing: 'ring-2 ring-gray-400 border-gray-300 shadow-md',
                    headerBg: 'from-gray-50/70 to-gray-100/40',
                    tagBadge: 'bg-gray-100/90 text-gray-700 border-gray-300',
                    scoreColor: 'text-gray-500',
                    arcFill: '#9CA3AF',
                    arcTrack: '#E5E7EB',
                    statusLabel: 'No Questions',
                    statusBadge: 'bg-gray-50 text-gray-700 border-gray-200',
                  }
                  : overallScore < 50
                    ? {
                      cardBorder: 'border-rose-200',
                      activeRing: 'ring-2 ring-rose-500 border-rose-300 shadow-md',
                      headerBg: 'from-rose-50/70 to-rose-100/40',
                      tagBadge: 'bg-rose-100/90 text-rose-800 border-rose-300',
                      scoreColor: 'text-rose-700',
                      arcFill: '#E11D48',
                      arcTrack: '#FFE4E6',
                      statusLabel: 'Critical Gap',
                      statusBadge: 'bg-rose-50 text-rose-700 border-rose-200',
                    }
                    : overallScore < 75
                      ? {
                        cardBorder: 'border-amber-200',
                        activeRing: 'ring-2 ring-amber-500 border-amber-300 shadow-md',
                        headerBg: 'from-amber-50/70 to-amber-100/40',
                        tagBadge: 'bg-amber-100/90 text-amber-800 border-amber-300',
                        scoreColor: 'text-amber-700',
                        arcFill: '#D97706',
                        arcTrack: '#FEF3C7',
                        statusLabel: 'Moderate',
                        statusBadge: 'bg-amber-50 text-amber-800 border-amber-200',
                      }
                      : {
                        cardBorder: 'border-sky-200',
                        activeRing: 'ring-2 ring-sky-500 border-sky-300 shadow-md',
                        headerBg: 'from-sky-50/70 to-sky-100/40',
                        tagBadge: 'bg-sky-100/90 text-sky-800 border-sky-300',
                        scoreColor: 'text-sky-700',
                        arcFill: '#0284C7',
                        arcTrack: '#E0F2FE',
                        statusLabel: 'Mastery',
                        statusBadge: 'bg-sky-50 text-sky-800 border-sky-200',
                      };

                const tagMeta: Record<string, { description: string; icon: string }> = {
                  '#SGLT2i-Dosage': { description: 'Cardio-Renal Protocol & Thresholds', icon: '🫀' },
                  '#LDL-Targets': { description: 'Lipidology Goals & Risk Stratification', icon: '🧪' },
                  '#HeartDisease-Symptoms': { description: 'Heart Failure Signs & Clinical Symptoms', icon: '🩺' },
                  '#Nutrition-Guidelines': { description: 'Preventive Lifestyle & Dietary Management', icon: '🥗' },
                };
                const meta = tagMeta[tag] ?? { description: tag, icon: '📊' };

                // SVG arc values for the sleek circular progress ring
                const radius = 15;
                const circumference = 2 * Math.PI * radius;
                const dashOffset = circumference - (overallScore / 100) * circumference;

                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagToggle(tag)}
                    title={isCardSelected ? `Click to unfilter ${tag}` : `Filter questions by ${tag}`}
                    className={`w-full text-left rounded-2xl border bg-white overflow-hidden transition-all duration-200 focus:outline-none relative group ${isCardSelected
                      ? `${groupTheme.activeRing}`
                      : `${groupTheme.cardBorder} hover:shadow-md hover:border-[#0460A9]/30 hover:scale-[1.01]`
                      }`}
                  >
                    {/* Active indicator top bar */}
                    {isCardSelected && (
                      <div
                        className="h-1 w-full"
                        style={{ backgroundColor: groupTheme.arcFill }}
                      />
                    )}

                    {/* Card body */}
                    <div className={`bg-gradient-to-br ${groupTheme.headerBg} p-3 flex flex-col justify-between gap-2.5`}>

                      {/* Top Row: Tag Icon & Badge + Delta Badge (if comparing) */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm shrink-0">{meta.icon}</span>
                          <span className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded-md border ${groupTheme.tagBadge} truncate`}>
                            {tag}
                          </span>
                        </div>

                        {scoreDelta !== null && (
                          <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${scoreDelta >= 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}>
                            {scoreDelta >= 0 ? `+${scoreDelta}% ↗` : `${scoreDelta}% ↘`}
                          </span>
                        )}
                      </div>

                      {/* Middle/Bottom Row: Tag Description & Comparison / Gauge */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="min-w-0 pr-1 flex-1">
                          <p className="text-[11px] font-semibold text-[#16324F] leading-tight line-clamp-2">
                            {meta.description}
                          </p>

                          {/* Dual Comparison Metrics (if in benchmark mode) */}
                          {selectedCompareSession && compareScore !== null ? (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-mono">
                                <span className="text-[#0460A9] font-bold">Current: {overallScore}%</span>
                                <span className="text-gray-500">Benchmark: {compareScore}%</span>
                              </div>
                              {/* Duel Progress Bars */}
                              <div className="space-y-0.5">
                                <div className="w-full bg-gray-200/80 rounded-full h-1 overflow-hidden">
                                  <div className="bg-[#0460A9] h-full rounded-full" style={{ width: `${overallScore}%` }} />
                                </div>
                                <div className="w-full bg-gray-200/80 rounded-full h-1 overflow-hidden">
                                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${compareScore}%` }} />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[9px] text-[#5D7EA1] mt-1 font-mono">
                              {count} {count === 1 ? 'question' : 'questions'}
                            </p>
                          )}
                        </div>

                        {/* Mini Circular Gauge (only when not in detailed duel bar mode) */}
                        {!selectedCompareSession && (
                          <div className="relative shrink-0 flex items-center justify-center">
                            <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
                              <circle cx="19" cy="19" r={radius} fill="none" stroke={groupTheme.arcTrack} strokeWidth="3.5" />
                              <circle cx="19" cy="19" r={radius} fill="none" stroke={groupTheme.arcFill} strokeWidth="3.5"
                                strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset}
                                style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className={`text-[10px] font-extrabold font-mono leading-none ${groupTheme.scoreColor}`}>
                                {overallScore}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend Footnote */}
            <div className="pt-2.5 border-t border-[#0460A9]/10 flex flex-wrap items-center justify-between text-xs text-[#5D7EA1] gap-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="font-bold text-[#16324F]">Tiers:</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;50% Critical Gap</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 50–75% Moderate</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> &gt;75% Mastery</span>
              </div>
              <span className="text-[11px] text-[#5D7EA1] italic">Click a tag card to filter questions · Click again to view all.</span>
            </div>

          </section>


          {/* -------------------------------------------------------------
              FILTERED QUESTION ANALYSIS TABLE
          -------------------------------------------------------------- */}
          <section className="rounded-3xl bg-white border border-[#0460A9]/15 p-5 sm:p-6 shadow-[0_4px_24px_rgba(4,96,169,0.04)] space-y-4">

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0460A9]/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-[#16324F] tracking-tight flex items-center gap-2">
                  <span>Filtered Question Analysis Table</span>
                  <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-[#EBF3FA] text-[#0460A9]">
                    {filteredQuestions.length} Items Listed
                  </span>
                  {selectedCompareSession && (
                    <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Cross-Cohort Error Delta Active
                    </span>
                  )}
                </h3>
                <p className="text-xs text-[#5D7EA1] mt-0.5">
                  {selectedPlayer
                    ? `Showing responses and distractor breakdown for ${selectedPlayer.displayName}.`
                    : selectedCompareSession
                      ? `Comparing question friction between current session and ${selectedCompareSession.cohort_label || selectedCompareSession.name}.`
                      : 'Showing cohort distractor breakdowns and cognitive friction metrics.'
                  }
                </p>
              </div>

              {/* Table Quick Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search questions or nodes..."
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  className="w-48 sm:w-150 pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[#F8FAFC] border border-[#0460A9]/20 text-[#16324F] placeholder-[#5D7EA1] focus:outline-none focus:ring-2 focus:ring-[#0460A9]"
                />
                <svg className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#5D7EA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#0460A9]/15 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-[#5D7EA1] font-mono">
                    <th className="py-3 px-3 w-48">Branch View & Node</th>
                    <th className="py-3 px-3 min-w-[340px]">Question Text & Context</th>
                    <th className="py-3 px-2 text-center w-28">Answer Time</th>
                    <th className="py-3 px-2 text-center w-36">
                      {selectedPlayer ? 'Result' : selectedCompareSession ? 'Error Rate & Delta' : 'Error Rate %'}
                    </th>
                    <th className="py-3 px-3 w-64">Distractor Breakdown</th>
                    <th className="py-3 px-3 text-right w-24"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#0460A9]/10 text-xs">
                  {filteredQuestions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-xs text-[#5D7EA1]">
                        No question nodes match the selected matrix query and search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredQuestions.map((q) => {
                      const isExpanded = expandedRowId === q.id;
                      const playerResponse = selectedPlayer ? playerResponseMap.get(q.id) || null : null;

                      // Comparison deltas for this question node
                      const benchmarkError = selectedCompareSession?.node_error_rates?.[q.id] ?? Math.min(95, q.errorRatePercent + 14);
                      const errorDelta = q.errorRatePercent - benchmarkError; // negative = improved (lower error)
                      const benchmarkTime = selectedCompareSession?.node_avg_times?.[q.id] ?? Math.round(q.avgTimeSeconds * 1.25);

                      return (
                        <React.Fragment key={q.id}>
                          <tr
                            onClick={() => setExpandedRowId(isExpanded ? null : q.id)}
                            className={`transition-colors hover:bg-[#F4F8FC] cursor-pointer ${isExpanded ? 'bg-[#F4F8FC]/80' : ''
                              }`}
                          >
                            {/* Branch View & Data Node */}
                            <td className="py-3.5 px-3 align-top">
                              <div className="flex flex-col gap-1">
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#EBF3FA] border border-[#0460A9]/20 text-[#0460A9] w-fit">
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                  <span className="font-mono font-bold text-[11px]">{q.nodeCode}</span>
                                </div>
                                <div className="text-[10px] text-[#5D7EA1] font-mono truncate">
                                  {q.branchLabel}
                                </div>
                              </div>
                            </td>

                            {/* Question Text & Context */}
                            <td className="py-3.5 px-3 align-top min-w-[340px] max-w-xl">
                              <div className="font-semibold text-[#16324F] text-xs sm:text-[13px] leading-relaxed">
                                {q.questionText}
                              </div>
                              <div className="mt-1.5 text-[11px] text-[#5D7EA1] flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[#0460A9] font-bold bg-[#EBF3FA] px-1.5 py-0.5 rounded text-[10px]">
                                  {q.tag}
                                </span>
                                {q.clinicalScenario && q.clinicalScenario !== q.questionText && (
                                  <>
                                    <span>·</span>
                                    <span className="italic text-[#5D7EA1]">{q.clinicalScenario}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Avg Time / Comparison Time / Player Time */}
                            <td className="py-3.5 px-2 align-top text-center">
                              {selectedPlayer && playerResponse ? (
                                <>
                                  <div className="font-mono font-bold text-xs text-[#16324F]">
                                    {playerResponse.timeSeconds}s
                                  </div>
                                  <div className="text-[9px] text-[#5D7EA1] mt-0.5">
                                    tgt: {q.targetTimeSeconds}s
                                  </div>
                                </>
                              ) : selectedCompareSession ? (
                                <div className="space-y-0.5">
                                  <div className="font-mono font-bold text-xs text-[#0460A9]">
                                    {q.avgTimeSeconds}s <span className="text-[10px] text-gray-400 font-normal">vs {benchmarkTime}s</span>
                                  </div>
                                  <div className="text-[9px] text-[#5D7EA1]">
                                    {q.avgTimeSeconds <= benchmarkTime ? `${benchmarkTime - q.avgTimeSeconds}s faster` : `+${q.avgTimeSeconds - benchmarkTime}s slower`}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="font-mono font-bold text-xs text-[#16324F]">
                                    {q.avgTimeSeconds}s
                                  </div>
                                  <div className="text-[9px] text-[#5D7EA1] mt-0.5">
                                    tgt: {q.targetTimeSeconds}s
                                  </div>
                                </>
                              )}
                            </td>

                            {/* Error Rate / Delta / Player Result */}
                            <td className="py-3.5 px-2 align-top text-center">
                              {selectedPlayer && playerResponse ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${playerResponse.isCorrect
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}>
                                  {playerResponse.isCorrect ? '✓ Correct' : '✕ Missed'}
                                </span>
                              ) : selectedCompareSession ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="font-mono font-bold text-xs text-[#16324F]">
                                    {q.errorRatePercent}% <span className="text-[10px] text-gray-400 font-normal">vs {benchmarkError}%</span>
                                  </div>
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full font-mono text-[9px] font-bold border ${errorDelta <= 0
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}>
                                    {errorDelta <= 0 ? `${Math.abs(errorDelta)}% lower error` : `+${errorDelta}% friction`}
                                  </span>
                                </div>
                              ) : (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-bold text-[10px] ${q.errorRatePercent >= 50
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border border-amber-200'
                                  }`}>
                                  {q.errorRatePercent}%
                                </span>
                              )}
                            </td>

                            {/* Distractor Breakdown Bar / Individual Player Choice */}
                            <td className="py-3.5 px-3 align-top">
                              {selectedPlayer && playerResponse ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${playerResponse.isCorrect ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
                                      }`}>
                                      Option {playerResponse.selectedOption}
                                    </span>
                                    <span className="text-[11px] font-semibold text-[#16324F] truncate max-w-[150px]">
                                      {q.distractors.find((d) => d.key === playerResponse.selectedOption)?.text || `Option ${playerResponse.selectedOption}`}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#5D7EA1]">
                                    Selected by <span className="font-semibold text-[#0460A9]">{selectedPlayer.displayName}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 border border-gray-200">
                                    {q.distractors.map((choice) => (
                                      <div
                                        key={choice.key}
                                        style={{ width: `${choice.percentage}%` }}
                                        className={`h-full transition-all ${choice.isCorrect ? 'bg-[#0D8C6D]' : 'bg-rose-400/80'
                                          }`}
                                        title={`${choice.key}: ${choice.percentage}%`}
                                      />
                                    ))}
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-[#5D7EA1]">
                                    <span className="truncate max-w-[140px]">
                                      Trap: <span className="font-mono font-semibold text-[#16324F]">{q.primaryDistractorKey}</span> ({q.primaryDistractorSummary})
                                    </span>
                                    <span className="font-mono font-semibold text-[#0D8C6D]">
                                      {q.distractors.find((d) => d.isCorrect)?.percentage || 0}% Correct
                                    </span>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Expandable Details Button */}
                            <td className="py-3.5 px-3 align-middle text-right">
                              <button
                                className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all inline-flex items-center gap-1.5 ${isExpanded
                                  ? 'bg-[#0460A9] text-white border-[#0460A9] shadow-2xs'
                                  : 'bg-[#F4F8FC] text-[#0460A9] border-[#0460A9]/20 hover:bg-[#EBF3FA]'
                                  }`}
                                title="Expand question details & distractor diagnostics"
                              >
                                <span>{isExpanded ? 'Hide' : 'Details'}</span>
                                <svg
                                  className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </td>
                          </tr>

                          {/* EXPANDABLE PEDAGOGICAL DEEP INSPECTION DRAWER */}
                          {isExpanded && (
                            <tr className="bg-[#F8FAFC]">
                              <td colSpan={6} className="p-4 border-y border-[#0460A9]/10">
                                <div className="rounded-2xl bg-white border border-[#0460A9]/15 p-4 shadow-2xs space-y-3">
                                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                    <span className="text-xs font-bold text-[#16324F]">
                                      Choice Distribution & Cognitive Trap Diagnostics
                                    </span>
                                    <span className="text-[11px] text-[#5D7EA1] font-mono">
                                      Node: {q.nodeCode} · {q.branchLabel}
                                    </span>
                                  </div>

                                  <div className="space-y-1.5">
                                    {q.distractors.map((choice) => {
                                      const isPlayerChoice = selectedPlayer && playerResponse?.selectedOption === choice.key;

                                      return (
                                        <div
                                          key={choice.key}
                                          className={`p-2 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${isPlayerChoice
                                            ? choice.isCorrect
                                              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-300'
                                              : 'bg-rose-50 border-rose-300 ring-2 ring-rose-300'
                                            : choice.isCorrect
                                              ? 'bg-emerald-50/60 border-emerald-200'
                                              : 'bg-gray-50 border-gray-200'
                                            }`}
                                        >
                                          <div className="flex items-start gap-2">
                                            <span className={`w-5 h-5 rounded flex items-center justify-center font-mono font-bold text-xs shrink-0 ${choice.isCorrect ? 'bg-[#0D8C6D] text-white' : 'bg-gray-200 text-gray-800'
                                              }`}>
                                              {choice.key}
                                            </span>
                                            <div>
                                              <span className="font-medium text-[#16324F]">{choice.text}</span>
                                              {isPlayerChoice && (
                                                <span className="ml-2 inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-[#0460A9] text-white">
                                                  Selected by {selectedPlayer?.displayName}
                                                </span>
                                              )}
                                              {choice.clinicalNote && (
                                                <div className="text-[10px] text-rose-700 italic mt-0.5">
                                                  Cognitive Trap: {choice.clinicalNote}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono font-bold text-xs">{choice.percentage}%</span>
                                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${choice.isCorrect ? 'bg-[#0D8C6D] text-white' : 'bg-gray-200 text-gray-700'
                                              }`}>
                                              {choice.isCorrect ? 'Correct' : 'Distractor'}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Speaker Recommendation */}
                                  <div className="rounded-xl bg-[#EBF3FA] border border-[#0460A9]/20 p-2.5 flex items-start gap-2 text-xs">
                                    <span className="text-[#0460A9] font-bold">Speaker Pearl:</span>
                                    <span className="text-[#16324F]">{q.pedagogicalAction}</span>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </section>

        </main>

      </div>

      {/* =============================================================
          MODAL: SESSION BENCHMARK & COMPARISON SELECTOR
      ============================================================== */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl border border-[#0460A9]/20 shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#0460A9]/10 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 font-bold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-bold text-[#16324F]">
                    Compare With Another Session (Same Quiz)
                  </h3>
                  <p className="text-xs text-[#5D7EA1]">
                    Select any past or parallel session running this quiz to compare cohort guideline adherence, clinical domains, and friction deltas.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowCompareModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Current Active Session Card */}
            <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-[#0460A9] tracking-wider">
                  Current Session (Anchor)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#0460A9] text-white">
                  Active
                </span>
              </div>
              <div className="font-bold text-sm text-[#16324F]">{sessionTitle}</div>
              <div className="text-[11px] text-[#5D7EA1] flex flex-wrap items-center gap-2">
                <span>{session?.id || 'SES-NOVAR-7841'}</span>
                <span>·</span>
                <span>{activePlayersCount} Attendees</span>
                <span>·</span>
                <span className="text-emerald-700 font-semibold">68.2% Accuracy</span>
              </div>
            </div>

            {/* Available Sessions for Comparison */}
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#5D7EA1]">
                Available Peer Sessions ({availableCompareSessions.length}):
              </div>

              <div className="space-y-2.5">
                {availableCompareSessions.map((peer) => {
                  const isSelected = selectedCompareSession?.id === peer.id;

                  return (
                    <div
                      key={peer.id}
                      className={`p-4 rounded-2xl border transition-all text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isSelected
                        ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-300'
                        : 'bg-[#F8FAFC] border-[#0460A9]/15 hover:border-indigo-300 hover:bg-indigo-50/30'
                        }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#16324F] truncate">
                            {peer.name}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {peer.cohort_label || 'Peer Session'}
                          </span>
                        </div>

                        <div className="text-[11px] text-[#5D7EA1] flex flex-wrap items-center gap-2">
                          <span className="font-mono">{peer.id}</span>
                          <span>·</span>
                          <span>{peer.participant_count || 24} Attendees</span>
                          <span>·</span>
                          <span className="font-semibold text-indigo-700">{peer.avg_accuracy || 65}% Accuracy</span>
                          <span>·</span>
                          <span>Dominant: {peer.dominant_archetype || 'Balanced Clinician'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSelected ? (
                          <button
                            onClick={() => {
                              setSelectedCompareSession(null);
                              setShowCompareModal(false);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100 transition"
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedCompareSession(peer);
                              setShowCompareModal(false);
                            }}
                            className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-xs"
                          >
                            Compare
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-[#0460A9]/10 flex items-center justify-between text-xs">
              <span className="text-[#5D7EA1] text-[11px]">
                Comparing calculates live cross-cohort deltas across all clinical domains and question traps.
              </span>
              <button
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

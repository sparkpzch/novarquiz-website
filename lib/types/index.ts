import { SessionStatus } from '../constants/session';
import type {
  AllowedUsage,
  ConsentPurposes,
  HcpVectorMap,
  ReviewStatus,
} from '../analytics/hcp';

// ===================== Database Types =====================

export interface Quiz {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  cover_image_path: string | null;
  timer_seconds: number | null;
  is_published: boolean;
  /** Present choices in a randomised order. Display only — `Choice.label` is unchanged. */
  shuffle_choices?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  slug: string | null;
  question_count?: number;
  play_count?: number;
  avg_score?: number;
  creator_name?: string;
}


export interface Question {
  id: string;
  /** Server-issued proof that this player reached this question. */
  question_token?: string;
  session_id: string;
  question_order: number;
  question_text: string;
  node_name: string | null;
  media_type: 'image' | 'gif' | 'video' | null;
  media_url: string | null;
  media_path: string | null;
  timer_override: number | null;
  session_timer_seconds: number | null;
  is_entry_point: boolean;
  node_x: number;
  node_y: number;
  node_type: 'normal' | 'situation' | 'end';
  created_at: string;
  updated_at: string;
  choices: Choice[];
}



export interface Choice {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  choice_text: string;
  score_impact: number;
  explanation: string;
  /** @deprecated use score_impact */
  points?: number;
  behavior_meaning?: string | null;
  vector_deltas?: HcpVectorMap;
  clinical_tags?: string[];
  confidence_weight?: number;
  allowed_usage?: AllowedUsage;
  requires_hcp_version?: boolean;
  review_status?: ReviewStatus;
}

export interface QuestionConnection {
  id: string;
  session_id: string;
  from_question_id: string;
  from_choice_label: 'A' | 'B' | 'C' | 'D';
  to_question_id: string;
}

export interface UserAnswer {
  id: string;
  session_id: string;
  user_id: string;
  question_id: string;
  chosen_label: 'A' | 'B' | 'C' | 'D';
  // Time spent on the question (count-up timer). Recorded for analytics only;
  // does NOT affect points_earned.
  time_taken_ms: number;
  // Equal to the picked choice's `points` value. Can be negative.
  points_earned: number;
  answered_at: string;
  vector_scores?: HcpVectorMap;
  behavior_meaning_snapshot?: string | null;
  allowed_usage_snapshot?: AllowedUsage;
}

export interface LeaderboardEntry {
  id: string;
  session_id: string;
  user_id: string;
  user_display_name: string;
  user_photo_url: string | null;
  total_score: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  streak: number;
  total_time_ms: number;
  completed_at: string;
  // Set by the public leaderboard API for the viewer's own row, since user_id
  // is anonymized there.
  is_me?: boolean;
  profile_vector_scores?: HcpVectorMap;
  normalized_vector_scores?: HcpVectorMap;
  archetype_id?: string | null;
  insight_classification?: 'aggregate' | 'pseudonymous' | 'identified';
}

export interface Session {
  id: string;
  session_id: string;
  name?: string;
  description?: string | null;
  user_id: string;
  current_question_id: string | null;
  current_score: number;
  current_streak: number;
  started_at: string;
  finished_at: string | null;
  is_private: boolean;
  pin_code: string | null;
  share_token: string | null;
  user_name?: string;
  status: SessionStatus;
  question_count?: number;
  cover_image_url?: string | null;
  timer_seconds?: number | null;
  slug?: string;
}

// ===================== Firebase / Auth Types =====================

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  language: 'en' | 'th';
  createdAt: string;
}

export interface UserConsentProfile {
  consented: boolean;
  tos_version: string | null;
  privacy_version: string | null;
  analytics_notice_version?: string | null;
  profiling_notice_version?: string | null;
  consent_purposes?: ConsentPurposes;
}

// ===================== Node Graph Editor Types =====================

export interface GraphNode {
  id: string;
  question: Question;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  fromChoiceLabel: 'A' | 'B' | 'C' | 'D';
  toNodeId: string;
}

// ===================== Database Types =====================

export interface QuestionSession {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  timer_seconds: number | null;
  is_published: boolean;
  is_private: boolean;
  pin_code: string;
  share_token: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  question_count?: number;
  play_count?: number;
  avg_score?: number;
}

export interface Question {
  id: string;
  session_id: string;
  question_order: number;
  question_text: string;
  media_type: 'image' | 'video' | null;
  media_url: string | null;
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
  // Signed points awarded when this choice is picked. Final score = sum of
  // points across all picked choices. Default 0, negative allowed.
  points: number;
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
}

export interface PlaySession {
  id: string;
  session_id: string;
  user_id: string;
  current_question_id: string | null;
  current_score: number;
  current_streak: number;
  started_at: string;
  finished_at: string | null;
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

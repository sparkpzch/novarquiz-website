export const queryKeys = {
  sessions: ['sessions'] as const,
  session: (sessionId: string) => ['sessions', sessionId] as const,
  quizzes: ['quizzes'] as const,
  quizGraph: (quizId: string) => ['quizzes', quizId, 'graph'] as const,
  muxUpload: (uploadId: string) => ['mux', 'uploads', uploadId] as const,
};

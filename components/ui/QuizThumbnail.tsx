/** Shared, neutral cover for quizzes without an uploaded image. */
export default function QuizThumbnail() {
  return <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-500" aria-hidden="true">
    <svg viewBox="0 0 64 48" fill="none" className="h-12 w-16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="58" height="42" rx="6" />
      <circle cx="19" cy="16" r="4" />
      <path d="m5 36 15-13 11 9 12-15 16 19" />
    </svg>
  </div>;
}

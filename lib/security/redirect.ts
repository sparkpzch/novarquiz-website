export function safeRedirectPath(value: string | null, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const base = 'https://redirect.invalid';
    const destination = new URL(value, base);
    return destination.origin === base ? value : fallback;
  } catch {
    return fallback;
  }
}

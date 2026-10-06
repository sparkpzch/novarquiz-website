export type Theme = 'light' | 'dark';
export const THEME_KEY = 'novarquiz-theme';
export function resolveTheme(...values: unknown[]): Theme {
  return values.find((value): value is Theme => value === 'dark' || value === 'light') ?? 'light';
}

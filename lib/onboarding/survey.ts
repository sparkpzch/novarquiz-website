import { z } from 'zod';

export const SURVEY_VERSION = '2026-10-v1';
export const SurveySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  age: z.number().int().min(1).max(120).nullable(),
  gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']),
  weightKg: z.number().min(1).max(500).nullable(),
  heightCm: z.number().min(30).max(250).nullable(),
  activity: z.enum(['low', 'moderate', 'high', 'prefer_not_to_say']),
  analyticsConsent: z.boolean(),
}).strict();
export type SurveyInput = z.infer<typeof SurveySchema>;
export type SurveyRecord = SurveyInput & { version: string };
export type ChartBin = { label: string; count: number };
export type DemographicsReport = {
  total: number; completed: number; consenting: number;
  age: ChartBin[]; gender: ChartBin[]; weight: ChartBin[]; height: ChartBin[]; activity: ChartBin[];
};

export function summarizeSurveys(total: number, surveys: SurveyInput[]): DemographicsReport {
  const consenting = surveys.filter(s => s.analyticsConsent);
  const bins = (labels: string[], pick: (s: SurveyInput) => number) => labels.map((label, index) => ({ label, count: consenting.filter(s => pick(s) === index).length }));
  return {
    total, completed: surveys.length, consenting: consenting.length,
    age: bins(['<18', '18–29', '30–44', '45–59', '60+', 'Not stated'], s => s.age === null ? 5 : s.age < 18 ? 0 : s.age < 30 ? 1 : s.age < 45 ? 2 : s.age < 60 ? 3 : 4),
    gender: bins(['Female', 'Male', 'Other', 'Not stated'], s => ['female', 'male', 'other', 'prefer_not_to_say'].indexOf(s.gender)),
    weight: bins(['<50 kg', '50–69 kg', '70–89 kg', '90+ kg', 'Not stated'], s => s.weightKg === null ? 4 : s.weightKg < 50 ? 0 : s.weightKg < 70 ? 1 : s.weightKg < 90 ? 2 : 3),
    height: bins(['<150 cm', '150–164 cm', '165–179 cm', '180+ cm', 'Not stated'], s => s.heightCm === null ? 4 : s.heightCm < 150 ? 0 : s.heightCm < 165 ? 1 : s.heightCm < 180 ? 2 : 3),
    activity: bins(['Low', 'Moderate', 'High', 'Not stated'], s => ['low', 'moderate', 'high', 'prefer_not_to_say'].indexOf(s.activity)),
  };
}

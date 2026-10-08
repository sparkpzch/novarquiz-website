"use client";

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import '@/lib/i18n';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Each streamed auth boundary starts in the server language before using the saved preference.
export function useAuthTranslation() {
  const { i18n } = useTranslation();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const language = hydrated ? i18n.language : 'en';
  return { t: i18n.getFixedT(language), i18n, language };
}

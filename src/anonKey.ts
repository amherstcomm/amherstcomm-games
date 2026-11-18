// The key a fully anonymous survey files your answers under (the survey spec,
// November 2026).
//
// 32 random bytes, made the first time you answer a given survey and kept in
// this browser. Each answer goes to the server with it; the server checks it
// against a fingerprint it stored the first time, files the answer under a
// fingerprint of the key and the question, and keeps the key itself nowhere.
// So the same browser can find and change its answers, and nothing on the
// server leads from an answer to a person.
//
// Kept through site storage, so it follows the storage choice: with
// "essentials only" it lasts as long as the tab. Answers already given still
// count without it; they just can no longer be changed.
import { store } from '@/siteStorage';

const slot = (session: string) => `anagrimoire:survey-key:${session}`;
const WELL_FORMED = /^[0-9a-f]{64}$/;

/** The key this browser answered a survey with, if it has one. */
export function surveyKey(session: string): string | null {
  const k = store.getItem(slot(session));
  return k && WELL_FORMED.test(k) ? k : null;
}

/** That key, made now if this browser has never answered the survey. */
export function ensureSurveyKey(session: string): string {
  const have = surveyKey(session);
  if (have) return have;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const k = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  store.setItem(slot(session), k);
  return k;
}

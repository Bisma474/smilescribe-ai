// Cosmetic display helpers derived from real Patient fields. These were
// previously (incorrectly) expected to be persisted database columns
// (name, meta, initials, badge, badge_text, bg, color) — they aren't real
// data, just presentation, so they're computed here instead.
import type { Patient } from './apiClient';

export function patientName(p: Pick<Patient, 'first_name' | 'last_name'>): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

export function patientInitials(p: Pick<Patient, 'first_name' | 'last_name'>): string {
  return `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
}

// A short one-line summary shown under a patient's name in list views.
export function patientMeta(p: Pick<Patient, 'dob' | 'risk_level'>): string {
  const parts: string[] = [];
  if (p.dob) parts.push(`DOB: ${p.dob}`);
  if (p.risk_level) parts.push(`${p.risk_level} risk`);
  return parts.join(' · ') || 'No details on file';
}

const RISK_STYLES: Record<string, { badge: string; bg: string; color: string }> = {
  high: { badge: 'badge-warn', bg: '#FEEEEE', color: '#A03030' },
  normal: { badge: 'badge-gray', bg: 'rgba(74,191,176,0.12)', color: 'var(--teal-dark)' },
  low: { badge: 'badge-teal', bg: '#E8F8F7', color: '#0F6E56' },
};

export function patientRiskStyle(riskLevel: string | null | undefined) {
  return RISK_STYLES[riskLevel || 'normal'] || RISK_STYLES.normal;
}

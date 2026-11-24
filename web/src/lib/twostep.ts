/** 0046: admins must turn on 2-step sign-in within 7 days of becoming admin. */
export const TWO_STEP_DAYS = 7;

/** Whole days left before admin access is removed (0 = it goes at the next check). */
export function daysLeft(adminSince: string | null | undefined, now = Date.now()): number {
  if (!adminSince) return TWO_STEP_DAYS;
  const used = Math.floor((now - Date.parse(adminSince)) / 86_400_000);
  return Math.max(0, TWO_STEP_DAYS - used);
}

export function daysLeftText(n: number): string {
  if (n <= 0) return 'Admin access is being removed today.';
  if (n === 1) return 'Last day: admin access is removed tomorrow.';
  return `${n} days left, then admin access is removed.`;
}

export const policyRoutes = [
  'STRAIGHT_THROUGH',
  'HUMAN_APPROVAL',
  'BLOCK',
] as const;

export type PolicyRoute = (typeof policyRoutes)[number];

export type VerificationMode = 'NOT_REQUIRED' | 'REQUIRED';

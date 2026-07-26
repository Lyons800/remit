import { describe, expect, it } from 'vitest';

import { createCompanySlug } from './company-slug.js';

describe('createCompanySlug', () => {
  it('creates a stable URL-safe company prefix', () => {
    expect(createCompanySlug('Padel Perú, Lda.', 'A1B2C3D4')).toBe(
      'padel-peru-lda-a1b2c3d4',
    );
  });

  it('uses a safe fallback for names without Latin letters or numbers', () => {
    expect(createCompanySlug('---', '12345678')).toBe('company-12345678');
  });

  it('rejects a weak uniqueness suffix', () => {
    expect(() => createCompanySlug('InvoiceGuard', 'bad')).toThrow(
      'Company slug suffix must contain at least six characters',
    );
  });
});

const MAXIMUM_SLUG_PREFIX_LENGTH = 48;

export function createCompanySlug(
  companyName: string,
  uniqueSuffix: string,
): string {
  const prefix = companyName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAXIMUM_SLUG_PREFIX_LENGTH)
    .replace(/-$/g, '');
  const safeSuffix = uniqueSuffix
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

  if (safeSuffix.length < 6) {
    throw new Error('Company slug suffix must contain at least six characters');
  }

  return `${prefix || 'company'}-${safeSuffix}`;
}

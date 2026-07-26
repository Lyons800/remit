import { describe, expect, it } from 'vitest';

import { redactHumanBackings } from './identity-redaction.js';

describe('redactHumanBackings', () => {
  it('preserves same-human equality without returning a raw identifier', () => {
    const result = redactHumanBackings([
      { address: '0xa1', humanId: '0xprivate-human' },
      { address: '0xa2', humanId: '0xprivate-human' },
      { address: '0xb1', humanId: '0xother-human' },
      { address: '0xc1', humanId: null },
    ]);

    expect(result).toEqual([
      { address: '0xa1', humanClass: 'human-1' },
      { address: '0xa2', humanClass: 'human-1' },
      { address: '0xb1', humanClass: 'human-2' },
      { address: '0xc1', humanClass: null },
    ]);
    expect(JSON.stringify(result)).not.toContain('0xprivate-human');
    expect(JSON.stringify(result)).not.toContain('0xother-human');
  });

  it('assigns classes from scratch on every response', () => {
    expect(
      redactHumanBackings([{ address: '0xb1', humanId: '0xother-human' }]),
    ).toEqual([{ address: '0xb1', humanClass: 'human-1' }]);
  });
});

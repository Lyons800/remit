import { describe, expect, it } from 'vitest';

import { initialTheatre, TAMPERED_DIGEST, theatreReducer } from './demo.js';

describe('approval simulation', () => {
  it('invalidates prior approvals when the payment request changes', () => {
    const afterAna = theatreReducer(initialTheatre, {
      approver: 'A1',
      type: 'approve',
    });
    const afterMiguel = theatreReducer(afterAna, {
      approver: 'B1',
      type: 'approve',
    });

    expect(afterMiguel.counted).toEqual(['A1', 'B1']);
    expect(afterMiguel.phase).toBe('QUORUM_REACHED');

    const tampered = theatreReducer(afterMiguel, {
      digest: TAMPERED_DIGEST,
      type: 'tamper',
    });

    expect(tampered.counted).toEqual([]);
    expect(tampered.digest).toBe(TAMPERED_DIGEST);
    expect(tampered.phase).toBe('VOIDED');
  });
});

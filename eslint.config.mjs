import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      'artifacts/live/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },
  {
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/domain/**/*.ts',
      'packages/persistence/**/*.ts',
      'packages/protocol/**/*.ts',
      'packages/runtime-config/**/*.ts',
      'services/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@0gfoundation/*',
                '@hashgraph/hedera-agent-kit',
                '@hiero-ledger/*',
                '@worldcoin/*',
                '@x402/*',
              ],
              message:
                'Import sponsor SDKs only from their dedicated adapter package.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@invoiceguard/*',
                '@0gfoundation/*',
                '@hashgraph/*',
                '@hiero-ledger/*',
                '@worldcoin/*',
                '@x402/*',
                'drizzle-orm',
                'hono',
                'next',
                'react',
                'react-dom',
              ],
              message:
                'The domain package must remain pure and dependency-free.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/world-adapter/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@0gfoundation/*',
                '@hashgraph/*',
                '@hiero-ledger/*',
                '@x402/*',
              ],
              message: 'Keep non-World sponsor SDKs out of the World adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/hedera-x402-adapter/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@0gfoundation/*', '@hashgraph/*', '@worldcoin/*'],
              message:
                'Keep Agent Kit, World, and 0G out of the isolated x402 graph.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/hedera-settlement-adapter/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@0gfoundation/*', '@worldcoin/*', '@x402/*'],
              message:
                'Keep x402, World, and 0G out of the settlement SDK graph.',
            },
          ],
        },
      ],
    },
  },
);

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      'supabase',
      'src/data/remote/database.types.ts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // UI must go through the repository/command layer, never Supabase directly.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@supabase/supabase-js'], message: 'Only src/data/remote may import Supabase.' },
            { group: ['dexie-react-hooks'], message: 'Use useDbQuery from @/data/live (useLiveQuery loses change tracking in the browser).' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/data/remote/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // domain/ is pure: no imports from data, features, ui, import or React.
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/data/*', '@/features/*', '@/ui/*', '@/import/*', 'react', 'dexie', '@supabase/*'],
              message: 'domain/ must stay pure.',
            },
          ],
        },
      ],
    },
  },
);

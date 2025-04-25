import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      // Add any project-specific rule overrides here
      '@typescript-eslint/no-unused-vars': 'warn', // Example override
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
); 
module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'next/core-web-vitals',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': 'warn', // Downgrade to warning
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/no-require-imports': 'off',
    'no-console': 'warn',
    'no-debugger': 'error',
    'prefer-const': 'warn', // Downgrade to warning
    'no-var': 'warn', // Downgrade to warning
    'no-undef': 'warn', // Downgrade to warning
    'no-useless-escape': 'warn',
    'no-case-declarations': 'warn',
  },
  overrides: [
    {
      files: ['*.js'],
      env: {
        node: true,
        browser: true,
        commonjs: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'no-undef': 'off', // Allow global variables in JS files
      },
    },
    {
      files: ['pages/**/*', 'components/**/*'],
      env: {
        browser: true,
        node: true,
        es6: true,
      },
      globals: {
        React: 'readonly',
        JSX: 'readonly',
      },
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        'no-undef': 'off', // Turn off no-undef for React components as TypeScript handles this
      },
    },
    {
      files: ['pages/api/**/*'],
      env: {
        node: true,
      },
      rules: {
        'no-console': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'build/', '.next/', 'out/'],
};
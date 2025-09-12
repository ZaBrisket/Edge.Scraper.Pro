module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
    es2020: true,
    commonjs: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: ['./tsconfig.json', './next.config.js'],
  },
  plugins: ['@typescript-eslint', 'prettier'],
  globals: {
    Buffer: 'readonly',
    process: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    fetch: 'readonly',
    URL: 'readonly',
    AbortController: 'readonly',
    Response: 'readonly',
    DOMParser: 'readonly',
    performance: 'readonly',
    global: 'readonly',
    document: 'readonly',
    require: 'readonly',
    module: 'readonly',
    NodeJS: 'readonly',
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/prefer-const': 'warn',
    '@typescript-eslint/no-var-requires': 'off',
    'no-console': 'off',
    'no-debugger': 'error',
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-undef': 'off', // TypeScript handles this
    'no-unused-vars': 'off', // Use TypeScript version instead
    'no-useless-escape': 'off',
    'no-case-declarations': 'off',
  },
  overrides: [
    {
      files: ['*.js'],
      env: {
        node: true,
        commonjs: true,
      },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        'no-undef': 'error', // Re-enable for JS files
      },
    },
    {
      files: ['pages/**/*', 'components/**/*'],
      env: {
        browser: true,
        node: false,
      },
    },
    {
      files: ['src/**/*.ts'],
      env: {
        node: true,
        browser: true,
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'build/', '.next/', 'out/'],
};
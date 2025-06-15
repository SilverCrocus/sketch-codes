module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true, // Added node for .cjs file itself and common build tools
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: [
    'react',
    '@typescript-eslint',
    // react-hooks and jsx-a11y are typically included via extends
    // 'tailwindcss', // Temporarily removed due to issues with v4 alpha
  ],
  settings: {
    react: {
      version: 'detect',
    },
    // tailwindcss: {
    //   // Add callees if you use class-merging libraries like clsx or twMerge
    //   // callees: ['classnames', 'clsx', 'ctl', 'cva', 'tv', 'twMerge'],
    //   // For Tailwind CSS v4, we might not need `officialDuplicates` as much
    //   // but it's good practice to keep if using utilities that might generate them.
    //   // officialDuplicates: true,
    // },
  },
  rules: {
    // Common overrides or additions:
    'react/react-in-jsx-scope': 'off', // Not needed with React 17+ new JSX transform
    'react/prop-types': 'off', // Using TypeScript for prop types
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Add any project-specific rules here
    // Tailwind CSS rules temporarily removed
    // 'tailwindcss/classnames-order': 'warn',
    // 'tailwindcss/no-custom-classname': 'warn',
    // 'tailwindcss/no-contradicting-classname': 'error',
  },
  overrides: [
    {
      files: ['*.js', '*.cjs', '*.mjs'], // Configuration files
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};

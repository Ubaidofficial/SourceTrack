import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// Static-analysis GATE for dashboard/src (~20k lines that had ZERO static analysis).
// The ONLY error-level rule is `no-undef`: it turns the `formattedRevenue is not defined`
// white-screen class — a variable/component referenced but not in scope — into a CI
// failure BEFORE the build. `npm run build` stays green on that bug (it's a runtime
// ReferenceError, not a type error); this catches it.
//
// EVERYTHING ELSE IS WARN-ONLY on purpose. `eslint src` exits non-zero only on ERRORS, so
// the existing warning backlog (no-unused-vars, hook-dep gaps across ~47 pages) does NOT
// block CI. Those get burned down in follow-up PRs — getting the gate in is the win.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'coverage/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      // THE GATE.
      'no-undef': 'error',
      // Warn-only backlog.
      'no-unused-vars': 'warn',
      // JSX identifier tracking: a component used as <Foo/> counts as a reference, so
      // no-unused-vars doesn't false-flag imported components and no-undef sees the use.
      // Automatic JSX runtime (Vite) → React is not referenced, so it isn't required in scope.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

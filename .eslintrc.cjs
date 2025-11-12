module.exports = {
	root: true,
	env: {
		es2021: true,
		node: true,
		browser: true
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2021,
		sourceType: 'module'
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended'
	],
	plugins: ['@typescript-eslint'],
	rules: {
		'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/no-inferrable-types': 'off',
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/ban-types': 'off',
		'@typescript-eslint/no-empty-function': 'off',
		'@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
		'no-constant-condition': 'off',
		'no-case-declarations': 'off',
		'no-extra-boolean-cast': 'off',
		'no-async-promise-executor': 'off',
		'prefer-const': 'off',
		'no-mixed-spaces-and-tabs': 'off'
	},
	ignorePatterns: [
		'dist/**',
		'build/**',
		'main.js',
		'main.js.map',
		'coverage/**'
	]
};

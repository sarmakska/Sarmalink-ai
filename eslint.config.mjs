import next from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
    {
        ignores: [
            'node_modules/**',
            '.next/**',
            'coverage/**',
            'next-env.d.ts',
            'examples/**',
            'supabase/**',
        ],
    },
    ...next,
    {
        rules: {
            'react/no-unescaped-entities': 'off',
            '@next/next/no-img-element': 'off',
            'react-hooks/exhaustive-deps': 'off',
        },
    },
]

export default eslintConfig

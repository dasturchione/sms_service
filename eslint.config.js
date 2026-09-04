import { configApp } from '@adonisjs/eslint-config'

export default [
  {
    /**
     * Written by the Lucid schema generator after each migration run, so
     * linting it would flag code nobody edits.
     */
    ignores: ['database/schema.ts', '.adonisjs/**'],
  },
  ...configApp(),
]

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Couverture à 100 % sur la logique testable en Node : helpers, code serveur (src/lib, routes API) et
 * modules du moteur sans rendu. Le périmètre est volontairement listé : tout ce qui construit de la scène
 * three.js, du canvas ou de l'interface React n'est pas couvert par des tests unitaires.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: [
        'src/helpers/**/*.ts',
        'src/lib/**/*.ts',
        'src/app/api/**/route.ts',
        'src/constants/**/*.ts',
        'src/engine/bookFrame.ts',
        'src/engine/bookPatch.ts',
        'src/engine/constants.ts',
        'src/engine/cratePlacement.ts',
        'src/engine/crateOps.ts',
        'src/engine/domain.ts',
        'src/engine/history.ts',
        'src/engine/loadState.ts',
        'src/engine/orientation.ts',
        'src/engine/persistence.ts',
        'src/engine/store.ts',
        'src/engine/view.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});

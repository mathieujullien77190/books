import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Couverture à 100 % sur la logique testable en Node : helpers, code serveur (src/lib, routes API) et
 * tout le moteur (src/engine). Rien n'est exclu : le rendu WebGL et le canvas n'existent pas sous Node,
 * donc les tests du moteur les remplacent par des doubles qui enregistrent les appels :
 * - stage.ts : WebGLRenderer, PMREMGenerator et OrbitControls simulés (vérifie l'ordre des passes,
 *   le rendu à la demande, la restauration du fond, le réchauffage) ;
 * - bookTextures.ts, ghosts.ts, worldAxes.ts : faux document.createElement('canvas') à contexte 2D
 *   enregistreur (textes écrits, polices, retours à la ligne) et faux Image ;
 * - crate.ts : FontLoader et TextGeometry simulés ; mesange/index.ts : GLTFLoader simulé ;
 * - CrateEngine.ts : vrais modules du moteur et vraie scène three.js, seul Stage est remplacé ;
 *   fetch, window, localStorage et les faux timers viennent de src/test/engineHarness.ts.
 * Ce que les doubles ne prouvent pas (le rendu réel à l'écran) reste à vérifier à la main.
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
        'src/engine/**/*.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});

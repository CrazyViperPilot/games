// Generator für Level w4-33 „Riesenschildkröte“ (Boss-Level, Welt 4, Theme paradise). Schreibt ../w4-33.js.
// Aufruf: node js/data/levels/gen/w4-33.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildParadiseBossLevel } from './build-all-levels.mjs';

const def = buildParadiseBossLevel();
const here = dirname(fileURLToPath(import.meta.url));
const out = `// Level w4-33 „Riesenschildkröte“ (Boss-Level). Erzeugt von js/data/levels/gen/w4-33.mjs – nicht von Hand ändern.
export default ${JSON.stringify(def, null, 2)};
`;

writeFileSync(join(here, '..', 'w4-33.js'), out, 'utf8');
console.log(`w4-33.js geschrieben: ${def.rows[0].length} x ${def.rows.length}`);

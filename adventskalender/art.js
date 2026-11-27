// Selbst gezeichnete Bilder für die Türchen (SVG, 200×200). Keine Figuren aus Filmen oder Büchern,
// nur Dinge, die zu Zauberschule, Spielzeug, Reporterinnen und Weihnachten passen.
(function (root) {
  'use strict';

  // Fünfzackiger Stern als Polygon.
  function star(cx, cy, r, fill, extra) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" ${extra || ''}/>`;
  }
  // Vierzackiges Funkeln.
  function sparkle(cx, cy, r, fill) {
    const s = r * 0.22;
    return `<path d="M${cx} ${cy - r} Q${cx + s} ${cy - s} ${cx + r} ${cy} Q${cx + s} ${cy + s} ${cx} ${cy + r} Q${cx - s} ${cy + s} ${cx - r} ${cy} Q${cx - s} ${cy - s} ${cx} ${cy - r}Z" fill="${fill || '#ffe27a'}"/>`;
  }
  const svg = (body) => `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const OUT = 'stroke="#2a1f1a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

  const ART = {
    eule: () => svg(`
      <g ${OUT}>
        <path d="M58 70 L66 40 L84 62 Z M142 70 L134 40 L116 62 Z" fill="#7a4e30"/>
        <ellipse cx="100" cy="112" rx="50" ry="60" fill="#9a6a44"/>
        <ellipse cx="62" cy="122" rx="14" ry="34" fill="#7a4e30" transform="rotate(12 62 122)"/>
        <ellipse cx="138" cy="122" rx="14" ry="34" fill="#7a4e30" transform="rotate(-12 138 122)"/>
        <ellipse cx="100" cy="128" rx="32" ry="38" fill="#efdcb8"/>
        <circle cx="80" cy="88" r="19" fill="#fff"/><circle cx="120" cy="88" r="19" fill="#fff"/>
      </g>
      <circle cx="82" cy="90" r="9" fill="#2a1f1a"/><circle cx="118" cy="90" r="9" fill="#2a1f1a"/>
      <circle cx="85" cy="86" r="3" fill="#fff"/><circle cx="121" cy="86" r="3" fill="#fff"/>
      <path d="M93 102 L107 102 L100 116 Z" fill="#f2a33a" ${OUT}/>
      <path d="M88 132 q4 4 8 0 M104 132 q4 4 8 0 M96 146 q4 4 8 0" fill="none" stroke="#c8ab7e" stroke-width="3" stroke-linecap="round"/>
      <g ${OUT}>
        <rect x="66" y="150" width="68" height="40" rx="4" fill="#fffaf0"/>
        <path d="M66 152 L100 174 L134 152" fill="none"/>
      </g>
      <circle cx="100" cy="174" r="7" fill="#c8323c"/>
      <path d="M82 190 l-6 6 M90 190 l0 7 M110 190 l0 7 M118 190 l6 6" stroke="#f2a33a" stroke-width="4" stroke-linecap="round"/>
    `),

    zauberstab: () => svg(`
      <g ${OUT}>
        <path d="M44 172 L138 70 L148 80 L54 182 Z" fill="#7a4a28"/>
        <path d="M44 172 L74 140 L84 150 L54 182 Z" fill="#4a2c16"/>
      </g>
      <path d="M78 146 l6 6 M70 154 l6 6 M62 162 l6 6" stroke="#c99a5a" stroke-width="3"/>
      ${star(152, 60, 26, '#ffd34a', OUT)}
      ${sparkle(110, 38, 12)}${sparkle(180, 104, 10)}${sparkle(176, 30, 8, '#fff')}${sparkle(124, 104, 7, '#fff')}
      <circle cx="96" cy="66" r="3" fill="#ffe27a"/><circle cx="160" cy="128" r="4" fill="#ffe27a"/>
    `),

    hut: () => svg(`
      <g ${OUT}>
        <path d="M100 18 C112 60 128 110 150 150 L50 150 C70 112 86 62 100 18 Z" fill="#5b3c9e"/>
        <path d="M100 18 C96 10 84 12 80 22" fill="none"/>
        <ellipse cx="100" cy="156" rx="84" ry="20" fill="#4a2f86"/>
        <path d="M56 140 C80 150 120 150 144 140 L148 152 C120 162 80 162 52 152 Z" fill="#e8b43a"/>
      </g>
      ${star(98, 70, 12, '#ffd34a')}${star(120, 108, 8, '#ffd34a')}${star(78, 116, 7, '#ffd34a')}
      <path d="M100 40 a8 8 0 1 0 8 10 a6 6 0 1 1 -8 -10" fill="#ffe9a0"/>
      ${sparkle(30, 60, 9)}${sparkle(170, 50, 11)}
    `),

    besen: () => svg(`
      <path d="M36 40 L132 136" stroke="#2a1f1a" stroke-width="14" stroke-linecap="round"/>
      <path d="M36 40 L132 136" stroke="#9a6234" stroke-width="8" stroke-linecap="round"/>
      <g ${OUT}>
        <path d="M122 122 L150 116 L190 168 L168 190 L116 150 Z" fill="#e6b85c"/>
        <path d="M118 118 L142 142 L132 150 L110 128 Z" fill="#c8323c"/>
      </g>
      <path d="M150 132 L178 172 M140 140 L172 182 M132 148 L160 184 M158 124 L186 160" stroke="#b5873a" stroke-width="3" stroke-linecap="round"/>
      ${sparkle(54, 120, 9, '#fff')}${sparkle(30, 150, 6, '#fff')}${sparkle(80, 160, 7, '#ffe27a')}
      <path d="M30 100 q14 -6 22 4 M16 128 q14 -6 22 4" fill="none" stroke="#bfe3ff" stroke-width="3" stroke-linecap="round"/>
    `),

    schloss: () => svg(`
      <circle cx="160" cy="40" r="20" fill="#fff4c2"/><circle cx="168" cy="34" r="17" fill="#1c2452"/>
      ${sparkle(40, 30, 6, '#fff')}${sparkle(100, 20, 5, '#fff')}${sparkle(130, 70, 4, '#fff')}
      <g ${OUT} fill="#6b6f8f">
        <rect x="70" y="80" width="60" height="96"/>
        <rect x="30" y="100" width="34" height="76"/>
        <rect x="136" y="96" width="34" height="80"/>
        <rect x="88" y="50" width="24" height="40"/>
      </g>
      <g ${OUT} fill="#3e4b9e">
        <path d="M26 102 L47 62 L68 102 Z"/><path d="M132 98 L153 56 L174 98 Z"/>
        <path d="M84 52 L100 18 L116 52 Z"/>
      </g>
      <path d="M100 18 L100 8 L112 12 L100 16" fill="#c8323c" stroke="#2a1f1a" stroke-width="2"/>
      <g fill="#ffd34a">
        <rect x="42" y="118" width="10" height="16" rx="5"/><rect x="148" y="114" width="10" height="16" rx="5"/>
        <rect x="80" y="100" width="10" height="16" rx="5"/><rect x="110" y="100" width="10" height="16" rx="5"/>
        <rect x="95" y="62" width="10" height="14" rx="5"/>
      </g>
      <path d="M88 176 L88 150 a12 12 0 0 1 24 0 L112 176 Z" fill="#4a2c16" ${OUT}/>
      <path d="M0 176 Q100 166 200 176 L200 200 L0 200 Z" fill="#eef4ff"/>
    `),

    trank: () => svg(`
      <g ${OUT}>
        <rect x="84" y="22" width="32" height="22" rx="4" fill="#a8743f"/>
        <path d="M88 44 L112 44 L112 72 C146 82 160 110 150 140 C140 172 60 172 50 140 C40 110 54 82 88 72 Z" fill="#d8f3ff" fill-opacity=".9"/>
      </g>
      <path d="M54 124 C70 116 130 116 146 124 C150 150 130 166 100 166 C70 166 50 150 54 124 Z" fill="#46d38a"/>
      <circle cx="80" cy="140" r="7" fill="#9ff0c4"/><circle cx="112" cy="132" r="5" fill="#9ff0c4"/><circle cx="122" cy="150" r="4" fill="#9ff0c4"/>
      <circle cx="96" cy="100" r="5" fill="#c9f7de" stroke="#46d38a" stroke-width="2"/>
      <circle cx="108" cy="84" r="4" fill="#c9f7de" stroke="#46d38a" stroke-width="2"/>
      <path d="M68 96 q-6 14 0 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>
      ${sparkle(150, 40, 10)}${sparkle(44, 56, 8, '#fff')}${sparkle(168, 90, 6)}
    `),

    fluegelball: () => svg(`
      <g ${OUT}>
        <path d="M78 96 C50 60 20 56 8 70 C26 74 30 84 22 92 C40 92 44 102 36 110 C56 110 68 108 78 104 Z" fill="#fff"/>
        <path d="M122 96 C150 60 180 56 192 70 C174 74 170 84 178 92 C160 92 156 102 164 110 C144 110 132 108 122 104 Z" fill="#fff"/>
        <circle cx="100" cy="100" r="28" fill="#f5c542"/>
      </g>
      <path d="M80 92 C90 100 110 100 120 92 M84 112 C94 104 106 104 116 112" fill="none" stroke="#c9961f" stroke-width="3"/>
      <circle cx="90" cy="88" r="6" fill="#fff4c2"/>
      <path d="M30 84 L60 92 M36 100 L64 100" stroke="#cfd8e6" stroke-width="2"/>
      <path d="M170 84 L140 92 M164 100 L136 100" stroke="#cfd8e6" stroke-width="2"/>
      ${sparkle(100, 40, 10)}${sparkle(150, 150, 9)}${sparkle(48, 150, 7, '#fff')}
    `),

    buch: () => svg(`
      <g ${OUT}>
        <path d="M100 140 C80 128 50 126 20 132 L20 70 C50 64 80 66 100 78 Z" fill="#fff8e8"/>
        <path d="M100 140 C120 128 150 126 180 132 L180 70 C150 64 120 66 100 78 Z" fill="#fff8e8"/>
        <path d="M14 136 C50 128 80 132 100 146 C120 132 150 128 186 136 L186 150 C150 142 120 146 100 160 C80 146 50 142 14 150 Z" fill="#8b2d3a"/>
      </g>
      <path d="M34 86 L84 90 M34 100 L84 104 M34 114 L76 117 M116 90 L166 86 M116 104 L166 100 M124 117 L166 114" stroke="#c6b8a0" stroke-width="3" stroke-linecap="round"/>
      ${star(100, 40, 14, '#ffd34a')}${sparkle(66, 50, 9)}${sparkle(136, 30, 8, '#c9b8ff')}${sparkle(150, 56, 6)}
      <circle cx="80" cy="24" r="4" fill="#c9b8ff"/><circle cx="120" cy="60" r="3" fill="#fff"/>
    `),

    cowboy: () => svg(`
      <g ${OUT}>
        <path d="M14 96 C30 118 70 120 100 114 C130 120 170 118 186 96 C176 86 160 96 150 98 L144 56 C140 36 124 34 112 42 C104 46 96 46 88 42 C76 34 60 36 56 56 L50 98 C40 96 24 86 14 96 Z" fill="#a8693a"/>
        <path d="M52 86 C80 96 120 96 148 86 L150 98 C120 108 80 108 50 98 Z" fill="#6b3a1e"/>
      </g>
      <path d="M100 46 C98 60 98 76 100 88" fill="none" stroke="#7d4a26" stroke-width="3"/>
      ${star(100, 156, 32, '#f5c542', OUT)}
      <circle cx="100" cy="156" r="10" fill="#d9a521"/>
      ${[0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return `<circle cx="${(100 + Math.cos(a) * 32).toFixed(1)}" cy="${(156 + Math.sin(a) * 32).toFixed(1)}" r="5" fill="#f5c542" stroke="#2a1f1a" stroke-width="3"/>`; }).join('')}
    `),

    rakete: () => svg(`
      <path d="M86 150 Q100 196 114 150 Z" fill="#ffb02e"/><path d="M92 150 Q100 180 108 150 Z" fill="#fff1a8"/>
      <g ${OUT}>
        <path d="M70 120 L46 150 L74 146 Z M130 120 L154 150 L126 146 Z" fill="#e8463c"/>
        <path d="M100 18 C130 44 136 100 126 150 L74 150 C64 100 70 44 100 18 Z" fill="#f4f6fb"/>
        <path d="M100 18 C112 28 120 40 124 54 L76 54 C80 40 88 28 100 18 Z" fill="#e8463c"/>
        <circle cx="100" cy="88" r="16" fill="#7fd0ff"/>
        <rect x="92" y="130" width="16" height="22" fill="#e8463c"/>
      </g>
      <circle cx="95" cy="83" r="5" fill="#fff"/>
      ${sparkle(30, 50, 8, '#fff')}${sparkle(170, 70, 9)}${sparkle(160, 170, 6, '#fff')}${sparkle(40, 180, 7)}
    `),

    roboter: () => svg(`
      <path d="M100 30 L100 14" stroke="#2a1f1a" stroke-width="4"/><circle cx="100" cy="12" r="7" fill="#e8463c" stroke="#2a1f1a" stroke-width="3"/>
      <g ${OUT}>
        <rect x="56" y="30" width="88" height="62" rx="14" fill="#9ec7e8"/>
        <rect x="46" y="50" width="10" height="22" rx="4" fill="#6f9cc4"/><rect x="144" y="50" width="10" height="22" rx="4" fill="#6f9cc4"/>
        <rect x="62" y="98" width="76" height="62" rx="10" fill="#7fb0d8"/>
        <rect x="32" y="104" width="22" height="46" rx="10" fill="#9ec7e8"/><rect x="146" y="104" width="22" height="46" rx="10" fill="#9ec7e8"/>
        <rect x="70" y="160" width="22" height="26" rx="6" fill="#6f9cc4"/><rect x="108" y="160" width="22" height="26" rx="6" fill="#6f9cc4"/>
        <circle cx="80" cy="58" r="11" fill="#fff"/><circle cx="120" cy="58" r="11" fill="#fff"/>
      </g>
      <circle cx="80" cy="58" r="5" fill="#2a1f1a"/><circle cx="120" cy="58" r="5" fill="#2a1f1a"/>
      <path d="M82 78 Q100 90 118 78" fill="none" stroke="#2a1f1a" stroke-width="4" stroke-linecap="round"/>
      <rect x="78" y="112" width="44" height="22" rx="4" fill="#24354f"/>
      <circle cx="88" cy="123" r="4" fill="#5df28a"/><circle cx="100" cy="123" r="4" fill="#ffd34a"/><circle cx="112" cy="123" r="4" fill="#e8463c"/>
      <path d="M84 146 L116 146" stroke="#24354f" stroke-width="4" stroke-linecap="round"/>
    `),

    dino: () => svg(`
      <g ${OUT}>
        <path d="M60 120 C30 124 14 150 6 166 C30 158 46 150 66 150 Z" fill="#5bbf5a"/>
        <ellipse cx="96" cy="130" rx="44" ry="36" fill="#6fd06b"/>
        <rect x="70" y="150" width="20" height="34" rx="8" fill="#5bbf5a"/><rect x="104" y="150" width="20" height="34" rx="8" fill="#5bbf5a"/>
        <path d="M112 110 C116 80 118 60 136 50 C160 40 190 50 190 70 C190 88 170 94 150 92 C140 100 138 112 136 124 Z" fill="#6fd06b"/>
        <path d="M130 120 L146 128 L140 134" fill="none"/>
      </g>
      <ellipse cx="96" cy="140" rx="26" ry="18" fill="#c8f0a0"/>
      <circle cx="160" cy="62" r="8" fill="#fff" stroke="#2a1f1a" stroke-width="3"/><circle cx="162" cy="62" r="4" fill="#2a1f1a"/>
      <path d="M160 82 Q172 88 184 80" fill="none" stroke="#2a1f1a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="182" cy="64" r="2" fill="#2a1f1a"/>
      <path d="M128 46 L134 32 L142 44 M108 76 L104 62 L118 66 M88 96 L78 84 L96 86 M66 106 L52 98 L68 94" fill="#ffd34a" stroke="#2a1f1a" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="80" cy="124" r="4" fill="#4aa84a"/><circle cx="110" cy="116" r="3" fill="#4aa84a"/>
    `),

    sparschwein: () => svg(`
      <g ${OUT}>
        <path d="M58 82 L62 56 L82 72 Z" fill="#f08fb0"/>
        <rect x="62" y="140" width="18" height="30" rx="6" fill="#f08fb0"/><rect x="118" y="140" width="18" height="30" rx="6" fill="#f08fb0"/>
        <ellipse cx="98" cy="118" rx="68" ry="50" fill="#f7a8c4"/>
        <ellipse cx="164" cy="118" rx="14" ry="18" fill="#f08fb0"/>
        <path d="M30 108 C14 100 14 124 26 120" fill="none"/>
      </g>
      <circle cx="160" cy="114" r="3" fill="#2a1f1a"/><circle cx="168" cy="122" r="3" fill="#2a1f1a"/>
      <circle cx="128" cy="98" r="6" fill="#2a1f1a"/><circle cx="130" cy="96" r="2" fill="#fff"/>
      <rect x="82" y="70" width="34" height="7" rx="3" fill="#2a1f1a"/>
      <g ${OUT}><ellipse cx="99" cy="44" rx="20" ry="20" fill="#f5c542"/></g>
      <text x="99" y="52" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="22" fill="#a87a12">€</text>
      <ellipse cx="80" cy="104" rx="10" ry="6" fill="#fcd0de"/>
    `),

    spielzeugkiste: () => svg(`
      <g ${OUT}>
        <path d="M30 70 L60 30 L150 30 L170 70 Z" fill="#c78a4a" transform="rotate(-18 30 70)"/>
        <circle cx="70" cy="80" r="26" fill="#e8463c"/>
        <rect x="104" y="58" width="36" height="36" rx="4" fill="#5aa0e8"/>
        <rect x="140" y="70" width="10" height="40" rx="5" fill="#ffd34a" transform="rotate(20 145 90)"/>
      </g>
      <path d="M48 70 Q70 92 92 70" fill="none" stroke="#fff" stroke-width="5"/>
      <text x="122" y="84" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="24" fill="#fff">A</text>
      <g ${OUT}>
        <rect x="24" y="94" width="152" height="86" rx="8" fill="#d99a58"/>
        <path d="M24 122 L176 122 M24 152 L176 152" fill="none"/>
      </g>
      ${star(100, 137, 16, '#ffd34a', OUT)}
    `),

    notizblock: () => svg(`
      <g ${OUT}>
        <rect x="38" y="30" width="110" height="146" rx="8" fill="#fffdf4"/>
      </g>
      <g fill="none" stroke="#2a1f1a" stroke-width="3">${[52, 70, 88, 106, 124].map((x) => `<path d="M${x} 38 a6 8 0 1 1 0 -14"/>`).join('')}</g>
      <path d="M52 62 L132 62 M52 82 L132 82 M52 102 L120 102 M52 122 L132 122 M52 142 L104 142" stroke="#9cc3ea" stroke-width="3" stroke-linecap="round"/>
      <text x="56" y="56" font-family="Georgia, serif" font-weight="700" font-size="14" fill="#c8323c">EXKLUSIV!</text>
      <g ${OUT} transform="rotate(35 150 120)">
        <rect x="140" y="50" width="20" height="104" fill="#ffc533"/>
        <path d="M140 154 L150 176 L160 154 Z" fill="#f3d6a8"/>
        <rect x="140" y="40" width="20" height="12" fill="#f08fb0"/>
      </g>
    `),

    mikrofon: () => svg(`
      <g ${OUT}>
        <rect x="88" y="104" width="24" height="76" rx="8" fill="#3a3f4f"/>
        <rect x="62" y="108" width="76" height="32" rx="6" fill="#e8463c"/>
        <circle cx="100" cy="70" r="40" fill="#b9c1d1"/>
      </g>
      <text x="100" y="131" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="17" fill="#fff">LIVE</text>
      <path d="M72 56 L128 56 M64 72 L136 72 M70 88 L130 88 M86 40 L86 104 M100 32 L100 108 M114 40 L114 104" stroke="#8a93a8" stroke-width="2.5"/>
      <path d="M150 50 q14 20 0 40 M164 40 q24 30 0 60 M50 50 q-14 20 0 40 M36 40 q-24 30 0 60" fill="none" stroke="#ffd34a" stroke-width="4" stroke-linecap="round"/>
    `),

    fahrrad: () => svg(`
      <g fill="none" stroke="#2a1f1a" stroke-width="6">
        <circle cx="52" cy="138" r="34"/><circle cx="150" cy="138" r="34"/>
      </g>
      <g fill="none" stroke="#9ab" stroke-width="2"><path d="M52 104 L52 172 M18 138 L86 138 M150 104 L150 172 M116 138 L184 138"/></g>
      <g fill="none" stroke="#e8463c" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M52 138 L84 86 L136 86 L104 138 Z M104 138 L78 70 M136 86 L150 138 M136 86 L130 62"/>
      </g>
      <path d="M64 66 L94 66" stroke="#2a1f1a" stroke-width="8" stroke-linecap="round"/>
      <path d="M118 60 L142 58" stroke="#2a1f1a" stroke-width="6" stroke-linecap="round"/>
      <g ${OUT}><path d="M144 34 L184 34 L178 62 L150 62 Z" fill="#c78a4a"/></g>
      <path d="M148 44 L180 44 M152 54 L178 54" stroke="#8a5a2a" stroke-width="2"/>
      <circle cx="160" cy="28" r="7" fill="#ffd34a"/><circle cx="172" cy="26" r="6" fill="#e8463c"/>
      <circle cx="104" cy="138" r="8" fill="#2a1f1a"/>
    `),

    lupe: () => svg(`
      <g fill="#7a5a3a" opacity=".55">
        <ellipse cx="34" cy="170" rx="9" ry="13"/><ellipse cx="62" cy="150" rx="9" ry="13"/>
        <ellipse cx="44" cy="122" rx="9" ry="13"/><ellipse cx="74" cy="104" rx="9" ry="13" opacity=".6"/>
      </g>
      <path d="M140 132 L184 176" stroke="#2a1f1a" stroke-width="20" stroke-linecap="round"/>
      <path d="M140 132 L184 176" stroke="#7a4a28" stroke-width="13" stroke-linecap="round"/>
      <circle cx="112" cy="84" r="52" fill="#cfefff" fill-opacity=".7" stroke="#2a1f1a" stroke-width="12"/>
      <circle cx="112" cy="84" r="52" fill="none" stroke="#c9a03a" stroke-width="6"/>
      <ellipse cx="112" cy="90" rx="13" ry="19" fill="#7a5a3a"/>
      <path d="M86 62 Q96 46 116 46" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
      <text x="150" y="30" font-family="Georgia, serif" font-weight="700" font-size="30" fill="#ffd34a">?</text>
    `),

    kamera: () => svg(`
      <g ${OUT}>
        <rect x="64" y="46" width="44" height="22" rx="4" fill="#3a3f4f"/>
        <rect x="24" y="62" width="152" height="104" rx="16" fill="#4d5568"/>
        <rect x="24" y="84" width="152" height="12" fill="#c78a4a"/>
        <circle cx="100" cy="116" r="38" fill="#2a2f3c"/>
        <circle cx="100" cy="116" r="24" fill="#5a8fd8"/>
        <rect x="140" y="70" width="24" height="12" rx="3" fill="#fff4c2"/>
      </g>
      <circle cx="92" cy="108" r="7" fill="#cfe4ff"/>
      ${sparkle(170, 36, 14, '#fff')}${sparkle(150, 22, 6, '#ffe27a')}
    `),

    tannenbaum: () => svg(`
      <rect x="88" y="160" width="24" height="26" fill="#7a4a28" stroke="#2a1f1a" stroke-width="3"/>
      <g ${OUT} fill="#2f9e5a">
        <path d="M100 60 L150 120 L50 120 Z"/>
        <path d="M100 86 L166 162 L34 162 Z"/>
        <path d="M100 36 L136 84 L64 84 Z"/>
      </g>
      <path d="M60 120 Q100 136 144 112 M46 160 Q100 172 156 150" fill="none" stroke="#ffd34a" stroke-width="3"/>
      <circle cx="80" cy="104" r="6" fill="#e8463c"/><circle cx="118" cy="96" r="6" fill="#5aa0e8"/><circle cx="100" cy="140" r="7" fill="#ffd34a"/>
      <circle cx="66" cy="150" r="6" fill="#5aa0e8"/><circle cx="138" cy="146" r="6" fill="#e8463c"/><circle cx="96" cy="72" r="5" fill="#f08fb0"/>
      ${star(100, 30, 18, '#ffd34a', OUT)}
    `),

    schneemann: () => svg(`
      <g ${OUT} fill="#fbfdff">
        <circle cx="100" cy="150" r="42"/><circle cx="100" cy="94" r="30"/><circle cx="100" cy="52" r="22"/>
      </g>
      <g ${OUT}>
        <rect x="78" y="14" width="44" height="22" rx="3" fill="#2f3442"/>
        <rect x="68" y="32" width="64" height="8" rx="3" fill="#2f3442"/>
        <path d="M100 56 L128 62 L100 62 Z" fill="#f28a2e"/>
        <path d="M72 76 C90 84 110 84 128 76 L130 88 C110 94 90 94 70 88 Z" fill="#e8463c"/>
        <path d="M112 86 L118 116 L106 116 Z" fill="#e8463c"/>
      </g>
      <rect x="78" y="14" width="44" height="7" fill="#e8463c"/>
      <circle cx="92" cy="48" r="3.5" fill="#2a1f1a"/><circle cx="108" cy="48" r="3.5" fill="#2a1f1a"/>
      <path d="M90 66 q10 6 20 0" fill="none" stroke="#2a1f1a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="102" r="4" fill="#2a1f1a"/><circle cx="100" cy="140" r="4" fill="#2a1f1a"/><circle cx="100" cy="158" r="4" fill="#2a1f1a"/>
      <path d="M70 96 L36 74 M44 78 L36 66 M130 96 L166 76 M158 80 L170 70" stroke="#7a4a28" stroke-width="5" stroke-linecap="round"/>
    `),

    lebkuchen: () => svg(`
      <path d="M100 20 C122 20 134 38 128 58 L168 66 C184 70 182 92 166 92 L132 88 L140 132 L160 172 C166 186 146 194 138 182 L100 140 L62 182 C54 194 34 186 40 172 L60 132 L68 88 L34 92 C18 92 16 70 32 66 L72 58 C66 38 78 20 100 20 Z" fill="#c07a3c" ${OUT}/>
      <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round">
        <path d="M40 74 q6 6 0 12 M160 74 q-6 6 0 12 M54 168 q8 4 12 -4 M146 168 q-8 4 -12 -4"/>
        <path d="M88 56 Q100 66 112 56"/>
      </g>
      <circle cx="90" cy="40" r="5" fill="#2a1f1a"/><circle cx="110" cy="40" r="5" fill="#2a1f1a"/>
      <circle cx="100" cy="84" r="7" fill="#e8463c"/><circle cx="100" cy="106" r="7" fill="#2f9e5a"/><circle cx="100" cy="128" r="7" fill="#5aa0e8"/>
      <path d="M86 70 L100 76 L114 70 L114 82 L100 76 L86 82 Z" fill="#f08fb0" stroke="#2a1f1a" stroke-width="2"/>
    `),

    kerze: () => svg(`
      <ellipse cx="100" cy="56" rx="40" ry="44" fill="#ffe27a" opacity=".25"/>
      <path d="M100 26 C112 44 112 58 100 66 C88 58 88 44 100 26 Z" fill="#ffb02e" stroke="#2a1f1a" stroke-width="3"/>
      <path d="M100 42 C106 52 106 58 100 62 C94 58 94 52 100 42 Z" fill="#fff1a8"/>
      <path d="M100 66 L100 76" stroke="#2a1f1a" stroke-width="3"/>
      <g ${OUT}>
        <rect x="76" y="74" width="48" height="96" rx="6" fill="#e8463c"/>
        <path d="M76 84 C84 90 86 100 84 108 C90 104 92 90 96 84" fill="#ffe0e0"/>
      </g>
      <g ${OUT} fill="#2f9e5a">
        <path d="M40 172 C50 156 70 156 82 166 C72 168 66 176 70 186 C58 180 48 182 40 172 Z"/>
        <path d="M160 172 C150 156 130 156 118 166 C128 168 134 176 130 186 C142 180 152 182 160 172 Z"/>
      </g>
      <circle cx="94" cy="176" r="8" fill="#c8323c" stroke="#2a1f1a" stroke-width="3"/><circle cx="108" cy="180" r="8" fill="#c8323c" stroke="#2a1f1a" stroke-width="3"/>
    `),

    stern: () => svg(`
      <circle cx="100" cy="100" r="80" fill="#ffe27a" opacity=".2"/>
      ${star(100, 104, 74, '#ffd34a', OUT)}
      ${star(100, 104, 42, '#ffe98a')}
      <circle cx="84" cy="96" r="5" fill="#2a1f1a"/><circle cx="116" cy="96" r="5" fill="#2a1f1a"/>
      <path d="M88 112 Q100 122 112 112" fill="none" stroke="#2a1f1a" stroke-width="4" stroke-linecap="round"/>
      <circle cx="76" cy="110" r="6" fill="#f7a8c4" opacity=".8"/><circle cx="124" cy="110" r="6" fill="#f7a8c4" opacity=".8"/>
      ${sparkle(30, 34, 9, '#fff')}${sparkle(172, 40, 7, '#fff')}${sparkle(170, 170, 8)}
    `),

    geschenk: () => svg(`
      <g ${OUT}>
        <path d="M100 66 C80 30 46 34 54 56 C60 70 84 68 100 66 Z" fill="#ffd34a"/>
        <path d="M100 66 C120 30 154 34 146 56 C140 70 116 68 100 66 Z" fill="#ffd34a"/>
        <rect x="34" y="94" width="132" height="88" rx="6" fill="#e8463c"/>
        <rect x="26" y="66" width="148" height="32" rx="6" fill="#f0605a"/>
        <rect x="88" y="66" width="24" height="116" fill="#ffd34a"/>
      </g>
      <circle cx="56" cy="124" r="5" fill="#fff" opacity=".7"/><circle cx="140" cy="150" r="5" fill="#fff" opacity=".7"/>
      <circle cx="60" cy="162" r="4" fill="#fff" opacity=".7"/><circle cx="142" cy="116" r="4" fill="#fff" opacity=".7"/>
      ${sparkle(170, 30, 10)}${sparkle(28, 40, 7, '#fff')}
    `),

    rentier: () => svg(`
      <g fill="none" stroke="#7a4a28" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M78 64 C60 50 50 30 54 12 M62 44 L40 34 M56 26 L36 14"/>
        <path d="M122 64 C140 50 150 30 146 12 M138 44 L160 34 M144 26 L164 14"/>
      </g>
      <g ${OUT}>
        <path d="M70 76 C40 66 36 84 58 94 Z M130 76 C160 66 164 84 142 94 Z" fill="#a8693a"/>
        <path d="M100 56 C136 56 146 92 138 124 C132 156 118 174 100 174 C82 174 68 156 62 124 C54 92 64 56 100 56 Z" fill="#b87a46"/>
        <ellipse cx="100" cy="150" rx="28" ry="22" fill="#e6c49a"/>
      </g>
      <circle cx="84" cy="104" r="7" fill="#2a1f1a"/><circle cx="116" cy="104" r="7" fill="#2a1f1a"/>
      <circle cx="86" cy="101" r="2.5" fill="#fff"/><circle cx="118" cy="101" r="2.5" fill="#fff"/>
      <circle cx="100" cy="136" r="15" fill="#e8312c" stroke="#2a1f1a" stroke-width="3"/>
      <circle cx="95" cy="131" r="4" fill="#ff9a94"/>
      <path d="M90 160 Q100 168 110 160" fill="none" stroke="#2a1f1a" stroke-width="3" stroke-linecap="round"/>
    `),

    stiefel: () => svg(`
      <path d="M112 70 L112 26 a12 12 0 0 1 24 0 L136 32" fill="none" stroke="#2a1f1a" stroke-width="14" stroke-linecap="round"/>
      <path d="M112 70 L112 26 a12 12 0 0 1 24 0 L136 32" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>
      <path d="M112 70 L112 26 a12 12 0 0 1 24 0 L136 32" fill="none" stroke="#e8463c" stroke-width="8" stroke-dasharray="6 6"/>
      <g ${OUT}>
        <path d="M66 70 L140 70 L136 120 C170 124 186 140 186 160 C186 178 168 184 140 184 L66 184 C58 184 56 176 58 168 Z" fill="#d6312c"/>
        <rect x="56" y="48" width="96" height="30" rx="14" fill="#fbfdff"/>
        <path d="M58 170 L186 170" fill="none"/>
      </g>
      <circle cx="80" cy="44" r="12" fill="#ffd34a" stroke="#2a1f1a" stroke-width="3"/>
      <circle cx="140" cy="42" r="10" fill="#5aa0e8" stroke="#2a1f1a" stroke-width="3"/>
      <circle cx="74" cy="58" r="4" fill="#e6eef8"/><circle cx="104" cy="66" r="4" fill="#e6eef8"/><circle cx="132" cy="60" r="4" fill="#e6eef8"/>
    `),

    kekse: () => svg(`
      <ellipse cx="100" cy="150" rx="88" ry="30" fill="#eef4ff" stroke="#2a1f1a" stroke-width="3"/>
      <ellipse cx="100" cy="146" rx="70" ry="20" fill="#dfe8f5"/>
      ${star(66, 120, 30, '#e0a458', OUT)}
      <g ${OUT}>
        <circle cx="132" cy="118" r="28" fill="#8a5232"/>
        <path d="M80 82 C80 66 100 60 108 74 C116 60 136 66 136 82 C136 98 108 110 108 110 C108 110 80 98 80 82 Z" fill="#e8b878" transform="translate(-8 -12)"/>
      </g>
      <circle cx="122" cy="110" r="5" fill="#fff"/><circle cx="140" cy="122" r="5" fill="#e8463c"/><circle cx="130" cy="130" r="4" fill="#ffd34a"/><circle cx="142" cy="106" r="4" fill="#2f9e5a"/>
      <circle cx="66" cy="120" r="7" fill="#e8463c"/>
      <path d="M86 74 Q100 82 114 74" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" transform="translate(-8 -6)"/>
    `),

    schneekugel: () => svg(`
      <g ${OUT}>
        <path d="M40 160 L160 160 L172 190 L28 190 Z" fill="#8a5232"/>
        <circle cx="100" cy="92" r="70" fill="#cfefff" fill-opacity=".85"/>
      </g>
      <path d="M38 118 Q100 104 162 118 C154 140 130 158 100 160 C70 158 46 140 38 118 Z" fill="#fbfdff"/>
      <g ${OUT}>
        <rect x="78" y="98" width="44" height="30" fill="#e8463c"/>
        <path d="M72 100 L100 76 L128 100 Z" fill="#7a4a28"/>
        <rect x="94" y="110" width="12" height="18" fill="#7a4a28"/>
      </g>
      <rect x="82" y="104" width="9" height="9" fill="#ffd34a"/><rect x="109" y="104" width="9" height="9" fill="#ffd34a"/>
      <g fill="#2f9e5a" stroke="#2a1f1a" stroke-width="2"><path d="M54 118 L64 92 L74 118 Z"/><path d="M128 118 L140 88 L152 118 Z"/></g>
      <g fill="#fff">${[[60, 50], [90, 40], [130, 46], [150, 70], [50, 80], [118, 64], [76, 70], [140, 94], [100, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5"/>`).join('')}</g>
      <path d="M62 50 Q74 34 94 30" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>
      <rect x="66" y="168" width="68" height="12" rx="3" fill="#ffd34a" stroke="#2a1f1a" stroke-width="2"/>
    `),

    schlitten: () => svg(`
      <g ${OUT}>
        <rect x="44" y="70" width="40" height="40" rx="4" fill="#5aa0e8"/>
        <rect x="80" y="54" width="52" height="56" rx="4" fill="#e8463c"/>
        <rect x="126" y="80" width="32" height="30" rx="4" fill="#2f9e5a"/>
      </g>
      <path d="M64 70 L64 110 M106 54 L106 110 M142 80 L142 110 M44 88 L84 88 M80 80 L132 80" stroke="#ffd34a" stroke-width="5"/>
      <g ${OUT}>
        <path d="M30 110 L170 110 L162 134 L38 134 Z" fill="#b5483a"/>
      </g>
      <path d="M50 134 L50 156 M150 134 L150 156" stroke="#2a1f1a" stroke-width="5"/>
      <path d="M20 156 L168 156 C190 156 192 132 178 128" fill="none" stroke="#2a1f1a" stroke-width="9" stroke-linecap="round"/>
      <path d="M20 156 L168 156 C190 156 192 132 178 128" fill="none" stroke="#c9a03a" stroke-width="4" stroke-linecap="round"/>
      <path d="M0 176 Q100 162 200 176 L200 200 L0 200 Z" fill="#fbfdff"/>
      ${sparkle(30, 40, 8, '#fff')}${sparkle(170, 36, 10, '#fff')}
    `),

    bescherung: () => svg(`
      <circle cx="100" cy="90" r="90" fill="#ffe27a" opacity=".15"/>
      <rect x="92" y="142" width="16" height="20" fill="#7a4a28"/>
      <g ${OUT} fill="#2f9e5a">
        <path d="M100 52 L140 104 L60 104 Z"/><path d="M100 76 L152 146 L48 146 Z"/><path d="M100 32 L130 72 L70 72 Z"/>
      </g>
      <circle cx="82" cy="94" r="5" fill="#e8463c"/><circle cx="116" cy="88" r="5" fill="#5aa0e8"/><circle cx="100" cy="124" r="6" fill="#ffd34a"/>
      <circle cx="70" cy="134" r="5" fill="#f08fb0"/><circle cx="130" cy="132" r="5" fill="#e8463c"/>
      ${star(100, 26, 16, '#ffd34a', OUT)}
      <g ${OUT}>
        <rect x="18" y="150" width="50" height="40" rx="4" fill="#e8463c"/>
        <rect x="76" y="160" width="48" height="30" rx="4" fill="#5aa0e8"/>
        <rect x="132" y="146" width="50" height="44" rx="4" fill="#b48cff"/>
      </g>
      <path d="M43 150 L43 190 M18 168 L68 168 M100 160 L100 190 M157 146 L157 190 M132 166 L182 166" stroke="#ffd34a" stroke-width="5"/>
      ${sparkle(28, 40, 9, '#fff')}${sparkle(172, 54, 11)}${sparkle(160, 20, 6, '#fff')}${sparkle(40, 110, 6)}
    `),
  };

  const api = { ART, names: Object.keys(ART), get: (name) => (ART[name] || ART.stern)() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdventArt = api;
})(typeof window !== 'undefined' ? window : globalThis);

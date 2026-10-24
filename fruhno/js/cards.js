// Fruhno card data and DOM rendering. A card is [color, value] (see the PHP engine).
const COLORS = [
  { name: 'Süßes', css: '#d94f6a' },
  { name: 'Backwaren', css: '#d9962b' },
  { name: 'Getränke', css: '#3b82c4' },
  { name: 'Belag', css: '#3f9f55' },
];
const MOTIFS = [
  [['Nutella', '🌰'], ['Erdbeer-marmelade', '🍓'], ['Himbeer-marmelade', '🍒'], ['Honig', '🍯'], ['Ahorn-sirup', '🍁'],
   ['Nuss-Nougat', '🥜'], ['Aprikosen-marmelade', '🍑'], ['Pflaumenmus', '🍇'], ['Zimt-Zucker', '✨'], ['Pudding', '🍮']],
  [['Croissant', '🥐'], ['Vollkorn-brötchen', '🍞'], ['Weizen-brötchen', '🥯'], ['Brezel', '🥨'], ['Toast', '🍞'],
   ['Mohn-brötchen', '🫓'], ['Baguette', '🥖'], ['Pfannkuchen', '🥞'], ['Waffel', '🧇'], ['Rosinen-schnecke', '🌀']],
  [['Kaffee', '☕'], ['Milch-kaffee', '🧋'], ['Tee', '🍵'], ['Orangen-saft', '🍊'], ['Kakao', '🍫'],
   ['Apfelsaft', '🍎'], ['Milch', '🥛'], ['Wasser', '💧'], ['Cappuccino', '☕'], ['Smoothie', '🥤']],
  [['Käse', '🧀'], ['Salami', '🍕'], ['Tomaten-scheiben', '🍅'], ['Gurken-scheiben', '🥒'], ['Schinken', '🥓'],
   ['Ei', '🥚'], ['Radieschen', '🥬'], ['Frisch-käse', '🥣'], ['Lachs', '🐟'], ['Paprika', '🫑']],
];
const SPECIALS = {
  10: ['Verschlafen', '😴', '⊘'],
  11: ['Rührei wenden', '🍳', '⇄'],
  12: ['Doppelte Portion', '🍽️', '+2'],
  13: ['Frühstücks-buffet', '🍱', '★'],
  14: ['Großes Buffet', '🍱', '+4'],
};

function cardInfo(card) {
  const [c, v] = card;
  if (v <= 9) return { label: String(v), emoji: MOTIFS[c][v][1], name: MOTIFS[c][v][0] };
  return { label: SPECIALS[v][2], emoji: SPECIALS[v][1], name: SPECIALS[v][0] };
}

function renderCard(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (card[0] === 4 ? ' wild' : '');
  if (card[0] < 4) el.style.setProperty('--cc', COLORS[card[0]].css);
  const info = cardInfo(card);
  const corner = document.createElement('b');
  corner.className = 'corner';
  corner.textContent = info.label;
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = info.emoji;
  const name = document.createElement('span');
  name.className = 'cname';
  name.textContent = info.name.replace(/-/g, '­');
  el.append(corner, emoji, name);
  if (card[0] < 4) {
    const cat = document.createElement('i');
    cat.className = 'cat';
    cat.textContent = COLORS[card[0]].name;
    el.append(cat);
  }
  if (opts.playable === false) el.classList.add('dim');
  if (opts.playable === true) el.classList.add('ok');
  return el;
}

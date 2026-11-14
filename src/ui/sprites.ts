// Pixel-art fighters for the battle arena.
//
// Each sprite is a small grid of palette keys. Rows are run-length encoded into
// <rect>s when rendered, so the art stays crisp at any size and the DOM stays
// small. Everything is inline SVG — no image files, no loading states, and the
// art scales with the panel.
import { Html, raw } from './dom';

/** Palette key -> colour. A key missing here renders as transparent. */
const PALETTE: Record<string, string> = {
  k: '#17100d', // outline
  h: '#5c1f16', // hood
  r: '#a8321f', // robe
  R: '#d4572f', // robe highlight
  s: '#f0c49a', // skin
  e: '#241713', // eye
  g: '#7d736b', // fur, stone
  G: '#9c928a', // fur, stone (light)
  p: '#e08fa0', // pink
  t: '#6b5f59', // tail
  o: '#ff8f3a', // flame (mid)
  O: '#ffc46b', // flame (pale)
  c: '#ff6a2a', // glowing crack
  y: '#ffe08a', // glowing ember
  m: '#847668', // metal
  M: '#a8978a', // metal (light)
};

export type SpriteId = 'pyromancer' | 'cinder_rat' | 'ash_wisp' | 'furnace_golem' | 'the_bellows';

/**
 * 16x16 art. Every row must be the same length; the tests check that, because a
 * stray character shifts the whole row and is invisible in the source.
 */
const ART: Record<SpriteId, string[]> = {
  pyromancer: [
    '................',
    '....kkkkkkk.....',
    '...khhhhhhhk....',
    '...khssssshk....',
    '...khseseshk....',
    '...khssssshk....',
    '...khhhhhhhk....',
    '...kkrrrrrkk....',
    '..krrRRrrrRk.y..',
    '..krrRRrrrRkoy..',
    '..krrrrrrrrkoy..',
    '..krkkrrrrkko...',
    '...krrrrrrrk....',
    '...krRkrrkRk....',
    '...kkkkkkkkk....',
    '................',
  ],
  cinder_rat: [
    '................',
    '................',
    '....kkk.........',
    '...kgggk........',
    '...kgpgk........',
    '..kgggggk.......',
    '.kggggggkk......',
    '.kgegggggkk.....',
    '.kpggggggggktt..',
    '.kgggggggggktt..',
    '..kgggggggggk...',
    '..kggggggggk....',
    '...kkggggkk.....',
    '....kk.kk.......',
    '................',
    '................',
  ],
  ash_wisp: [
    '................',
    '................',
    '.....kkk........',
    '....koOOk.......',
    '...koOOOOk......',
    '..koOOOOOOk.....',
    '..kOOOOOOOk.....',
    '..kOeeOeeOk.....',
    '..kOOOOOOOk.....',
    '..kOOOOOOOk.....',
    '..kOOOOOOOk.....',
    '..koOOOOOOk.....',
    '...koOOOOk......',
    '....koOOk.......',
    '....k.k.k.......',
    '................',
  ],
  furnace_golem: [
    '................',
    '....kkkkkk......',
    '...kggggggk.....',
    '..kggyggyggk....',
    '..kggggggggk....',
    '..kgggccgggk....',
    '...kkkkkkkk.....',
    '.kkggggggggkk...',
    '.kgGggggggggGgk.',
    'kgGgggccgggggGgk',
    '.kgGggggggggGgk.',
    '.kkgggggggggkk..',
    '..kggkkkkggk....',
    '..kggk..kggk....',
    '..kkkk..kkkk....',
    '................',
  ],
  the_bellows: [
    '.....kkkk.......',
    '..kkkkkkkkkk....',
    '.kMMMMMMMMMMk...',
    '.kmmkmmkmmkmk...',
    '.kmyyyyyyyymk...',
    '.kmyycccyyymk...',
    '.kmyyyyyyyymk...',
    '.kmmkmmkmmkmk...',
    '.kmmkmmkmmkmk...',
    '.kMMMMMMMMMMk...',
    '.kmmkmmkmmkmk...',
    '.kmmkmmkmmkmk...',
    '..kkkkkkkkkk....',
    '...kmmkmmk......',
    '................',
    '................',
  ],
};

/** Raw art, exported so the tests can validate the grids. */
export const SPRITE_ART: Record<SpriteId, string[]> = ART;

function hasSprite(id: string): id is SpriteId {
  return Object.prototype.hasOwnProperty.call(ART, id);
}

/** Renders a sprite as inline SVG. Unknown ids fall back to the Pyromancer. */
export function spriteSvg(id: string): Html {
  const rows = hasSprite(id) ? ART[id] : ART.pyromancer;
  const width = Math.max(...rows.map((row) => row.length));
  const rects: string[] = [];

  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run++;
      const fill = PALETTE[key];
      if (fill) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`);
      x += run;
    }
  });

  return raw(
    `<svg class="sprite-art" viewBox="0 0 ${width} ${rows.length}" width="${width}" height="${rows.length}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" shape-rendering="crispEdges">${rects.join('')}</svg>`,
  );
}

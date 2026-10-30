// Flowers, vessels and backdrops, all drawn as SVG.
// Each flower head is drawn around the origin (0,0). Its `base` is the local point where the
// stem attaches; the stem itself is drawn by app.js so it can run down into the vessel.

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
};

// Deterministic random numbers, so backdrops look the same every time
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Shared gradients and filters. Included once in every standalone SVG.
const DEFS = `<defs>
<linearGradient id="pz-petal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient>
<radialGradient id="pz-depth"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".6" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="pz-glow"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="pz-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/></linearGradient>
<radialGradient id="pz-sunc"><stop offset="0" stop-color="#2e1906"/><stop offset=".6" stop-color="#5b3412"/><stop offset="1" stop-color="#8a5a24"/></radialGradient>
<radialGradient id="pz-yel"><stop offset="0" stop-color="#f9d65c"/><stop offset="1" stop-color="#d98c14"/></radialGradient>
<filter id="pz-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
<filter id="pz-blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="pz-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
</defs>`;

// ---------- Drawing helpers ----------
const rot = a => `transform="rotate(${a})"`;
const shaded = (d, fill, sw = 0.7) =>
  `<path d="${d}" fill="${fill}" stroke="${shade(fill, -0.22)}" stroke-width="${sw}"/><path d="${d}" fill="url(#pz-petal)"/>`;

// n rounded petals around the origin
const ring = (n, dist, rx, ry, fill, off = 0, extra = '') => {
  let s = '';
  for (let i = 0; i < n; i++) s += `<ellipse cy="${-dist}" rx="${rx}" ry="${ry}" fill="${fill}" ${rot(off + i * 360 / n)} ${extra}/>`;
  return s;
};
// same, with an outline and a gradient that darkens each petal toward the centre
const ringS = (n, dist, rx, ry, fill, off = 0) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<g ${rot(off + i * 360 / n)}><ellipse cy="${-dist}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${shade(fill, -0.2)}" stroke-width=".6"/>` +
      `<ellipse cy="${-dist}" rx="${rx}" ry="${ry}" fill="url(#pz-petal)"/></g>`;
  }
  return s;
};
const petalPath = (len, w, inner = 0) =>
  `M0 ${-inner} C${w} ${-inner - len * 0.3} ${w * 0.8} ${-inner - len * 0.8} 0 ${-inner - len} C${-w * 0.8} ${-inner - len * 0.8} ${-w} ${-inner - len * 0.3} 0 ${-inner}Z`;
// n pointed petals
const spikes = (n, len, w, fill, off = 0, inner = 0) => {
  let s = '';
  for (let i = 0; i < n; i++) s += `<g ${rot(off + i * 360 / n)}>${shaded(petalPath(len, w, inner), fill, 0.5)}</g>`;
  return s;
};
const depth = (r, cx = 0, cy = 0, o = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#pz-depth)" opacity="${o}"/>`;
const sheen = (x, y, rx, ry, r = 0, o = 0.28) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${o}" transform="rotate(${r} ${x} ${y})"/>`;
const hole = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
const dotsRing = (n, r, size, fill, off = 0) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (off + i * 360 / n) * Math.PI / 180;
    s += `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="${size}" fill="${fill}"/>`;
  }
  return s;
};

// Leaf shapes used along stems (drawn pointing along +x from the stem)
const STEM_LEAVES = {
  oval: { d: 'M0 0 C10 -13 34 -13 46 0 C34 13 10 13 0 0Z', s: 0.8 },
  small: { d: 'M0 0 C10 -13 34 -13 46 0 C34 13 10 13 0 0Z', s: 0.55 },
  long: { d: 'M0 0 C20 -11 60 -13 92 -3 C60 4 20 9 0 0Z', s: 0.9 },
  broad: { d: 'M0 0 C12 -24 48 -26 62 0 C48 24 12 24 0 0Z', s: 0.85 },
  thin: { d: 'M0 0 C12 -4 30 -4 44 0 C30 4 12 4 0 0Z', s: 0.8 },
};

// ---------- Flower heads ----------
// hit: [cx, cy, r] clickable area; base: [x, y] where the stem attaches
// sc / sw: stem colour / width; lf: stem leaf shape; lc: stem leaf colour
const TYPES = {
  rose: {
    hit: [0, 0, 30], base: [0, 22], sc: '#4f7d3a', sw: 3.6, lf: 'oval', lc: '#5b8a3c',
    draw: c => {
      const d = shade(c, -0.32);
      return `<path d="M-13 12 L-4 18 L0 28 L4 18 L13 12 L6 20 L0 24 L-6 20Z" fill="#4f7d3a"/>` +
        ringS(5, 13, 16, 19, shade(c, -0.14)) + ringS(5, 9, 13, 15, c, 36) +
        shaded('M-15 -1 Q-15 -19 0 -19 Q15 -19 15 -1 Q8 7 0 7 Q-8 7 -15 -1Z', shade(c, 0.06)) +
        depth(10, 0, -6) +
        `<g fill="none" stroke="${d}" stroke-linecap="round"><path d="M-10 -5 Q-10 -14 0 -14 Q10 -14 10 -5" stroke-width="1.4"/>` +
        `<path d="M-6 -3 Q-5 -10 1 -10 Q7 -9 6 -4 Q4 0 -1 -1" stroke-width="1.3"/><path d="M-2 -5 Q0 -7 2 -5" stroke-width="1.2"/></g>` +
        `<path d="M-15 -1 Q-6 5 0 5 Q6 5 15 -1" fill="none" stroke="${shade(c, -0.25)}" stroke-width=".8" opacity=".7"/>` +
        sheen(-7, -14, 5, 2.4, -20);
    },
  },
  peony: {
    hit: [0, 0, 38], base: [0, 28], sc: '#4f7d3a', sw: 4.2, lf: 'broad', lc: '#5b8a3c',
    draw: c => ringS(10, 22, 15, 17, shade(c, -0.14)) + ringS(9, 16, 14, 15, c, 18) +
      ringS(8, 10, 11, 12, shade(c, 0.1), 9) + ringS(7, 5, 8, 9, shade(c, 0.2), 4) +
      `<circle r="5" fill="${shade(c, 0.3)}"/>` + depth(16, 0, 0, 0.6) + sheen(-12, -16, 7, 3, -35),
  },
  carnation: {
    hit: [0, 0, 28], base: [0, 20], sc: '#7aa38b', sw: 2.8, lf: 'thin', lc: '#7aa38b',
    draw: c => {
      const frill = (n, dist, w, fill, off) => {
        let s = '';
        for (let i = 0; i < n; i++) {
          s += `<path d="M0 0 L${-w / 2} ${-dist} l${w / 4} -3 l${w / 4} 3 l${w / 4} -3 l${w / 4} 3Z" fill="${fill}" stroke="${shade(c, 0.45)}" stroke-width=".9" ${rot(off + i * 360 / n)}/>`;
        }
        return s;
      };
      return `<path d="M-8 8 L-6 22 L6 22 L8 8Z" fill="#7aa38b"/>` +
        frill(16, 21, 10, shade(c, -0.12), 0) + frill(14, 16, 9, c, 12) + frill(10, 10, 8, shade(c, 0.12), 5) +
        depth(14, 0, 0, 0.6) + sheen(-8, -12, 5, 2.4, -30, 0.2);
    },
  },
  tulip: {
    hit: [0, -2, 30], base: [0, 30], sc: '#5b8a3c', sw: 4.4, lf: 'long', lc: '#6b9a4a',
    draw: c => `<g transform="translate(0 24)">` +
      shaded('M-20 -2 C-26 -30 -18 -48 -8 -50 C-4 -38 0 -34 0 -34 C0 -34 4 -38 8 -50 C18 -48 26 -30 20 -2 C12 10 -12 10 -20 -2Z', c) +
      shaded('M-9 6 C-15 -20 -6 -44 0 -56 C6 -44 15 -20 9 6Z', shade(c, 0.12)) +
      `<path d="M0 2 L0 -48 M-5 0 Q-7 -20 -3 -40 M5 0 Q7 -20 3 -40 M-15 -4 Q-19 -24 -12 -42 M15 -4 Q19 -24 12 -42" stroke="${shade(c, -0.18)}" stroke-width=".8" fill="none" opacity=".5"/>` +
      sheen(-4, -36, 2.5, 10, 0, 0.3) + `</g>`,
  },
  hydrangea: {
    hit: [0, 0, 40], base: [0, 32], sc: '#4f7d3a', sw: 4.6, lf: 'broad', lc: '#4f7f3a',
    draw: c => {
      const pts = [];
      [[35, 14, 0], [25, 11, 15], [13, 6, 30]].forEach(([r, n, off]) => {
        for (let i = 0; i < n; i++) {
          const a = (off + i * 360 / n) * Math.PI / 180;
          pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
      });
      pts.push([0, 0]);
      const cols = [c, shade(c, 0.22), shade(c, -0.1)];
      const florets = pts.map(([x, y], i) =>
        `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${i * 37})">` +
        ring(4, 4.2, 3.8, 4.8, cols[i % 3], 0, `stroke="${shade(c, -0.25)}" stroke-width=".4"`) +
        `<circle r="1.4" fill="${shade(c, -0.4)}"/></g>`).join('');
      return `<circle r="37" fill="${shade(c, -0.25)}"/>` + florets +
        `<circle cx="-12" cy="-12" r="30" fill="url(#pz-glow)" opacity=".45"/>` + depth(36, 10, 12, 0.7);
    },
  },
  sunflower: {
    hit: [0, 0, 40], base: [0, 26], sc: '#4e7a32', sw: 5.5, lf: 'broad', lc: '#5b8a3c',
    draw: () => {
      let dots = '';
      [[6, 6], [11, 11], [15, 15], [18, 18]].forEach(([r, n]) => { dots += dotsRing(n, r, 1.3, '#2a1604', r * 7); });
      return spikes(22, 20, 6.5, '#e39a0c', 0, 17) + spikes(22, 18, 6, '#f6c234', 8, 15) +
        `<circle r="20" fill="url(#pz-sunc)" stroke="#3e2208" stroke-width="1.5"/>` + dots + sheen(-6, -8, 7, 3, -30, 0.12);
    },
  },
  daisy: {
    hit: [0, 0, 28], base: [0, 8], sc: '#5b8a3c', sw: 2.8, lf: 'small', lc: '#5b8a3c',
    draw: c => ringS(18, 19, 4.2, 12.5, c) +
      `<circle r="9" fill="url(#pz-yel)"/>` + dotsRing(12, 6, 0.9, '#c47a10') + dotsRing(6, 3, 0.9, '#c47a10', 30),
  },
  cosmos: {
    hit: [0, 0, 28], base: [0, 6], sc: '#6a9a4b', sw: 2.2, lf: null,
    draw: c => {
      let s = '';
      for (let i = 0; i < 8; i++) {
        s += `<g ${rot(i * 45)}>${shaded('M0 -3 C10 -6 12 -22 8 -28 L4 -25 L0 -29 L-4 -25 L-8 -28 C-12 -22 -10 -6 0 -3Z', c)}` +
          `<path d="M0 -5 L0 -25 M-3 -6 L-5 -22 M3 -6 L5 -22" stroke="${shade(c, -0.2)}" stroke-width=".6" opacity=".6"/></g>`;
      }
      return s + `<circle r="6" fill="url(#pz-yel)"/>` + dotsRing(8, 3.5, 0.8, '#b8770f');
    },
  },
  lily: {
    hit: [0, 0, 42], base: [0, 4], sc: '#5f9147', sw: 4, lf: 'long', lc: '#5f9147',
    draw: c => {
      let s = '';
      for (let i = 0; i < 6; i++) {
        s += `<g ${rot(i * 60 + 30)}>` + shaded('M0 0 C11 -10 9 -34 0 -46 C-9 -34 -11 -10 0 0Z', i % 2 ? c : shade(c, -0.05), 0.6) +
          `<path d="M0 -3 Q1 -20 0 -38" stroke="${shade(c, -0.2)}" stroke-width="2.4" fill="none" opacity=".5"/>` +
          `<circle cx="-3" cy="-14" r="1" fill="${shade(c, -0.45)}"/><circle cx="3" cy="-18" r="1" fill="${shade(c, -0.45)}"/><circle cx="-2" cy="-22" r=".8" fill="${shade(c, -0.45)}"/></g>`;
      }
      for (let i = 0; i < 6; i++) {
        const a = (i * 60) * Math.PI / 180, x = (Math.cos(a) * 20).toFixed(1), y = (Math.sin(a) * 20 - 6).toFixed(1);
        s += `<path d="M0 0 L${x} ${y}" stroke="#c9d89a" stroke-width="1.2"/><ellipse cx="${x}" cy="${y}" rx="3" ry="1.6" fill="#b5541c"/>`;
      }
      return s + `<path d="M0 0 L0 -16" stroke="#9bb86a" stroke-width="2"/><circle cy="-17" r="2.2" fill="#7f9c4d"/>`;
    },
  },
  calla: {
    hit: [0, -14, 34], base: [0, 22], sc: '#5f9147', sw: 5, lf: null,
    draw: c => `<g transform="translate(0 10)">` +
      shaded('M-3 12 C-18 -6 -24 -34 -10 -50 C2 -62 26 -56 24 -44 C14 -38 10 -20 5 12Z', c, 0.8) +
      `<path d="M-10 -50 C2 -62 26 -56 24 -44 C14 -48 0 -50 -10 -50Z" fill="${shade(c, -0.12)}"/>` +
      `<path d="M2 -6 Q6 -28 4 -42" stroke="#f0b429" stroke-width="5" stroke-linecap="round" fill="none"/>` +
      `<path d="M-3 12 C-12 0 -16 -20 -12 -36" stroke="${shade(c, -0.15)}" stroke-width="1.4" fill="none"/>` +
      sheen(-11, -24, 3, 12, 15, 0.35) + `<path d="M-4 12 Q1 2 6 12Z" fill="#5f9147"/></g>`,
  },
  orchid: {
    hit: [0, 0, 34], base: [0, 20], sc: '#6a8a4a', sw: 2.4, lf: null,
    draw: c => [0, 125, -125].map(a => `<g ${rot(a)}>${shaded('M0 -2 C8 -8 8 -30 0 -38 C-8 -30 -8 -8 0 -2Z', c)}</g>`).join('') +
      `<g>${shaded('M-2 -2 C-10 -18 -34 -16 -32 -2 C-30 10 -12 10 -2 2Z', shade(c, 0.08))}</g>` +
      `<g>${shaded('M2 -2 C10 -18 34 -16 32 -2 C30 10 12 10 2 2Z', shade(c, 0.08))}</g>` +
      `<path d="M-6 -2 L-26 -5 M-6 0 L-24 4 M6 -2 L26 -5 M6 0 L24 4" stroke="${shade(c, -0.2)}" stroke-width=".7"/>` +
      `<path d="M-7 4 C-10 16 -4 22 0 22 C4 22 10 16 7 4 C4 0 -4 0 -7 4Z" fill="${shade(c, -0.38)}"/>` +
      `<ellipse cy="-2" rx="4" ry="5" fill="#fff6d6"/><circle cy="7" r="3" fill="#f2c94c"/>`,
  },
  lavender: {
    hit: [0, -44, 46], base: [0, 4], sc: '#7d9a6a', sw: 2.6, lf: 'thin', lc: '#8aa67a',
    draw: c => {
      let buds = `<path d="M0 4 L0 -88" stroke="#7d9a6a" stroke-width="2"/>`;
      for (let i = 0; i < 14; i++) {
        const y = -i * 6.5, k = 1 - i / 20, col = i % 2 ? c : shade(c, 0.18);
        buds += `<ellipse cx="-3.5" cy="${y}" rx="${3 * k}" ry="${5 * k}" fill="${col}" stroke="${shade(c, -0.2)}" stroke-width=".4" transform="rotate(-22 -3.5 ${y})"/>` +
          `<ellipse cx="3.5" cy="${y - 3}" rx="${3 * k}" ry="${5 * k}" fill="${shade(col, -0.1)}" stroke="${shade(c, -0.25)}" stroke-width=".4" transform="rotate(22 3.5 ${y - 3})"/>`;
      }
      return buds + `<ellipse cy="-92" rx="2.4" ry="4" fill="${c}"/>`;
    },
  },
  babysbreath: {
    hit: [0, -8, 42], base: [0, 60], sc: '#88a37a', sw: 2, lf: null,
    draw: () => {
      const tips = [[-32, -20], [-14, -40], [8, -32], [30, -14], [-24, 6], [20, 8], [0, -10], [-6, -26]];
      let s = '';
      tips.forEach(([x, y], i) => {
        s += `<path d="M0 60 Q${x * 0.3} ${y + 30} ${x} ${y}" stroke="#88a37a" stroke-width="1.2" fill="none"/>`;
        for (let j = 0; j < 7; j++) {
          const a = (j * 52 + i * 23) * Math.PI / 180, d = 3 + (j % 3) * 2.4;
          s += `<circle cx="${(x + Math.cos(a) * d).toFixed(1)}" cy="${(y + Math.sin(a) * d).toFixed(1)}" r="${2.2 + (j % 2) * 0.9}" fill="#fffdf8" stroke="#d8d0c4" stroke-width=".5"/>`;
        }
      });
      return s;
    },
  },
  bird: {
    hit: [-18, -18, 36], base: [8, 10], sc: '#4d7c3a', sw: 5, lf: null,
    draw: () => shaded('M-14 -4 L-26 -50 L-6 -6Z', '#f39c1f', 0.5) + shaded('M-10 -4 L-4 -46 L2 -4Z', '#f7b538', 0.5) +
      shaded('M-18 -4 L-44 -38 L-10 -2Z', '#e8841a', 0.5) + shaded('M-12 -4 L-34 -30 L-8 -1Z', '#3d5bd9', 0.5) +
      `<path d="M8 6 C-10 -2 -30 -8 -50 -12 C-30 2 -10 10 8 12Z" fill="#4c7a3d" stroke="#8a3b5a" stroke-width="1.6"/>` +
      `<path d="M4 8 C-14 2 -30 -4 -46 -10" stroke="#6f9a55" stroke-width="1" fill="none"/>`,
  },
  anthurium: {
    hit: [0, 0, 34], base: [6, 27], sc: '#4f7d3a', sw: 3.4, lf: null,
    draw: c => `<g transform="rotate(-15)">` +
      shaded('M0 30 C-40 10 -40 -30 -14 -30 C-6 -30 0 -22 0 -18 C0 -22 6 -30 14 -30 C40 -30 40 10 0 30Z', c) +
      `<path d="M0 26 L0 -16 M0 6 Q-14 -2 -24 -14 M0 6 Q14 -2 24 -14 M0 16 Q-12 12 -22 2 M0 16 Q12 12 22 2" stroke="${shade(c, -0.2)}" stroke-width="1" fill="none"/>` +
      sheen(-14, -14, 8, 4, -30, 0.35) +
      `<path d="M2 -6 Q12 -28 6 -44" stroke="#f2d16b" stroke-width="6" stroke-linecap="round" fill="none"/></g>`,
  },
  monstera: {
    hit: [0, -18, 50], base: [4, 26], sc: '#3f6e33', sw: 4.6, lf: null,
    draw: () => {
      const d = 'M0 26 C-46 20 -62 -26 -34 -54 C-18 -68 18 -68 34 -54 C62 -26 46 20 0 26Z ' +
        [[-30, -14, 6], [30, -14, 6], [-20, -38, 5], [20, -38, 5], [-34, 4, 4], [34, 4, 4]].map(h => hole(...h)).join(' ');
      return `<g transform="rotate(-8)"><path fill="#3f7a3a" fill-rule="evenodd" d="${d}"/><path fill="url(#pz-sheen)" fill-rule="evenodd" d="${d}"/>` +
        `<path d="M0 26 L0 -60 M0 -10 L-44 -24 M0 -10 L44 -24 M0 8 L-38 12 M0 8 L38 12 M0 -32 L-30 -50 M0 -32 L30 -50" stroke="#2f5a2a" stroke-width="1.6" fill="none"/></g>`;
    },
  },
  eucalyptus: {
    hit: [0, -30, 50], base: [0, 60], sc: '#7c8f82', sw: 2.4, lf: null,
    draw: () => {
      let s = `<path d="M0 60 Q6 -20 0 -110" stroke="#7c8f82" stroke-width="2.2" fill="none"/>`;
      for (let i = 0; i < 9; i++) {
        const y = 52 - i * 19, side = i % 2 ? 1 : -1, r = 11 - i * 0.6, cx = side * 11 + (i > 4 ? 2 : 0);
        s += `<circle cx="${cx}" cy="${y}" r="${r}" fill="${i % 3 ? '#8fb0a0' : '#9dbcab'}" stroke="#71907f" stroke-width=".8"/>` +
          `<circle cx="${cx - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.6}" fill="url(#pz-glow)" opacity=".35"/>`;
      }
      return s;
    },
  },
  fern: {
    hit: [0, -30, 50], base: [0, 60], sc: '#3f7032', sw: 2.2, lf: null,
    draw: () => {
      let s = `<path d="M0 60 Q-4 -20 4 -120" stroke="#3f7032" stroke-width="2" fill="none"/>`;
      for (let i = 0; i < 18; i++) {
        const y = 52 - i * 9.5, len = 28 * (1 - i / 22);
        s += `<ellipse cx="${-len / 2}" cy="${y}" rx="${len / 2}" ry="3.2" fill="#4f8a3a" transform="rotate(-25 0 ${y})"/>` +
          `<ellipse cx="${len / 2}" cy="${y}" rx="${len / 2}" ry="3.2" fill="#5a9644" transform="rotate(25 0 ${y})"/>`;
      }
      return s;
    },
  },
  wheat: {
    hit: [0, -38, 36], base: [0, 40], sc: '#c9a35a', sw: 1.8, lf: null,
    draw: c => {
      let s = `<path d="M0 40 L0 -72" stroke="#c9a35a" stroke-width="1.6"/>`;
      for (let i = 0; i < 10; i++) {
        const y = -8 - i * 6.5, k = 1 - i / 22;
        [-1, 1].forEach(side => {
          s += `<path d="M${side * 3} ${y - 4} l${side * 5} -18" stroke="#e3cf9a" stroke-width=".6"/>` +
            `<ellipse cx="${side * 3.4}" cy="${y}" rx="${3 * k}" ry="${5.6 * k}" fill="${side > 0 ? c : shade(c, -0.08)}" stroke="${shade(c, -0.25)}" stroke-width=".5" transform="rotate(${side * 22} ${side * 3.4} ${y})"/>`;
        });
      }
      return s + `<ellipse cy="-74" rx="2.4" ry="4.4" fill="${c}"/>`;
    },
  },
  pampas: {
    hit: [0, -40, 48], base: [0, 60], sc: '#c9b48c', sw: 2, lf: null,
    draw: c => {
      let s = `<ellipse cx="-2" cy="-40" rx="17" ry="68" fill="${c}" opacity=".55" filter="url(#pz-soft)"/>` +
        `<path d="M0 60 Q2 -20 -6 -110" stroke="#c9b48c" stroke-width="1.6" fill="none"/>`;
      for (let i = 0; i < 46; i++) {
        const t = i / 46, y = 30 - t * 140, x = 2 * t - 8 * t * t, side = i % 2 ? 1 : -1;
        const len = 8 + 16 * Math.sin(Math.PI * Math.min(1, t * 1.15));
        s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${side * len * 0.6} ${-4} ${side * len} ${6}" stroke="${i % 3 ? c : shade(c, -0.08)}" stroke-width="1.3" fill="none" opacity=".9"/>`;
      }
      return s;
    },
  },
  cotton: {
    hit: [0, -2, 28], base: [0, 24], sc: '#7a5a3a', sw: 2.4, lf: null,
    draw: () => spikes(5, 18, 6, '#7a5a3a', 36, 0) +
      [[-8, -2, 10], [8, -2, 10], [0, -12, 10], [0, 5, 9]].map(([x, y, r]) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbfaf6" stroke="#e2dccf" stroke-width=".8"/>` +
        `<circle cx="${x + 2}" cy="${y + 3}" r="${r * 0.8}" fill="url(#pz-depth)" opacity=".25"/>` +
        `<circle cx="${x - 3}" cy="${y - 3}" r="${r * 0.4}" fill="#fff"/>`).join(''),
  },
};

// Occasions offered by "Help me pick"
const OCCASIONS = {
  love: { zh: '告白·爱情', en: 'Love' },
  birthday: { zh: '生日', en: 'Birthday' },
  thanks: { zh: '感谢', en: 'Thank you' },
  missyou: { zh: '想念', en: 'Missing you' },
  sorry: { zh: '道歉', en: "I'm sorry" },
  congrats: { zh: '祝贺', en: 'Congrats' },
  getwell: { zh: '早日康复', en: 'Get well' },
  friendship: { zh: '友情', en: 'Friendship' },
  mom: { zh: '妈妈·长辈', en: 'For mom' },
  cheer: { zh: '加油鼓励', en: 'You got this' },
};

// zh/en names; c is the colour passed to the draw function.
// mz/me is the flower's meaning (花语); `for` lists the occasions it suits.
const CATALOG = [
  { k: 'rose-red', t: 'rose', c: '#c8323f', zh: '红玫瑰', en: 'Red Rose', cat: ['main'],
    mz: '热烈的爱', me: "Passionate love", for: ['love'] },
  { k: 'rose-pink', t: 'rose', c: '#f08fa0', zh: '粉玫瑰', en: 'Pink Rose', cat: ['main'],
    mz: '初恋、感动', me: "First love, gratitude", for: ['love', 'birthday', 'thanks'] },
  { k: 'rose-cream', t: 'rose', c: '#f3dcb8', zh: '香槟玫瑰', en: 'Champagne Rose', cat: ['main'],
    mz: '只钟情你一个', me: "Devoted to you alone", for: ['love', 'birthday', 'sorry'] },
  { k: 'peony-pink', t: 'peony', c: '#f4a6c0', zh: '粉芍药', en: 'Pink Peony', cat: ['main'],
    mz: '情有独钟、富贵吉祥', me: "Devotion and good fortune", for: ['love', 'birthday', 'congrats', 'mom'] },
  { k: 'peony-white', t: 'peony', c: '#fbeee8', zh: '白芍药', en: 'White Peony', cat: ['main'],
    mz: '端庄、美好', me: "Grace and beauty", for: ['mom', 'congrats'] },
  { k: 'tulip-red', t: 'tulip', c: '#e2483d', zh: '红郁金香', en: 'Red Tulip', cat: ['main'],
    mz: '爱的宣言', me: "A declaration of love", for: ['love'] },
  { k: 'tulip-yellow', t: 'tulip', c: '#f6c544', zh: '黄郁金香', en: 'Yellow Tulip', cat: ['main'],
    mz: '开朗、明亮', me: "Cheerful sunshine", for: ['friendship', 'cheer', 'getwell'] },
  { k: 'tulip-purple', t: 'tulip', c: '#9b6bc4', zh: '紫郁金香', en: 'Purple Tulip', cat: ['main'],
    mz: '无尽的爱', me: "Endless love", for: ['love', 'missyou'] },
  { k: 'hydrangea-blue', t: 'hydrangea', c: '#8fb3e8', zh: '蓝绣球', en: 'Blue Hydrangea', cat: ['main'],
    mz: '希望、团聚', me: "Hope and togetherness", for: ['sorry', 'missyou', 'friendship'] },
  { k: 'hydrangea-violet', t: 'hydrangea', c: '#c9a6e4', zh: '紫绣球', en: 'Lilac Hydrangea', cat: ['main'],
    mz: '团圆、美满', me: "Reunion and fulfilment", for: ['missyou', 'mom', 'sorry'] },
  { k: 'sunflower', t: 'sunflower', zh: '向日葵', en: 'Sunflower', cat: ['main', 'field'],
    mz: '阳光、忠诚', me: "Sunshine and loyalty", for: ['cheer', 'friendship', 'congrats', 'getwell'] },
  { k: 'daisy', t: 'daisy', c: '#ffffff', zh: '小雏菊', en: 'Daisy', cat: ['field'],
    mz: '天真、藏在心底的爱', me: "Innocence, a quiet love", for: ['friendship', 'love', 'getwell'] },
  { k: 'cosmos', t: 'cosmos', c: '#f3a3c4', zh: '波斯菊', en: 'Cosmos', cat: ['field'],
    mz: '纯真、自由', me: "Purity and freedom", for: ['friendship', 'cheer', 'birthday'] },
  { k: 'carnation', t: 'carnation', c: '#f27c95', zh: '康乃馨', en: 'Carnation', cat: ['field'],
    mz: '母爱、感恩', me: "A mother's love, gratitude", for: ['mom', 'thanks'] },
  { k: 'lavender', t: 'lavender', c: '#8a6fbf', zh: '薰衣草', en: 'Lavender', cat: ['field', 'dried'],
    mz: '等待爱情、宁静', me: "Waiting for love, calm", for: ['missyou', 'love', 'getwell'] },
  { k: 'lily-white', t: 'lily', c: '#fdf8ee', zh: '白百合', en: 'White Lily', cat: ['lily'],
    mz: '纯洁、百年好合', me: "Purity, a lasting union", for: ['mom', 'congrats'] },
  { k: 'lily-pink', t: 'lily', c: '#f6a5b5', zh: '粉百合', en: 'Pink Lily', cat: ['lily'],
    mz: '喜欢、祝福', me: "Admiration and blessings", for: ['birthday', 'congrats', 'mom'] },
  { k: 'calla', t: 'calla', c: '#fbf7ef', zh: '马蹄莲', en: 'Calla Lily', cat: ['lily'],
    mz: '优雅、圣洁', me: "Elegance", for: ['congrats', 'thanks'] },
  { k: 'orchid-purple', t: 'orchid', c: '#c77dbf', zh: '紫蝴蝶兰', en: 'Purple Orchid', cat: ['lily'],
    mz: '幸福向你飞来', me: "Happiness flying your way", for: ['birthday', 'congrats'] },
  { k: 'orchid-white', t: 'orchid', c: '#fbf5fa', zh: '白蝴蝶兰', en: 'White Orchid', cat: ['lily'],
    mz: '纯洁的爱', me: "Pure love", for: ['love', 'congrats'] },
  { k: 'bird', t: 'bird', zh: '天堂鸟', en: 'Bird of Paradise', cat: ['tropic'],
    mz: '自由、潇洒', me: "Freedom and joy", for: ['cheer', 'congrats'] },
  { k: 'anthurium', t: 'anthurium', c: '#d0283a', zh: '红掌', en: 'Anthurium', cat: ['tropic'],
    mz: '大展宏图', me: "Great success ahead", for: ['congrats', 'cheer'] },
  { k: 'monstera', t: 'monstera', zh: '龟背竹', en: 'Monstera', cat: ['tropic', 'green'],
    mz: '健康长寿', me: "Health and long life", for: ['getwell', 'mom'] },
  { k: 'eucalyptus', t: 'eucalyptus', zh: '尤加利', en: 'Eucalyptus', cat: ['green'],
    mz: '恩赐、守护', me: "Blessing and protection", for: ['thanks', 'getwell', 'friendship', 'birthday'] },
  { k: 'fern', t: 'fern', zh: '蕨叶', en: 'Fern', cat: ['green'],
    mz: '坚毅、默默守护', me: "Steadfast, quiet support", for: ['cheer', 'thanks'] },
  { k: 'babysbreath', t: 'babysbreath', zh: '满天星', en: "Baby's Breath", cat: ['green', 'field', 'dried'],
    mz: '思念、甘做配角的爱', me: "Remembrance, humble love", for: ['missyou', 'love', 'friendship'] },
  { k: 'wheat', t: 'wheat', c: '#d9b56a', zh: '麦穗', en: 'Wheat', cat: ['dried'],
    mz: '丰收、感恩', me: "Harvest and gratitude", for: ['thanks', 'congrats'] },
  { k: 'pampas', t: 'pampas', c: '#e8dcc4', zh: '蒲苇', en: 'Pampas Grass', cat: ['dried'],
    mz: '坚韧、长久', me: "Resilience, lasting", for: ['cheer', 'friendship'] },
  { k: 'cotton', t: 'cotton', zh: '棉花', en: 'Cotton', cat: ['dried'],
    mz: '珍惜眼前人', me: "Cherish who is here", for: ['love', 'missyou', 'sorry'] },
];

// ---------- Vessels ----------
// Each vessel has a palette of tints, a `mouth` that stems are routed through, and two layers:
// back(tint) sits behind the stems, front(tint) covers them.

const TINTS = {
  clear: { zh: '透明', en: 'Clear', sw: '#e4eef1', glass: 'rgba(225,238,242,.28)', back: 'rgba(200,222,230,.16)', water: 'rgba(160,205,220,.26)', edge: 'rgba(110,150,165,.7)' },
  pink: { zh: '粉', en: 'Pink', sw: '#f2b8c6', glass: 'rgba(244,176,195,.36)', back: 'rgba(240,170,190,.18)', water: 'rgba(236,150,175,.26)', edge: 'rgba(196,108,135,.75)' },
  blue: { zh: '蓝', en: 'Blue', sw: '#a9c6ea', glass: 'rgba(150,188,235,.36)', back: 'rgba(150,188,235,.18)', water: 'rgba(120,165,225,.26)', edge: 'rgba(80,120,180,.75)' },
  lilac: { zh: '紫', en: 'Lilac', sw: '#c9b6e8', glass: 'rgba(190,165,232,.36)', back: 'rgba(190,165,232,.18)', water: 'rgba(170,140,220,.26)', edge: 'rgba(130,100,180,.75)' },
  green: { zh: '绿', en: 'Green', sw: '#a8d0b0', glass: 'rgba(150,205,165,.36)', back: 'rgba(150,205,165,.18)', water: 'rgba(120,185,140,.26)', edge: 'rgba(80,140,100,.75)' },
  amber: { zh: '琥珀', en: 'Amber', sw: '#e2b27a', glass: 'rgba(226,165,90,.38)', back: 'rgba(226,165,90,.2)', water: 'rgba(210,140,60,.26)', edge: 'rgba(160,100,40,.75)' },
  smoke: { zh: '烟灰', en: 'Smoke', sw: '#8d8f98', glass: 'rgba(80,82,95,.36)', back: 'rgba(80,82,95,.2)', water: 'rgba(70,75,90,.26)', edge: 'rgba(50,52,62,.8)' },
};
const PAPERS = {
  kraft: { zh: '牛皮纸', en: 'Kraft', sw: '#d2ae84', paper: '#d2ae84', ribbon: '#f5f0e6' },
  blush: { zh: '樱粉', en: 'Blush', sw: '#f3c9cf', paper: '#f3c9cf', ribbon: '#c4626b' },
  cream: { zh: '米白', en: 'Cream', sw: '#f2ead9', paper: '#f2ead9', ribbon: '#7d9a72' },
  sage: { zh: '鼠尾草', en: 'Sage', sw: '#b7c5a8', paper: '#b7c5a8', ribbon: '#fbf7ef' },
};
const WEAVES = {
  natural: { zh: '原木', en: 'Natural', sw: '#c89a5e', base: '#c89a5e', line: '#a87a42' },
  walnut: { zh: '深棕', en: 'Walnut', sw: '#7a5434', base: '#7a5434', line: '#5a3b20' },
};

const glass = (id, d, o) => ({
  palette: TINTS, mouth: o.mouth, reach: o.reach, spread: o.spread,
  back: t => `<ellipse cx="300" cy="${o.floor}" rx="${o.shadow}" ry="10" fill="rgba(0,0,0,.13)" filter="url(#pz-soft)"/><path d="${d}" fill="${t.back}"/>`,
  front: t => `<defs><clipPath id="vc-${id}"><path d="${d}"/></clipPath>` +
    `<linearGradient id="vg-${id}" gradientUnits="userSpaceOnUse" x1="${o.l}" x2="${o.r}" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".14"/><stop offset=".14" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>` +
    `<path d="${d}" fill="${t.glass}"/>` +
    `<g clip-path="url(#vc-${id})"><rect x="100" y="${o.water}" width="400" height="300" fill="${t.water}"/>` +
    `<rect x="100" y="${o.water - 1}" width="400" height="3" fill="#fff" opacity=".4"/>` +
    (o.base ? `<rect x="100" y="${o.base}" width="400" height="60" fill="${t.edge}" opacity=".22"/><rect x="100" y="${o.base}" width="400" height="2" fill="#fff" opacity=".35"/>` : '') +
    `<rect x="100" y="0" width="400" height="720" fill="url(#vg-${id})"/></g>` +
    `<path d="${d}" fill="none" stroke="${t.edge}" stroke-width="2.4" stroke-linejoin="round"/>` +
    o.hl.map(([h, w]) => `<path d="${h}" stroke="#fff" stroke-width="${w}" opacity=".55" fill="none" stroke-linecap="round"/>`).join('') +
    (o.rim ? `<ellipse cx="300" cy="${o.rim[0]}" rx="${o.rim[1]}" ry="4.5" fill="none" stroke="${t.edge}" stroke-width="2"/>` : '') +
    (o.lip ? `<path d="${o.lip}" stroke="${t.edge}" stroke-width="4" stroke-linecap="round"/>` : ''),
});

const VASES = {
  classic: {
    zh: '经典瓶', en: 'Classic',
    ...glass('classic', 'M240 470 Q232 470 234 480 Q250 560 236 640 Q232 690 300 692 Q368 690 364 640 Q350 560 366 480 Q368 470 360 470Z', {
      l: 232, r: 368, water: 548, floor: 694, shadow: 88, rim: [471, 63],
      hl: [['M252 490 Q262 560 252 640', 5], ['M352 500 Q344 540 350 580', 2]],
      mouth: { x: 300, y: 474, half: 50, inner: 46, bottom: 676 }, reach: 200,
    }),
  },
  square: {
    zh: '方瓶', en: 'Square',
    ...glass('square', 'M228 474 L372 474 L372 680 Q372 690 362 690 L238 690 Q228 690 228 680Z', {
      l: 228, r: 372, water: 540, base: 668, floor: 694, shadow: 92, lip: 'M228 474 L372 474',
      hl: [['M242 492 L242 652', 5], ['M358 496 L358 540', 2]],
      mouth: { x: 300, y: 476, half: 60, inner: 56, bottom: 664 }, reach: 205,
    }),
  },
  cylinder: {
    zh: '高筒', en: 'Tall',
    ...glass('cylinder', 'M258 408 L342 408 L342 676 Q342 690 328 690 L272 690 Q258 690 258 676Z', {
      l: 258, r: 342, water: 500, base: 672, floor: 694, shadow: 58, rim: [408, 42],
      hl: [['M269 426 L269 662', 4]],
      mouth: { x: 300, y: 410, half: 34, inner: 32, bottom: 668 }, reach: 175, spread: 155,
    }),
  },
  bubble: {
    zh: '圆球', en: 'Bubble',
    ...glass('bubble', 'M262 502 L262 508 A95 95 0 1 0 338 508 L338 502Z', {
      l: 205, r: 395, water: 562, floor: 693, shadow: 82, rim: [502, 38],
      hl: [['M224 562 Q214 612 238 654', 6], ['M370 560 Q378 586 374 606', 2]],
      mouth: { x: 300, y: 504, half: 30, inner: 70, bottom: 664 }, reach: 190,
    }),
  },
  trumpet: {
    zh: '喇叭瓶', en: 'Trumpet',
    ...glass('trumpet', 'M212 452 Q262 466 272 560 Q276 640 252 690 L348 690 Q324 640 328 560 Q338 466 388 452Z', {
      l: 212, r: 388, water: 590, floor: 694, shadow: 66, rim: [452, 88],
      hl: [['M230 462 Q262 480 268 540', 4]],
      mouth: { x: 300, y: 456, half: 68, inner: 24, bottom: 678 }, reach: 210,
    }),
  },
  wrap: {
    zh: '包装纸', en: 'Wrap',
    palette: PAPERS, mouth: { x: 300, y: 588, half: 12, inner: 20, bottom: 682 }, reach: 320, spread: 150,
    back: t => `<ellipse cx="300" cy="694" rx="80" ry="10" fill="rgba(0,0,0,.12)" filter="url(#pz-soft)"/>` +
      `<path d="M170 300 Q300 262 430 300 L330 690 L270 690Z" fill="${shade(t.paper, -0.18)}"/>`,
    front: t => `<path d="M140 400 Q300 470 460 400 L330 690 L270 690Z" fill="${t.paper}"/>` +
      `<path d="M140 400 Q220 452 312 462 L284 690 L270 690Z" fill="${shade(t.paper, -0.07)}"/>` +
      `<path d="M200 430 L284 660 M380 440 L320 660" stroke="${shade(t.paper, -0.15)}" stroke-width="1.2" opacity=".6"/>` +
      `<path d="M300 590 C262 560 240 590 262 606 C276 614 292 600 300 590Z M300 590 C338 560 360 590 338 606 C324 614 308 600 300 590Z" fill="${t.ribbon}"/>` +
      `<path d="M300 592 L284 650 M300 592 L318 646" stroke="${t.ribbon}" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="300" cy="592" r="7" fill="${shade(t.ribbon, -0.15)}"/>`,
  },
  basket: {
    zh: '藤编篮', en: 'Basket',
    palette: WEAVES, mouth: { x: 300, y: 496, half: 90, inner: 70, bottom: 640 }, reach: 195,
    back: t => `<ellipse cx="300" cy="690" rx="100" ry="10" fill="rgba(0,0,0,.13)" filter="url(#pz-soft)"/>` +
      `<path d="M206 500 Q300 250 394 500" stroke="${t.line}" stroke-width="10" fill="none"/>` +
      `<path d="M206 500 Q300 250 394 500" stroke="${shade(t.base, 0.15)}" stroke-width="3" fill="none" stroke-dasharray="8 6"/>`,
    front: t => `<defs><clipPath id="vc-basket"><path d="M198 496 L402 496 L380 670 Q300 688 220 670Z"/></clipPath>` +
      `<linearGradient id="vg-basket" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>` +
      `<path d="M198 496 L402 496 L380 670 Q300 688 220 670Z" fill="${t.base}"/>` +
      `<g clip-path="url(#vc-basket)" stroke="${t.line}" stroke-width="2" fill="none">` +
      Array.from({ length: 9 }, (_, i) => `<path d="M190 ${520 + i * 20} Q300 ${530 + i * 20} 410 ${520 + i * 20}"/>`).join('') +
      Array.from({ length: 12 }, (_, i) => `<path d="M${210 + i * 17} 496 L${220 + i * 15} 690" stroke-dasharray="10 10" stroke-dashoffset="${(i % 2) * 10}"/>`).join('') +
      `<rect x="190" y="490" width="220" height="200" fill="url(#vg-basket)" stroke="none"/></g>` +
      `<rect x="192" y="488" width="216" height="16" rx="8" fill="${t.line}"/><rect x="198" y="491" width="204" height="3" rx="1.5" fill="#fff" opacity=".25"/>`,
  },
};

// ---------- Backdrops ----------
const table = (top, front) => `<rect y="652" width="600" height="68" fill="${front}"/><rect y="652" width="600" height="5" fill="${top}"/>`;

const bokeh = (n, seed, colors, area) => {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<circle cx="${(area[0] + r() * area[2]).toFixed(0)}" cy="${(area[1] + r() * area[3]).toFixed(0)}" r="${(8 + r() * 22).toFixed(0)}" fill="${colors[i % colors.length]}" opacity="${(0.12 + r() * 0.25).toFixed(2)}" filter="url(#pz-blur-s)"/>`;
  }
  return s;
};
const rainStreaks = seed => {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < 70; i++) {
    const x = (90 + r() * 440).toFixed(0), y = (r() * 500).toFixed(0), len = (14 + r() * 26).toFixed(0);
    const line = yy => `<path d="M${x} ${yy} l-4 ${len}" stroke="#dbe6f2" stroke-width="${(0.6 + r() * 0.8).toFixed(1)}" opacity="${(0.2 + r() * 0.35).toFixed(2)}"/>`;
    s += line(y) + line(y - 500);
  }
  return s;
};

const BGS = {
  cream: {
    zh: '奶油', en: 'Cream', sw: '#f7f1e8',
    svg: `<rect width="600" height="720" fill="#f7f1e8"/><ellipse cx="300" cy="300" rx="300" ry="260" fill="#fffaf2" opacity=".8" filter="url(#pz-blur)"/>` + table('#efe4d4', '#e6d8c4'),
  },
  blush: {
    zh: '樱粉', en: 'Blush', sw: '#f8e2e0',
    svg: `<rect width="600" height="720" fill="#f8e2e0"/><ellipse cx="300" cy="300" rx="300" ry="260" fill="#fdf1ef" opacity=".8" filter="url(#pz-blur)"/>` + table('#f3d3cf', '#ebc6c1'),
  },
  sage: {
    zh: '鼠尾草', en: 'Sage', sw: '#e1eadc',
    svg: `<rect width="600" height="720" fill="#e1eadc"/><ellipse cx="300" cy="300" rx="300" ry="260" fill="#f1f5ec" opacity=".8" filter="url(#pz-blur)"/>` + table('#d3dfcb', '#c6d4bd'),
  },
  sky: {
    zh: '晴空', en: 'Sky', sw: '#e0ebf5',
    svg: `<rect width="600" height="720" fill="#e0ebf5"/><ellipse cx="300" cy="300" rx="300" ry="260" fill="#f1f6fb" opacity=".8" filter="url(#pz-blur)"/>` + table('#d3e1ee', '#c6d6e6'),
  },
  lilac: {
    zh: '淡紫', en: 'Lilac', sw: '#e9e1f4',
    svg: `<rect width="600" height="720" fill="#e9e1f4"/><ellipse cx="300" cy="300" rx="300" ry="260" fill="#f5f0fa" opacity=".8" filter="url(#pz-blur)"/>` + table('#ddd1ec', '#d0c2e3'),
  },
  rain: {
    zh: '雨天窗边', en: 'Rainy window', sw: 'linear-gradient(#3b4250, #6d7f95)', dark: true,
    svg: `<defs><linearGradient id="bg-rain-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e6f86"/><stop offset="1" stop-color="#93a5b8"/></linearGradient>` +
      `<clipPath id="bg-rain-clip"><rect x="84" y="64" width="432" height="492"/></clipPath></defs>` +
      `<rect width="600" height="720" fill="#363d4a"/><rect x="70" y="50" width="460" height="520" fill="#262b34"/>` +
      `<rect x="84" y="64" width="432" height="492" fill="url(#bg-rain-glass)"/>` +
      `<g clip-path="url(#bg-rain-clip)">` + bokeh(18, 21, ['#f0c27a', '#9fc3e6', '#f5d9a6'], [84, 300, 432, 250]) +
      `<path d="M84 470 L140 440 L170 455 L220 410 L260 430 L330 380 L380 420 L430 400 L516 440 L516 556 L84 556Z" fill="#46505f" opacity=".7" filter="url(#pz-soft)"/>` +
      `<g>${rainStreaks(5)}<animateTransform attributeName="transform" type="translate" from="0 0" to="-40 500" dur="1.6s" repeatCount="indefinite"/></g>` +
      Array.from({ length: 26 }, (_, i) => { const r = rng(40 + i); const x = 90 + r() * 420, y = 70 + r() * 480, s = 1.2 + r() * 2.2; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(1)}" fill="#e8f0f8" opacity=".55"/><circle cx="${(x - s * 0.3).toFixed(1)}" cy="${(y - s * 0.3).toFixed(1)}" r="${(s * 0.35).toFixed(1)}" fill="#fff"/>`; }).join('') +
      `</g><rect x="295" y="64" width="10" height="492" fill="#262b34"/><rect x="84" y="300" width="432" height="10" fill="#262b34"/>` +
      `<rect x="50" y="556" width="500" height="26" fill="#cfc7bb"/><rect x="50" y="580" width="500" height="6" fill="#a9a196"/>` +
      `<rect y="652" width="600" height="68" fill="#2a2f38"/><rect y="652" width="600" height="4" fill="#3d4450"/>` +
      `<rect width="600" height="720" fill="url(#pz-depth)" opacity=".25"/>`,
  },
  starry: {
    zh: '星空', en: 'Starry night', sw: '#2b2f3e', dark: true,
    svg: `<rect width="600" height="720" fill="#2b2f3e"/>` +
      Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 137) % 600}" cy="${(i * 89) % 560}" r="${(i % 3) * 0.6 + 0.6}" fill="#fff" opacity="${0.25 + (i % 4) * 0.15}"/>`).join('') +
      `<circle cx="500" cy="100" r="30" fill="#f6eccb" opacity=".9"/><rect y="660" width="600" height="60" fill="#22252f"/>`,
  },
  black: {
    zh: '黑', en: 'Black', sw: '#141414', dark: true,
    svg: `<rect width="600" height="720" fill="#111"/><ellipse cx="300" cy="320" rx="260" ry="300" fill="#2c2c2c" opacity=".9" filter="url(#pz-blur)"/>` +
      `<rect y="652" width="600" height="68" fill="#0a0a0a"/><rect y="652" width="600" height="3" fill="#2a2a2a"/>`,
  },
};

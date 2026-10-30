(() => {
  const $ = s => document.querySelector(s);
  const canvas = $('#canvas');
  const TABS = [['all', 'tabAll'], ['main', 'tabMain'], ['field', 'tabField'], ['lily', 'tabLily'], ['tropic', 'tabTropic'], ['green', 'tabGreen'], ['dried', 'tabDried']];
  const BYKEY = Object.fromEntries(CATALOG.map(f => [f.k, f]));
  const svgCache = {};
  const flowerSVG = k => svgCache[k] ??= TYPES[BYKEY[k].t].draw(BYKEY[k].c);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = n => n.toFixed(1);
  // Big blooms like hydrangea get scaled down so every flower starts at a similar size
  const fit = k => clamp(30 / TYPES[BYKEY[k].t].hit[2], 0.72, 1.08);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };

  const CARD_PAPERS = {
    plain: { zh: '素白', en: 'Plain', bg: '#fffaf3', ink: '#3b3230', sub: '#8b7f78' },
    floral: { zh: '花边', en: 'Floral', bg: '#fff8f6', ink: '#5a3a3e', sub: '#a07a7e' },
  };
  const CARD_FONTS = {
    serif: { zh: '优雅', en: 'Classic', css: 'Fraunces, "Noto Serif SC", serif', k: 1 },
    hand: { zh: '手写', en: 'Handwritten', css: 'Caveat, "Long Cang", cursive', k: 1.3 },
    brush: { zh: '毛笔', en: 'Brush', css: '"Dancing Script", "Ma Shan Zheng", cursive', k: 1.2 },
    cute: { zh: '可爱', en: 'Cute', css: '"Patrick Hand", "ZCOOL KuaiLe", sans-serif', k: 1.15 },
  };

  // ---------- Language ----------
  let lang = store.get('posey-lang') || (navigator.language?.startsWith('zh') ? 'zh' : 'en');
  const t = (key, vars = {}) => (I18N[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
  const label = o => o[lang] || o.en;
  const meaning = f => (lang === 'zh' ? f.mz : f.me) || '';

  function applyI18n() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('docTitle');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  }

  $('#btnLang').onclick = () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    store.set('posey-lang', lang);
    applyI18n(); buildLibrary(); buildOptions(); buildCardOptions(); render();
    if (received) fillReceived();
  };

  // ---------- State & history ----------
  let state = { items: [], vase: 'classic', tint: 'clear', bg: 'cream' };
  let card = { to: '', from: '', note: '', paper: 'plain', font: 'serif' };
  let selected = null, uid = 1, drag = null, tab = 'all';
  let occasion = null; // set by "Help me pick" to show only flowers whose meaning fits
  const popIds = new Set();
  const history = [];

  const vessel = st => VASES[st.vase] || VASES.classic;
  const tintOf = st => { const v = vessel(st); return v.palette[st.tint] || Object.values(v.palette)[0]; };
  const snap = () => JSON.stringify({ items: state.items, vase: state.vase, tint: state.tint, bg: state.bg });
  const pushHistory = () => { history.push(snap()); if (history.length > 80) history.shift(); };
  const current = () => state.items.find(i => i.id === selected);

  function undo() {
    if (!history.length) return toast(t('nothingUndo'));
    Object.assign(state, JSON.parse(history.pop()));
    if (!current()) selected = null;
    buildOptions();
    render();
  }

  // ---------- Geometry ----------
  const tf = it => `translate(${f1(it.x)} ${f1(it.y)}) rotate(${it.rot}) scale(${(it.s * (it.fh ? -1 : 1)).toFixed(3)} ${(it.s * (it.fv ? -1 : 1)).toFixed(3)})`;

  function toCanvas(it, lx, ly) {
    const x = lx * it.s * (it.fh ? -1 : 1), y = ly * it.s * (it.fv ? -1 : 1);
    const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: it.x + x * c - y * s, y: it.y + x * s + y * c };
  }

  // Stable per-stem randomness, so a stem keeps its shape while it is dragged
  const jitter = (id, salt) => { const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };

  // A stem runs from the bloom into the vessel mouth with a slight bow, then continues
  // inside and leans the other way. Entry and end points are scattered per stem, so the
  // stems cross naturally at different heights instead of all meeting in one point.
  function stemMarkup(it, v) {
    const T = TYPES[BYKEY[it.k].t], m = v.mouth;
    const p = toCanvas(it, T.base[0], T.base[1]);
    const k = clamp(it.s, 0.7, 1.4);
    const dx = p.x - m.x;
    const ex = clamp(m.x - dx * 0.2 + jitter(it.id, 2) * m.inner * 0.7, m.x - m.inner, m.x + m.inner);
    let d, leaves = '';
    if (p.y < m.y - 8) {
      const mx = clamp(m.x + dx * 0.25 + jitter(it.id, 1) * m.half * 0.45, m.x - m.half, m.x + m.half);
      const h = m.y - p.y, bow = jitter(it.id, 3) * h * 0.06;
      const cx = (p.x + mx) / 2 + bow, cy = (p.y + m.y) / 2;
      d = `M${f1(p.x)} ${f1(p.y)} Q${f1(cx)} ${f1(cy)} ${f1(mx)} ${m.y} L${f1(ex)} ${m.bottom}`;
      const L = T.lf && STEM_LEAVES[T.lf];
      if (L && h > 70) {
        [[0.34, 1], [0.58, -1]].forEach(([u, side], i) => {
          if (i === 1 && h < 140) return;
          const qx = (1 - u) ** 2 * p.x + 2 * (1 - u) * u * cx + u * u * mx;
          const qy = (1 - u) ** 2 * p.y + 2 * (1 - u) * u * cy + u * u * m.y;
          const tx = 2 * (1 - u) * (cx - p.x) + 2 * u * (mx - cx), ty = 2 * (1 - u) * (cy - p.y) + 2 * u * (m.y - cy);
          const up = Math.atan2(-ty, -tx) * 180 / Math.PI;
          const tr = `transform="translate(${f1(qx)} ${f1(qy)}) rotate(${f1(up + (it.id % 2 ? 1 : -1) * side * 38)}) scale(${(L.s * k).toFixed(2)})"`;
          leaves += `<path d="${L.d}" fill="${T.lc}" ${tr}/><path d="${L.d}" fill="url(#pz-sheen)" ${tr}/>`;
        });
      }
    } else {
      d = `M${f1(p.x)} ${f1(p.y)} L${f1(ex)} ${m.bottom}`;
    }
    return `<path d="${d}" stroke="${T.sc}" stroke-width="${(T.sw * k).toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + leaves;
  }

  // ---------- Rendering ----------
  function itemMarkup(it, interactive, i) {
    const [cx, cy, r] = TYPES[BYKEY[it.k].t].hit;
    const pop = interactive && popIds.has(it.id) ? ` class="pop" style="animation-delay:${i * 35}ms"` : '';
    return `<g class="fl" data-id="${it.id}" transform="${tf(it)}" opacity="${it.op}"><g${pop}>` +
      (interactive ? `<circle class="hit" cx="${cx}" cy="${cy}" r="${r}" fill="transparent"/>` : '') +
      flowerSVG(it.k) + `</g></g>`;
  }

  function scene(st, interactive = false) {
    const v = vessel(st), tint = tintOf(st), b = BGS[st.bg] || BGS.cream;
    const items = st.items.filter(it => BYKEY[it.k]);
    return DEFS + b.svg + v.back(tint) +
      `<g class="stems">${items.map(it => `<g class="stemg" data-sid="${it.id}" opacity="${it.op}">${stemMarkup(it, v)}</g>`).join('')}</g>` +
      items.map((it, i) => itemMarkup(it, interactive, i)).join('') + v.front(tint);
  }

  function ringMarkup(it) {
    const [cx, cy, r] = TYPES[BYKEY[it.k].t].hit;
    return `<g id="selRing" transform="${tf(it)}" pointer-events="none"><circle class="sel-ring" cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="#c4626b" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/></g>`;
  }

  function render() {
    const it = current();
    canvas.innerHTML = scene(state, true) + (it ? ringMarkup(it) : '');
    popIds.clear();
    $('.canvas-wrap').classList.toggle('dark', !!(BGS[state.bg] || {}).dark);
    $('#emptyHint').hidden = state.items.length > 0;
    $('#count').textContent = state.items.length ? t('count', { n: state.items.length }) : '';
    document.querySelectorAll('.vase-opt').forEach(b => b.classList.toggle('on', b.dataset.v === state.vase));
    document.querySelectorAll('.tint-opt').forEach(b => b.classList.toggle('on', b.dataset.t === state.tint));
    document.querySelectorAll('.bg-opt').forEach(b => b.classList.toggle('on', b.dataset.b === state.bg));
    updatePanel();
  }

  function updatePanel() {
    const it = current();
    $('#noSel').hidden = !!it;
    $('#selCtrls').hidden = !it;
    if (!it) return;
    $('#selName').textContent = label(BYKEY[it.k]);
    $('#selMeaning').textContent = meaning(BYKEY[it.k]);
    $('#inSize').value = Math.round(it.s * 100); $('#vSize').textContent = Math.round(it.s * 100) + '%';
    $('#inRot').value = Math.round(it.rot); $('#vRot').textContent = Math.round(it.rot) + '°';
    $('#inOp').value = Math.round(it.op * 100); $('#vOp').textContent = Math.round(it.op * 100) + '%';
  }

  // Update one stem in place so dragging doesn't redraw the whole scene
  function patchItem(it) {
    const g = canvas.querySelector(`.fl[data-id="${it.id}"]`);
    if (g) { g.setAttribute('transform', tf(it)); g.setAttribute('opacity', it.op); }
    const sg = canvas.querySelector(`.stemg[data-sid="${it.id}"]`);
    if (sg) { sg.innerHTML = stemMarkup(it, vessel(state)); sg.setAttribute('opacity', it.op); }
    $('#selRing')?.setAttribute('transform', tf(it));
  }

  // ---------- Flower library ----------
  const thumb = f => {
    const T = TYPES[f.t], [cx, cy, r] = T.hit, R = r * 1.4, [bx, by] = T.base;
    return `<svg viewBox="${cx - R} ${cy - R} ${2 * R} ${2 * R}"><path d="M${bx} ${by} L${bx} ${by + 90}" stroke="${T.sc}" stroke-width="${T.sw}" stroke-linecap="round"/>${flowerSVG(f.k)}</svg>`;
  };

  function buildLibrary() {
    $('#tabs').innerHTML = (occasion ? `<button class="on occ-tab" data-clear-occ title="${t('clearOcc')}">${t('occFilter', { occ: label(OCCASIONS[occasion]) })} ×</button>` : '') +
      TABS.map(([k, key]) => `<button role="tab" data-tab="${k}" class="${!occasion && k === tab ? 'on' : ''}">${t(key)}</button>`).join('');
    const list = occasion ? CATALOG.filter(f => f.for.includes(occasion)) : CATALOG.filter(f => tab === 'all' || f.cat.includes(tab));
    $('#grid').innerHTML = list.map(f =>
      `<button class="flower-card" draggable="true" data-k="${f.k}" title="${esc(`${label(f)} · ${meaning(f)}`)}">${thumb(f)}` +
      `<span>${esc(label(f))}</span>${occasion ? `<small>${esc(meaning(f))}</small>` : ''}</button>`).join('');
  }

  $('#tabs').addEventListener('click', e => {
    if (e.target.closest('[data-clear-occ]')) { occasion = null; buildLibrary(); return; }
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; occasion = null; buildLibrary(); }
  });
  // Drop a flower somewhere above the vessel mouth
  const addSomewhere = k => {
    const v = vessel(state), m = v.mouth;
    addFlower(k, { x: m.x + rand(-125, 125), y: m.y - v.reach * rand(0.7, 1) });
  };
  $('#grid').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    if (longPressed) { longPressed = false; return; }
    addSomewhere(b.dataset.k);
  });

  // Press and hold a flower card to see its meaning (花语) instead of adding it
  let pressTimer = null, popTimer = null, longPressed = false;
  const hidePop = () => { clearTimeout(popTimer); $('#meaningPop').hidden = true; };
  $('#grid').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-k]');
    hidePop();
    if (!b) return;
    longPressed = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      const f = BYKEY[b.dataset.k], pop = $('#meaningPop'), r = b.getBoundingClientRect();
      longPressed = true;
      pop.innerHTML = `<b>${esc(label(f))}</b><span>${esc(meaning(f))}</span>`;
      pop.hidden = false;
      const w = pop.offsetWidth, h = pop.offsetHeight;
      pop.style.left = `${clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)}px`;
      pop.style.top = `${r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8}px`;
    }, 450);
  });
  const endPress = () => {
    clearTimeout(pressTimer);
    if (longPressed) { clearTimeout(popTimer); popTimer = setTimeout(hidePop, 2200); }
  };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => $('#grid').addEventListener(ev, endPress));
  $('#grid').addEventListener('dragstart', () => clearTimeout(pressTimer));
  $('#grid').addEventListener('contextmenu', e => { if (e.target.closest('[data-k]')) e.preventDefault(); });
  document.addEventListener('scroll', hidePop, true);
  $('#grid').addEventListener('dragstart', e => {
    const b = e.target.closest('[data-k]');
    if (b) e.dataTransfer.setData('text/plain', b.dataset.k);
  });
  canvas.addEventListener('dragover', e => e.preventDefault());
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const k = e.dataTransfer.getData('text/plain');
    if (BYKEY[k]) addFlower(k, toSvg(e));
  });

  function addFlower(k, { x, y }) {
    pushHistory();
    const m = vessel(state).mouth;
    // Tilt the bloom away from the centre, the way stems fan out of a vase
    const it = { id: uid++, k, x: clamp(x, 20, 580), y: clamp(y, 20, 700), s: +(1.45 * fit(k)).toFixed(2), rot: Math.round(clamp((x - m.x) / 3, -40, 40) + rand(-5, 5)), op: 1, fh: Math.random() < 0.5 ? 1 : 0, fv: 0 };
    state.items.push(it);
    selected = it.id;
    popIds.add(it.id);
    render();
  }

  // ---------- Canvas interaction ----------
  function toSvg(e) {
    const p = canvas.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(canvas.getScreenCTM().inverse());
  }

  canvas.addEventListener('pointerdown', e => {
    const g = e.target.closest('.fl');
    if (!g) { if (selected !== null) { selected = null; render(); } return; }
    const it = state.items.find(i => i.id === +g.dataset.id);
    const p = toSvg(e);
    drag = { it, dx: p.x - it.x, dy: p.y - it.y, before: snap(), moved: false };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
    if (selected !== it.id) { selected = it.id; render(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = toSvg(e);
    drag.it.x = clamp(p.x - drag.dx, 0, 600);
    drag.it.y = clamp(p.y - drag.dy, 0, 720);
    drag.moved = true;
    patchItem(drag.it);
  });
  const endDrag = () => {
    if (drag?.moved) history.push(drag.before);
    drag = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- Properties panel ----------
  let sliding = false;
  [['#inSize', (it, v) => it.s = v / 100], ['#inRot', (it, v) => it.rot = v], ['#inOp', (it, v) => it.op = v / 100]].forEach(([id, set]) => {
    const el = $(id);
    el.addEventListener('input', () => {
      const it = current(); if (!it) return;
      if (!sliding) { pushHistory(); sliding = true; }
      set(it, +el.value);
      patchItem(it);
      updatePanel();
    });
    el.addEventListener('change', () => { sliding = false; });
  });

  $('#selCtrls').addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const it = current();
    if (!act || !it) return;
    pushHistory();
    const arr = state.items, i = arr.indexOf(it);
    const move = j => { arr.splice(i, 1); arr.splice(clamp(j, 0, arr.length), 0, it); };
    switch (act) {
      case 'flipH': it.fh = it.fh ? 0 : 1; break;
      case 'flipV': it.fv = it.fv ? 0 : 1; break;
      case 'front': move(arr.length); break;
      case 'forward': move(i + 1); break;
      case 'back': move(i - 1); break;
      case 'bottom': move(0); break;
      case 'dup': {
        const c = { ...it, id: uid++, x: clamp(it.x + 24, 0, 600), y: clamp(it.y - 16, 0, 720) };
        arr.splice(i + 1, 0, c); selected = c.id; popIds.add(c.id); break;
      }
      case 'del': arr.splice(i, 1); selected = null; break;
    }
    render();
  });

  // ---------- Vessels, tints, backdrops ----------
  function buildOptions() {
    const v0 = vessel(state);
    if (!v0.palette[state.tint]) state.tint = Object.keys(v0.palette)[0];
    const preview = (v, tint) => `<svg viewBox="130 240 340 480">${v.back(tint)}${v.front(tint)}</svg>`;
    $('#vases').innerHTML = Object.entries(VASES).map(([k, v]) =>
      `<button class="vase-opt" data-v="${k}">${preview(v, k === state.vase ? tintOf(state) : Object.values(v.palette)[0])}<span>${label(v)}</span></button>`).join('');
    $('#tints').innerHTML = Object.entries(v0.palette).map(([k, c]) =>
      `<button class="tint-opt" data-t="${k}" title="${label(c)}" style="--c:${c.sw}"><i></i><span>${label(c)}</span></button>`).join('');
    $('#bgs').innerHTML = Object.entries(BGS).map(([k, b]) =>
      `<button class="bg-opt" data-b="${k}" title="${label(b)}" style="--c:${b.sw}"><i></i><span>${label(b)}</span></button>`).join('');
  }

  // Keep the arrangement in the same place relative to the new vessel's mouth
  function switchVessel(key) {
    const a = vessel(state), b = VASES[key];
    const k = b.reach / a.reach;
    state.items.forEach(it => {
      it.x = clamp(b.mouth.x + (it.x - a.mouth.x) * k, 10, 590);
      it.y = clamp(b.mouth.y - (a.mouth.y - it.y) * k, 10, 700);
    });
    state.vase = key;
  }

  $('#vases').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b || b.dataset.v === state.vase) return;
    pushHistory(); switchVessel(b.dataset.v); buildOptions(); render();
  });
  $('#tints').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b || b.dataset.t === state.tint) return;
    pushHistory(); state.tint = b.dataset.t; buildOptions(); render();
  });
  $('#bgs').addEventListener('click', e => {
    const b = e.target.closest('[data-b]');
    if (b && b.dataset.b !== state.bg) { pushHistory(); state.bg = b.dataset.b; render(); }
  });

  // ---------- Toolbar ----------
  $('#btnUndo').onclick = undo;
  $('#btnClear').onclick = () => {
    if (!state.items.length) return;
    pushHistory(); state.items = []; selected = null; render();
    toast(t('cleared'));
  };
  $('#btnRandom').onclick = () => randomBouquet();

  // With an occasion, flowers whose meaning suits it are preferred; otherwise anything goes.
  // With `chosen` (catalog keys), only those flowers are used, each in the role its category suggests.
  function randomBouquet(occ = null, chosen = null) {
    pushHistory();
    const pick = (cats, also = () => true) => {
      const l = CATALOG.filter(f => cats.some(c => f.cat.includes(c)) && also(f));
      const suits = occ ? l.filter(f => f.for.includes(occ)) : [];
      const pool = suits.length ? suits : l;
      return pool[Math.random() * pool.length | 0].k;
    };
    const mainCats = occ ? ['main', 'lily', 'tropic'] : ['main'], notGreen = f => !f.cat.includes('green');
    const main = pick(mainCats, notGreen), main2 = Math.random() < 0.6 ? pick(mainCats, notGreen) : main;
    const filler = pick(['field', 'dried']), green = pick(['green']), green2 = pick(['green', 'dried']);
    let greenAt = i => i % 2 ? green : green2, fillerAt = () => filler, mainAt = i => i % 2 ? main2 : main;
    if (chosen) {
      const fs = chosen.map(k => BYKEY[k]);
      const role = f => f.cat.includes('green') ? 'green' : f.cat.some(c => c === 'field' || c === 'dried') ? 'filler' : 'main';
      // Each slot type cycles through its chosen flowers in a shuffled order; an empty role borrows from the rest
      const cycler = r => {
        const l = fs.filter(f => role(f) === r).map(f => f.k), pool = l.length ? l : chosen.slice();
        pool.sort(() => Math.random() - 0.5);
        return i => pool[i % pool.length];
      };
      [greenAt, fillerAt, mainAt] = ['green', 'filler', 'main'].map(cycler);
    }
    // Any glass vase (mostly clear, sometimes a soft tint), or the first version's wraps and basket
    const glassTint = Math.random() < 0.6 ? 'clear' : ['pink', 'blue', 'lilac', 'green'][Math.random() * 4 | 0];
    const choices = [...['classic', 'square', 'cylinder', 'bubble', 'trumpet'].map(g => [g, glassTint]), ['wrap', 'kraft'], ['wrap', 'blush'], ['basket', 'natural']];
    [state.vase, state.tint] = choices[Math.random() * choices.length | 0];
    const items = [];
    const add = (k, a, r, s) => {
      const rad = a * Math.PI / 180;
      items.push({ id: uid++, k, x: 300 + Math.sin(rad) * r, y: 470 - Math.cos(rad) * r, s: +(s * fit(k)).toFixed(2), rot: Math.round(a * 0.7 + rand(-6, 6)), op: 1, fh: Math.random() < 0.5 ? 1 : 0, fv: 0 });
    };
    [-50, -20, 20, 50].forEach((a, i) => add(greenAt(i), a + rand(-8, 8), rand(235, 270), rand(1.15, 1.35)));
    [-42, 0, 42].forEach((a, i) => add(fillerAt(i), a + rand(-10, 10), rand(225, 260), rand(0.95, 1.15)));
    [[-46, 195], [-16, 240], [16, 235], [46, 190], [0, 175], [-30, 150], [30, 155]]
      .forEach(([a, r], i) => add(mainAt(i), a + rand(-5, 5), r + rand(-10, 10), rand(1.1, 1.3)));
    state.items = items;
    selected = null;
    items.forEach(it => popIds.add(it.id));
    buildOptions();
    render();
  }

  // ---------- Help me pick ----------
  let helpOcc = null;
  $('#btnHelp').onclick = () => {
    $('#occasionOpts').innerHTML = Object.entries(OCCASIONS).map(([k, o]) => `<button class="occ-opt" data-occ="${k}">${label(o)}</button>`).join('');
    showHelp('#help0');
    $('#helpModal').hidden = false;
  };
  // help0: choose a path · help1: occasions · help2: flowers for an occasion · help3: pick your own flowers
  const showHelp = id => ['#help0', '#help1', '#help2', '#help3'].forEach(h => { $(h).hidden = h !== id; });
  $('#btnPathOcc').onclick = () => showHelp('#help1');
  $('#btnOccBack').onclick = () => showHelp('#help0');
  $('#occasionOpts').addEventListener('click', e => {
    const b = e.target.closest('[data-occ]');
    if (!b) return;
    helpOcc = b.dataset.occ;
    $('#helpOccTitle').textContent = label(OCCASIONS[helpOcc]);
    $('#helpPicks').innerHTML = CATALOG.filter(f => f.for.includes(helpOcc)).map(f =>
      `<li><button class="pick" data-k="${f.k}" title="${esc(t('add', { name: label(f) }))}">${thumb(f)}<b>${esc(label(f))}</b>` +
      `<span>${esc(meaning(f))}</span><em class="added" hidden></em><i class="plus">+</i></button></li>`).join('');
    showHelp('#help2');
  });
  // Tap a suggested flower to put it straight onto the canvas
  $('#helpPicks').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    addSomewhere(b.dataset.k);
    const badge = b.querySelector('.added');
    badge.textContent = `×${(+badge.textContent.slice(1) || 0) + 1}`;
    badge.hidden = false;
    toast(t('added', { name: label(BYKEY[b.dataset.k]) }));
  });
  $('#btnHelpBack').onclick = () => showHelp('#help1');
  $('#btnHelpAuto').onclick = () => {
    $('#helpModal').hidden = true;
    occasion = helpOcc; buildLibrary();
    randomBouquet(helpOcc);
  };
  $('#btnHelpSelf').onclick = () => {
    $('#helpModal').hidden = true;
    occasion = helpOcc; buildLibrary();
    $('.library').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // "I pick the flowers, you arrange": toggle flowers, then a random bouquet made only of them
  const chosen = new Set();
  const updateChooseMake = () => {
    const b = $('#btnChooseMake');
    b.disabled = !chosen.size;
    b.textContent = chosen.size ? t('chooseMake', { n: chosen.size }) : t('chooseNone');
  };
  let chooseOcc = 'all'; // grid grouped by the same occasions as the meaning picker
  const buildChooser = () => {
    $('#chooseTabs').innerHTML = [['all', t('tabAll')], ...Object.entries(OCCASIONS).map(([k, o]) => [k, label(o)])]
      .map(([k, name]) => `<button data-occ="${k}" class="${k === chooseOcc ? 'on' : ''}">${name}</button>`).join('');
    $('#chooseGrid').innerHTML = CATALOG.filter(f => chooseOcc === 'all' || f.for.includes(chooseOcc)).map(f =>
      `<button class="${chosen.has(f.k) ? 'on' : ''}" data-k="${f.k}" aria-pressed="${chosen.has(f.k)}" title="${esc(label(f))} · ${esc(meaning(f))}">${thumb(f)}<span>${esc(label(f))}</span></button>`).join('');
    $('#chooseGrid').scrollTop = 0;
    updateChooseMake();
  };
  $('#btnChoose').onclick = () => { buildChooser(); showHelp('#help3'); };
  $('#chooseTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-occ]');
    if (b) { chooseOcc = b.dataset.occ; buildChooser(); }
  });
  $('#chooseGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    chosen.has(k) ? chosen.delete(k) : chosen.add(k);
    b.classList.toggle('on', chosen.has(k));
    b.setAttribute('aria-pressed', chosen.has(k));
    updateChooseMake();
  });
  $('#btnChooseMake').onclick = () => {
    if (!chosen.size) return;
    randomBouquet(null, [...chosen]);
  };
  $('#btnChooseBack').onclick = () => showHelp('#help0');

  // ---------- Keyboard ----------
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal:not([hidden])');
      if (open) open.hidden = true; else if (selected !== null) { selected = null; render(); }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && current()) {
      e.preventDefault();
      pushHistory(); state.items = state.items.filter(i => i.id !== selected); selected = null; render();
    }
  });

  // ---------- Card ----------
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.closest('[data-close]')) m.hidden = true;
  }));

  function buildCardOptions() {
    $('#paperOpts').innerHTML = Object.entries(CARD_PAPERS).map(([k, p]) =>
      `<button class="chip${k === card.paper ? ' on' : ''}" data-paper="${k}"><i class="swatch paper-${k}"></i>${label(p)}</button>`).join('');
    $('#fontOpts').innerHTML = Object.entries(CARD_FONTS).map(([k, f]) =>
      `<button class="chip${k === card.font ? ' on' : ''}" data-font="${k}" style="font-family:${esc(f.css)}">${label(f)}</button>`).join('');
  }
  $('#paperOpts').addEventListener('click', e => {
    const b = e.target.closest('[data-paper]');
    if (b) { card.paper = b.dataset.paper; buildCardOptions(); updateCardPreview(); }
  });
  $('#fontOpts').addEventListener('click', e => {
    const b = e.target.closest('[data-font]');
    if (b) { card.font = b.dataset.font; buildCardOptions(); updateCardPreview(); }
  });

  function cardHTML(c, placeholder) {
    const to = c.to || (placeholder ? t('toPh') : ''), note = c.note || (placeholder ? t('notePh') : ''), from = c.from || (placeholder ? t('fromPh') : '');
    return (to ? `<p class="to">${esc(t('dear', { to }))}</p>` : '') + (note ? `<p class="note">${esc(note)}</p>` : '') + (from ? `<p class="from">— ${esc(from)}</p>` : '');
  }
  function styleCard(el, c) {
    const font = CARD_FONTS[c.font] || CARD_FONTS.serif;
    el.className = `card paper-${CARD_PAPERS[c.paper] ? c.paper : 'plain'}`;
    el.style.fontFamily = font.css;
    el.style.setProperty('--k', font.k);
  }
  function updateCardPreview() {
    readCard();
    const el = $('#cardPreview');
    styleCard(el, card);
    el.innerHTML = cardHTML(card, true);
    $('#noteCount').textContent = $('#cNote').value.length;
  }
  ['#cTo', '#cFrom', '#cNote'].forEach(id => $(id).addEventListener('input', updateCardPreview));

  $('#btnSend').onclick = () => {
    if (!state.items.length) return toast(t('needFlowers'));
    selected = null; render();
    $('#cTo').value = card.to; $('#cFrom').value = card.from; $('#cNote').value = card.note;
    buildCardOptions(); updateCardPreview();
    $('#step1').hidden = false; $('#step2').hidden = true;
    $('#sendModal').hidden = false;
    $('#cTo').focus();
  };

  function readCard() { card = { ...card, to: $('#cTo').value.trim(), from: $('#cFrom').value.trim(), note: $('#cNote').value.trim() }; }
  $('#btnNext').onclick = () => { readCard(); toStep2(card); };
  $('#btnSkipCard').onclick = () => toStep2({ ...card, to: '', from: '', note: '' });
  $('#btnBack').onclick = () => { $('#step1').hidden = false; $('#step2').hidden = true; };

  let pngUrl = '', sentCard = card;
  async function toStep2(c) {
    sentCard = c;
    $('#step1').hidden = true; $('#step2').hidden = false;
    pngUrl = '';
    $('#previewImg').removeAttribute('src');
    pngUrl = await renderPNG(state, c);
    $('#previewImg').src = pngUrl;
  }

  $('#btnDownload').onclick = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl; a.download = `${sentCard.to ? `Posey-${sentCard.to}` : t('fileName')}.png`;
    a.click();
  };
  $('#btnShare').onclick = async () => {
    const url = location.href.split('#')[0] + '#b=' + encode(state, sentCard);
    try { await navigator.clipboard.writeText(url); toast(t('copied')); }
    catch { window.prompt(t('copyPrompt'), url); }
  };
  $('#btnToWall').onclick = () => { if (saveToWall(state, sentCard)) toast(t('pinned')); };

  // ---------- Image export ----------
  async function renderPNG(st, c) {
    const S = 2, W = 600 * S, H = 720 * S;
    const hasCard = c && (c.to || c.from || c.note);
    const cardH = hasCard ? 520 : 0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720" width="${W}" height="${H}">${scene(st)}</svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H + cardH;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    if (hasCard) await drawCard(ctx, c, 0, H, W, cardH);
    return cv.toDataURL('image/png');
  }

  async function drawCard(ctx, c, x, y, w, h) {
    const P = CARD_PAPERS[c.paper] || CARD_PAPERS.plain, F = CARD_FONTS[c.font] || CARD_FONTS.serif;
    try { await document.fonts.load(`40px ${F.css}`, `${t('dear', { to: c.to })}${c.note}${c.from}— `); } catch { }
    drawPaper(ctx, c.paper, P, x, y, w, h);
    const lh = 66, top = y + 120;
    ctx.fillStyle = P.ink; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${Math.round(46 * F.k)}px ${F.css}`; ctx.textAlign = 'left';
    if (c.to) ctx.fillText(t('dear', { to: c.to }), x + 120, top);
    ctx.font = `${Math.round(44 * F.k)}px ${F.css}`; ctx.textAlign = 'center';
    wrapLines(ctx, c.note, w - 260).slice(0, 4).forEach((l, i) => ctx.fillText(l, x + w / 2, top + lh * (i + 1)));
    ctx.textAlign = 'right'; ctx.fillStyle = P.sub; ctx.font = `${Math.round(38 * F.k)}px ${F.css}`;
    if (c.from) ctx.fillText(`— ${c.from}`, x + w - 120, top + lh * 5 + 20);
  }

  function drawPaper(ctx, key, P, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = P.bg; ctx.fillRect(x, y, w, h);
    if (key === 'floral') {
      ctx.strokeStyle = '#e8c4c8'; ctx.lineWidth = 3; ctx.strokeRect(x + 26, y + 26, w - 52, h - 52);
      ctx.lineWidth = 1.2; ctx.strokeRect(x + 36, y + 36, w - 72, h - 72);
      const bloom = (cx, cy, s, col) => {
        ctx.fillStyle = '#9bb08e';
        [[-1, 1], [1, 1.2]].forEach(([d, k]) => { ctx.beginPath(); ctx.ellipse(cx + d * 16 * s, cy + 14 * s, 14 * s * k, 6 * s, d * 0.5, 0, Math.PI * 2); ctx.fill(); });
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 9 * s, cy + Math.sin(a) * 9 * s, 8 * s, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#f6d27a'; ctx.beginPath(); ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2); ctx.fill();
      };
      [[x + 44, y + 44], [x + w - 44, y + 44], [x + 44, y + h - 44], [x + w - 44, y + h - 44]].forEach(([cx, cy], i) => {
        bloom(cx + (i % 2 ? -44 : 44), cy + (i < 2 ? 8 : -8), 0.8, '#f7c6d3');
        bloom(cx, cy, 1.5, i % 2 ? '#f2a7b3' : '#e88b9c');
      });
    } else {
      ctx.strokeStyle = '#e3d4c2'; ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 60, y + 24); ctx.lineTo(x + w - 60, y + 24); ctx.stroke();
    }
    ctx.restore();
  }

  // Wraps by character (CJK) or by word (Latin)
  function wrapLines(ctx, text, maxW) {
    const lines = [];
    (text || '').split('\n').forEach(par => {
      const tokens = par.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+|\s+/g) || [''];
      let line = '';
      for (const tok of tokens) {
        if (line && ctx.measureText(line + tok).width > maxW) { lines.push(line.trim()); line = tok.trimStart(); }
        else line += tok;
      }
      lines.push(line.trim());
    });
    return lines;
  }

  // ---------- Share links ----------
  // The whole posey lives in the URL hash, so no server is needed
  function encode(st, c) {
    const data = {
      i: st.items.map(it => [it.k, Math.round(it.x), Math.round(it.y), Math.round(it.s * 100), Math.round(it.rot), Math.round(it.op * 100), it.fh, it.fv]),
      v: st.vase, c: st.tint, b: st.bg, t: c.to, f: c.from, n: c.note, p: c.paper, o: c.font,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(s) {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    return {
      st: {
        items: d.i.filter(a => BYKEY[a[0]]).map(([k, x, y, s, rot, op, fh, fv]) => ({ id: uid++, k, x, y, s: s / 100, rot, op: op / 100, fh, fv })),
        vase: VASES[d.v] ? d.v : 'classic', tint: d.c, bg: BGS[d.b] ? d.b : 'cream',
      },
      card: { to: d.t || '', from: d.f || '', note: d.n || '', paper: d.p || 'plain', font: d.o || 'serif' },
    };
  }

  let received = null;
  function fillReceived() {
    const c = received.card;
    $('#envText').innerHTML = t('envelope', {
      from: c.from ? `<b>${esc(c.from)}</b>` : t('someone'),
      to: c.to ? `<b>${esc(c.to)}</b>` : t('you'),
    });
    const el = $('#giftCard');
    styleCard(el, c);
    el.innerHTML = cardHTML(c, false);
    el.hidden = !(c.to || c.note || c.from);
  }
  function checkHash() {
    const m = location.hash.match(/^#b=([\w-]+)/);
    if (!m) return;
    try { received = decode(m[1]); } catch { return; }
    fillReceived();
    $('#giftSvg').innerHTML = scene(received.st);
    $('#received').hidden = false;
  }

  $('#btnOpen').onclick = () => {
    $('#envelope').classList.add('opened');
    setTimeout(() => { $('#envelope').hidden = true; $('#gift').hidden = false; }, 600);
  };
  $('#btnKeep').onclick = () => { if (saveToWall(received.st, received.card)) toast(t('kept')); };
  $('#btnMine').onclick = () => {
    window.history.replaceState(null, '', location.pathname + location.search);
    $('#received').hidden = true;
  };

  // ---------- Local wall ----------
  const WALL_KEY = 'posey-wall';
  const loadWall = () => { try { return JSON.parse(store.get(WALL_KEY)) || []; } catch { return []; } };
  const storeWall = w => store.set(WALL_KEY, JSON.stringify(w)) || (toast(t('storeFail')), false);

  function saveToWall(st, c) {
    const w = loadWall();
    w.unshift({ id: Date.now(), date: new Date().toISOString().slice(0, 10), st: JSON.parse(JSON.stringify({ items: st.items, vase: st.vase, tint: st.tint, bg: st.bg })), card: { ...c } });
    return storeWall(w.slice(0, 60));
  }

  function showWall() {
    const w = loadWall();
    $('#wall').innerHTML = w.length ? w.map(e => `<figure class="wall-item" data-id="${e.id}">` +
      `<svg viewBox="0 0 600 720">${scene(e.st)}</svg>` +
      `<figcaption><span>${e.card.from ? esc(e.card.from) : t('anon')}${e.card.to ? ` → ${esc(e.card.to)}` : ''}</span><small>${e.date}</small></figcaption>` +
      `<button class="rm" data-rm="${e.id}" title="${t('remove')}" aria-label="${t('remove')}">×</button></figure>`).join('')
      : `<p class="muted empty">${t('wallEmpty')}</p>`;
    $('#wallModal').hidden = false;
  }
  $('#btnWall').onclick = showWall;
  $('#wall').addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { storeWall(loadWall().filter(x => x.id !== +rm.dataset.rm)); showWall(); return; }
    const f = e.target.closest('.wall-item');
    if (!f) return;
    const entry = loadWall().find(x => x.id === +f.dataset.id);
    if (!entry) return;
    pushHistory();
    state = { items: entry.st.items.filter(it => BYKEY[it.k]).map(it => ({ ...it, id: uid++ })), vase: VASES[entry.st.vase] ? entry.st.vase : 'classic', tint: entry.st.tint, bg: entry.st.bg };
    card = { paper: 'plain', font: 'serif', ...entry.card };
    selected = null;
    $('#wallModal').hidden = true;
    buildOptions();
    render();
  });

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // Shared gradients for the library thumbnails and vessel previews
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${DEFS}</svg>`);
  applyI18n();
  buildLibrary();
  buildOptions();
  buildCardOptions();
  render();
  checkHash();
})();

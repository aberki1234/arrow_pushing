/* Click-to-draw engine for the step screen mockup. Source → target picking, hard-coded validation from scenes.js. */
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode') === 'daily' ? 'daily' : 'practice';
  const rxnKey = SCENES[q.get('r')] ? q.get('r') : 'sn2';
  const scene = SCENES[rxnKey];
  let sIdx = Math.min(+(q.get('s') || 0), scene.steps.length - 1);
  let results = (q.get('res') || '').split('').filter(Boolean);
  const MAX_ATT = 3;
  let step, arrows, selected, hintLvl, attempts, solved, failed, usedHelp, atype;

  const el = (id) => step.els.find((e) => e.id === id);
  const keyOf = (a) => a.src + '>' + a.sink;

  function load() {
    step = scene.steps[sIdx]; arrows = []; selected = null; hintLvl = 0; attempts = 0; solved = false; failed = false; usedHelp = false;
    atype = step.arrowType;
    $('title').textContent = scene.title; $('sub').textContent = scene.sub; $('clsPill').textContent = scene.cls + ' · ' + '●'.repeat(scene.diff) + '○'.repeat(3 - scene.diff);
    $('radPill').classList.toggle('hidden', !scene.radical);
    $('modePill').textContent = mode === 'daily' ? 'Daily puzzle' : 'Practice'; $('modePill').className = 'pill ' + (mode === 'daily' ? 'new' : '');
    $('condLine').textContent = 'Conditions: ' + scene.cond;
    $('stepNo').textContent = (sIdx + 1) + ' of ' + scene.steps.length; $('prompt').textContent = step.prompt;
    $('rxnSel').value = rxnKey;
    $('attLbl').textContent = mode === 'daily' ? 'Attempts' : 'Attempts: unlimited';
    $('costLine').textContent = mode === 'daily' ? 'Daily: each wrong check and each hint costs a point.' : 'Practice: hints are free.';
    $('molLayer').innerHTML = step.before();
    buildHits(); setType(atype, true); render(); fb('', 'Ready', 'Draw the arrows, then press <b>Check</b>.');
    $('checkBtn').textContent = 'Check'; $('checkBtn').className = 'btn primary'; $('checkBtn').disabled = false;
    tiles(); pips(); canvasHint();
  }

  function tiles() {
    let h = '';
    for (let i = 0; i < scene.steps.length; i++) {
      const r = results[i];
      h += r ? '<span class="tile ' + r + '" title="Step ' + (i + 1) + '">' + ({ g: '✓', y: '~', r: '✕' }[r]) + '</span>'
        : '<span class="tile e' + (i === sIdx ? '" style="border-style:solid;border-color:var(--accent)' : '') + '">' + (i + 1) + '</span>';
    }
    $('stepTiles').innerHTML = h;
  }
  function pips() {
    if (mode !== 'daily') { $('pips').innerHTML = '<span style="width:auto;background:none;color:var(--muted)">∞</span>'; return; }
    $('pips').innerHTML = [0, 1, 2].map((i) => '<span class="' + (i < MAX_ATT - attempts ? '' : 'off') + '"></span>').join('');
  }
  function canvasHint(t) { $('canvasHint').innerHTML = t || (selected ? 'Now choose where the electrons <b>go</b> — a highlighted atom or bond. <span class="kbd">Esc</span> cancels.' : 'Choose a <b>source</b> of electrons: a lone pair, a bond, or an unpaired electron.'); }

  function buildHits() {
    const g = $('hitLayer'); g.innerHTML = '';
    step.els.forEach((e) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'hit'); c.setAttribute('cx', e.x); c.setAttribute('cy', e.y); c.setAttribute('r', Math.max(e.r, 15)); c.dataset.id = e.id;
      c.setAttribute('tabindex', '0'); c.setAttribute('role', 'button');
      c.setAttribute('aria-label', e.label + (e.role === 'src' ? ' (electron source)' : ' (electron target)'));
      c.addEventListener('click', () => pick(e)); c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(e); } });
      const t = document.createElementNS(NS, 'title'); t.textContent = e.label; c.appendChild(t);
      g.appendChild(c);
    });
  }
  function markHits() {
    document.querySelectorAll('.hit').forEach((c) => {
      const e = el(c.dataset.id);
      c.classList.toggle('sel', selected === e.id); c.classList.toggle('target', !!selected && e.role === 'sink');
      c.style.pointerEvents = solved || failed ? 'none' : '';
    });
  }

  function pick(e) {
    if (solved || failed) return;
    if (!selected) {
      if (e.role !== 'src') { fb('', 'Start from the source', 'Arrows start where the electrons <b>come from</b> — a lone pair, a bond or a radical. <i>' + e.label + '</i> can only receive electrons.'); return; }
      selected = e.id; markHits(); canvasHint(); fb('', 'Source: ' + e.label, 'Now tap where those electrons go.'); return;
    }
    if (e.id === selected) { selected = null; markHits(); canvasHint(); return; }
    if (e.role === 'src') { selected = e.id; markHits(); canvasHint(); return; }
    if (arrows.length >= 4) { fb('', 'That’s plenty', 'A single step rarely needs more than 3–4 arrows. Undo one first.'); return; }
    if (!arrows.some((a) => a.src === selected && a.sink === e.id)) arrows.push({ src: selected, sink: e.id, type: atype });
    selected = null; render(); canvasHint(); fb('', 'Arrow added', 'Add more arrows if the step needs them, or press <b>Check</b>.');
  }

  function path(a) {
    const s = el(a.src), t = el(a.sink), x0 = s.x, y0 = s.y, x1 = t.tx != null ? t.tx : t.x, y1 = t.ty != null ? t.ty : t.y;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1; let nx = -dy / L, ny = dx / L;
    const hx = s.nx != null ? s.nx : 0, hy = s.ny != null ? s.ny : -1; if (nx * hx + ny * hy < 0) { nx = -nx; ny = -ny; }
    const b = Math.max(18, Math.min(62, L * 0.32));
    const cx = (x0 + x1) / 2 + nx * b * 2, cy = (y0 + y1) / 2 + ny * b * 2;
    return 'M' + x0 + ',' + y0 + ' Q' + cx + ',' + cy + ' ' + x1 + ',' + y1;
  }
  function render(cls, ghost) {
    const g = $('arrowLayer'); g.innerHTML = '';
    const draw = (a, c) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', path(a)); p.setAttribute('class', 'arrow ' + (c || ''));
      p.setAttribute('marker-end', 'url(#' + (a.type === 'half' ? 'mHalf' : 'mFull') + ')'); g.appendChild(p); };
    if (ghost) ghost.forEach((a) => draw(a, 'ghost'));
    arrows.forEach((a) => draw(a, cls));
    const ul = $('arrowList'); ul.innerHTML = '';
    arrows.forEach((a, i) => { const li = document.createElement('li');
      li.innerHTML = '<b>' + (i + 1) + '.</b> ' + el(a.src).label + ' <span class="muted">' + (a.type === 'half' ? '⇀' : '⟶') + '</span> ' + el(a.sink).label + '<button class="x" aria-label="Remove arrow ' + (i + 1) + '">×</button>';
      li.querySelector('.x').onclick = () => { if (solved || failed) return; arrows.splice(i, 1); render(); }; ul.appendChild(li); });
    $('emptyList').classList.toggle('hidden', arrows.length > 0);
    markHits();
  }

  function fb(kind, title, html, tag) {
    const f = $('fb'); f.className = 'fb ' + kind;
    f.innerHTML = '<h3>' + title + (tag ? ' <span class="pill" style="vertical-align:1px">' + tag + '</span>' : '') + '</h3><p>' + html + '</p>';
  }

  function evaluate() {
    if (!arrows.length) return { k: 'info', title: 'No arrows yet', msg: 'Draw at least one arrow first.' };
    const bad = arrows.find((a) => a.type !== step.arrowType);
    if (bad) return { k: 'wrong', title: 'Arrow type', tag: 'rule check',
      msg: step.arrowType === 'half' ? 'This step breaks and forms bonds <b>homolytically</b> — each arrow moves a single electron, so use the half-headed fish-hook ⇀.'
        : 'A full-headed arrow moves an electron <b>pair</b>. You’ve used a fish-hook ⇀ (one electron); this step is polar (heterolytic).' };
    const keys = arrows.map(keyOf), sorted = keys.slice().sort().join('+');
    const alts = step.correct;
    if (alts.some((alt) => alt.length === keys.length && alt.every((k) => keys.includes(k)))) return { k: 'good', title: 'Correct!', msg: step.note };
    for (const k of keys) { const d = step.diag[k] || step.diag[k.split('>')[0] + '>*']; if (d) return { k: d[0], title: d[0] === 'plausible' ? 'Plausible — but not the pathway here' : 'Not quite', msg: d[1], tag: 'misconception' }; }
    if (step.partial[sorted]) return { k: 'partial', title: 'Almost there', msg: step.partial[sorted], tag: 'step note' };
    const near = alts.find((alt) => keys.every((k) => alt.includes(k)));
    if (near) return { k: 'partial', title: 'Right so far', msg: 'Those arrows are all part of the mechanism — <b>' + (near.length - keys.length) + ' more</b> needed.' };
    return { k: 'wrong', title: 'Not quite', msg: 'That isn’t a productive move here. Which atom is electron-rich (the source) and which is electron-poor (the target)? Try a hint if you’re stuck.' };
  }

  function check() {
    if (solved || failed) { return next(); }
    const r = evaluate();
    if (r.k === 'info') { fb('', r.title, r.msg); return; }
    if (r.k === 'good') { solved = true; render('good'); const at = sIdx; setTimeout(() => { if (solved && sIdx === at) { $('molLayer').innerHTML = step.after(); $('arrowLayer').innerHTML = ''; } }, 1100); fb('good', r.title, r.msg);
      results[sIdx] = (attempts === 0 && !usedHelp) ? 'g' : 'y'; tiles();
      $('checkBtn').textContent = sIdx < scene.steps.length - 1 ? 'Next step →' : 'See summary →'; $('checkBtn').className = 'btn good'; canvasHint('Product state shown. ' + (sIdx < scene.steps.length - 1 ? 'The next step starts from here.' : 'Mechanism complete.')); return; }
    attempts++; pips(); render(r.k === 'partial' ? '' : r.k);
    fb(r.k, r.title, r.msg, r.tag);
    if (mode === 'daily' && attempts >= MAX_ATT) { failed = true; usedHelp = true; render('', step.correct[0].map((k) => ({ src: k.split('>')[0], sink: k.split('>')[1], type: step.arrowType })));
      results[sIdx] = 'r'; tiles(); fb('wrong', 'Out of attempts', 'The correct arrows are shown dashed. ' + step.note); $('checkBtn').textContent = 'Next step →'; $('checkBtn').className = 'btn primary'; }
  }
  function next() {
    const p = new URLSearchParams({ r: rxnKey, mode, res: results.join('') });
    if (sIdx < scene.steps.length - 1) { p.set('s', sIdx + 1); location.search = p.toString(); } else location.href = 'complete.html?' + p.toString();
  }

  function hint() {
    if (solved || failed) return;
    hintLvl = Math.min(3, hintLvl + 1); usedHelp = true;
    const ghost = hintLvl === 3 ? step.correct[0].map((k) => ({ src: k.split('>')[0], sink: k.split('>')[1], type: step.arrowType })) : null;
    render('', ghost);
    fb('', '💡 Hint ' + hintLvl + ' of 3', step.hints[hintLvl - 1] + (hintLvl === 3 ? ' <i>(dashed arrows show the answer)</i>' : ''), mode === 'daily' ? '−1 pt' : 'free');
    $('hintBtn').textContent = hintLvl < 3 ? '💡 Hint ' + (hintLvl + 1) + '/3' : '💡 Hint 3/3';
  }

  function setType(t, silent) {
    atype = t; $('tFull').setAttribute('aria-pressed', t === 'full'); $('tHalf').setAttribute('aria-pressed', t === 'half');
  }

  // events
  $('checkBtn').onclick = check; $('hintBtn').onclick = hint;
  $('undo').onclick = () => { if (!solved && !failed) { arrows.pop(); render(); } };
  $('clear').onclick = () => { if (!solved && !failed) { arrows = []; selected = null; render(); canvasHint(); } };
  $('tFull').onclick = () => setType('full'); $('tHalf').onclick = () => setType('half');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected) { selected = null; markHits(); canvasHint(); } });
  $('rxnSel').onchange = (e) => { location.search = '?r=' + e.target.value + '&mode=' + mode; };

  // mockup state forcing
  const corr = () => step.correct[0].map((k) => ({ src: k.split('>')[0], sink: k.split('>')[1], type: step.arrowType }));
  const firstDiag = (sev) => { const k = Object.keys(step.diag).find((x) => step.diag[x][0] === sev && !x.includes('*')); return k && { src: k.split('>')[0], sink: k.split('>')[1], type: step.arrowType }; };
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.m; load();
    if (m === 'sel') { selected = step.els.find((e) => e.role === 'src').id; markHits(); canvasHint(); fb('', 'Source: ' + el(selected).label, 'Now tap where those electrons go.'); }
    if (m === 'drawn') { arrows = [corr()[0]]; render(); }
    if (m === 'partial') { arrows = [corr()[0]]; render(); check(); }
    if (m === 'plausible') { const a = firstDiag('plausible'); if (a) { arrows = [a]; render(); check(); } else fb('', 'n/a', 'This step has no “plausible but not favoured” entry — try the Aldol reaction.'); }
    if (m === 'wrong') { const a = firstDiag('wrong'); arrows = [a]; render(); check(); }
    if (m === 'rule') { arrows = corr().map((a) => Object.assign({}, a, { type: step.arrowType === 'half' ? 'full' : 'half' })); render(); check(); }
    if (m === 'h1' || m === 'h2' || m === 'h3') { for (let i = 0; i < +m[1]; i++) hint(); }
    if (m === 'correct') { arrows = corr(); render(); check(); }
    if (m === 'fail') { arrows = [firstDiag('wrong')]; render(); for (let i = 0; i < 3; i++) { if (!failed) { attempts = Math.max(attempts, 0); check(); } } if (mode !== 'daily') { fb('', 'Daily only', 'Open in daily mode to see this state: <a href="?r=' + rxnKey + '&mode=daily">daily mode</a>'); } }
  }));
  load();
})();

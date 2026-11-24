/* Hard-coded scenes for the clickable step screen. In the real build these come from one JSON file per reaction
   (states + coordinates + typed arrows + misconception entries); here they are JS so the sketch is self-contained. */
const MINUS = '−';
function atom(x, y, t, o) { o = o || {};
  const ch = o.charge ? '<tspan class="chg" dy="-9" dx="1">' + o.charge + '</tspan>' : '';
  return '<g><circle cx="' + x + '" cy="' + y + '" r="' + (o.r || 12) + '" class="halo"/><text x="' + x + '" y="' + (y + 6.5) + '" text-anchor="middle" class="at">' + t + ch + '</text></g>';
}
function bond(x1, y1, x2, y2, o) { o = o || {};
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const a = [x1 + ux * (o.s || 0), y1 + uy * (o.s || 0)], b = [x2 - ux * (o.e || 0), y2 - uy * (o.e || 0)];
  const ln = (p, q) => '<line class="bond" x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '"/>';
  if (o.order === 2) { const nx = -uy * 3.4, ny = ux * 3.4;
    return ln([a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]) + ln([a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny]); }
  if (o.wedge) return '<polygon class="bond wedge" points="' + a[0] + ',' + a[1] + ' ' + (b[0] - uy * 4.5) + ',' + (b[1] + ux * 4.5) + ' ' + (b[0] + uy * 4.5) + ',' + (b[1] - ux * 4.5) + '"/>';
  return ln(a, b);
}
function lp(x, y, ang) { const r = ang * Math.PI / 180, px = -Math.sin(r) * 4.2, py = Math.cos(r) * 4.2;
  return '<circle class="lpd" cx="' + (x + px) + '" cy="' + (y + py) + '" r="2.3"/><circle class="lpd" cx="' + (x - px) + '" cy="' + (y - py) + '" r="2.3"/>'; }
function rad(x, y) { return '<circle class="lpd" cx="' + x + '" cy="' + y + '" r="2.8"/>'; }
function txt(x, y, t, cls) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" class="' + (cls || 'lbl') + '">' + t + '</text>'; }
const PLUS = (x, y) => txt(x, y + 7, '+', 'at');

const E = (id, role, kind, label, x, y, r, extra) => Object.assign({ id, role, kind, label, x, y, r }, extra || {});

/* ---------------- SN2 ---------------- */
const sn2Before = () =>
  bond(110, 170, 76, 192, { s: 12, e: 11 }) + bond(300, 170, 450, 170, { s: 12, e: 19 }) + bond(300, 170, 300, 115, { s: 12, e: 11 }) +
  bond(300, 170, 258, 203, { s: 12, e: 11 }) + bond(300, 170, 342, 203, { s: 12, e: 11 }) +
  atom(110, 170, 'O', { charge: MINUS }) + atom(70, 196, 'H') + atom(300, 170, 'C') + atom(300, 108, 'H') + atom(252, 208, 'H') + atom(348, 208, 'H') + atom(450, 170, 'Br', { r: 16 }) +
  lp(110, 146, -90) + lp(128, 188, 50) + lp(138, 170, 0) + lp(450, 144, -90) + lp(450, 196, 90) + lp(480, 170, 0) +
  txt(300, 262, 'δ+ at carbon', 'lbl') + txt(110, 262, 'nucleophile', 'lbl');
const sn2After = () =>
  bond(230, 170, 330, 170, { s: 12, e: 12 }) + bond(230, 170, 196, 192, { s: 12, e: 11 }) + bond(330, 170, 330, 115, { s: 12, e: 11 }) + bond(330, 170, 372, 203, { s: 12, e: 11 }) + bond(330, 170, 288, 203, { s: 12, e: 11 }) +
  atom(230, 170, 'O') + atom(190, 196, 'H') + atom(330, 170, 'C') + atom(330, 108, 'H') + atom(380, 208, 'H') + atom(282, 208, 'H') +
  lp(230, 146, -90) + lp(230, 194, 90) + PLUS(420, 170) +
  atom(510, 170, 'Br', { r: 16, charge: MINUS }) + lp(510, 144, -90) + lp(510, 196, 90) + lp(484, 170, 180) + lp(538, 170, 0) +
  txt(280, 262, 'CH₃OH — configuration inverted (Walden inversion; stereo shown, not validated)', 'lbl');

/* ---------------- Aldol (base-catalysed, 3 steps) ---------------- */
const enolate = () =>
  bond(260, 200, 170, 160, { order: 2 }) + bond(170, 160, 170, 95, { e: 13 }) + bond(170, 160, 114, 188, { e: 12 }) +
  atom(170, 95, 'O', { charge: MINUS }) + atom(108, 191, 'H') + lp(170, 71, -90) + lp(146, 93, 180) + lp(196, 95, 0) + txt(260, 232, 'enolate', 'lbl');
const water = (x, y) => bond(x, y, x - 35, y + 28, { s: 12, e: 11 }) + bond(x, y, x + 36, y + 28, { s: 12, e: 11 }) + atom(x, y, 'O') + atom(x - 40, y + 31, 'H') + atom(x + 41, y + 31, 'H') + lp(x, y - 24, -90);
const aldehyde2 = () =>
  bond(470, 200, 470, 130, { order: 2, e: 14 }) + bond(470, 200, 540, 240) + bond(470, 200, 414, 227, { e: 12 }) +
  atom(470, 130, 'O') + atom(408, 230, 'H') + lp(470, 106, -90) + lp(446, 128, 180) + txt(500, 262, 'acetaldehyde (2nd molecule)', 'lbl');
const chain3 = (withOH) =>
  bond(140, 255, 230, 205) + bond(230, 205, 230, 135, { e: 13 }) + bond(230, 205, 320, 255) + bond(320, 255, 410, 205) + bond(410, 205, 410, 135, { order: 2, e: 13 }) + bond(410, 205, 468, 232, { e: 12 }) +
  atom(230, 135, 'O', withOH ? {} : { charge: MINUS }) + atom(410, 135, 'O') + atom(474, 235, 'H') + lp(410, 111, -90) + lp(386, 133, 180) +
  (withOH ? bond(230, 135, 262, 114, { s: 12, e: 11 }) + atom(268, 110, 'H') + lp(206, 133, 180) : lp(230, 112, -90) + lp(206, 133, 180) + lp(254, 133, 0));

/* ---------------- Radical (fish-hook) ---------------- */
const radBefore = () =>
  bond(330, 170, 430, 170, { s: 12, e: 12 }) + bond(330, 170, 330, 224, { s: 12, e: 11 }) + bond(330, 170, 288, 203, { s: 12, e: 11 }) + bond(330, 170, 372, 203, { s: 12, e: 11 }) +
  atom(110, 170, 'Br', { r: 16 }) + atom(330, 170, 'C') + atom(436, 170, 'H') + atom(330, 232, 'H') + atom(282, 208, 'H') + atom(378, 208, 'H') +
  lp(110, 144, -90) + lp(110, 196, 90) + lp(82, 170, 180) + rad(138, 170) + txt(110, 262, 'bromine radical', 'lbl') + txt(330, 280, 'methane', 'lbl');
const radAfter = () =>
  bond(150, 170, 230, 170, { s: 16, e: 12 }) + atom(150, 170, 'Br', { r: 16 }) + atom(236, 170, 'H') + lp(150, 144, -90) + lp(150, 196, 90) + lp(122, 170, 180) + PLUS(310, 170) +
  bond(420, 170, 420, 116, { s: 12, e: 11 }) + bond(420, 170, 378, 203, { s: 12, e: 11 }) + bond(420, 170, 462, 203, { s: 12, e: 11 }) +
  atom(420, 170, 'C') + atom(420, 108, 'H') + atom(372, 208, 'H') + atom(468, 208, 'H') + rad(420, 144) + txt(190, 250, 'HBr', 'lbl') + txt(420, 250, 'methyl radical', 'lbl');

const SCENES = {
  sn2: {
    title: 'SN2 substitution', sub: 'Hydroxide displaces bromide from bromomethane', diff: 1, cls: 'Substitution', cond: 'NaOH · EtOH/H₂O · 25 °C',
    steps: [{
      prompt: 'Draw the arrows for the single, concerted step.', arrowType: 'full', before: sn2Before, after: sn2After,
      els: [
        E('lpO', 'src', 'lp', 'lone pair on O', 138, 170, 16), E('bCBr', 'src', 'σ', 'C–Br bond', 375, 170, 16), E('bCH', 'src', 'σ', 'C–H bond', 300, 141, 13), E('lpBr', 'src', 'lp', 'lone pair on Br', 480, 170, 14),
        E('C', 'sink', 'atom', 'carbon', 300, 170, 18, { tx: 287, ty: 165 }), E('Br', 'sink', 'atom', 'bromine', 450, 170, 20, { tx: 431, ty: 163 }),
        E('O', 'sink', 'atom', 'oxygen', 110, 170, 18, { tx: 110, ty: 150 }), E('H', 'sink', 'atom', 'hydrogen (top)', 300, 108, 15, { tx: 288, ty: 108 })],
      correct: [['lpO>C', 'bCBr>Br']],
      diag: {
        'lpO>Br': ['wrong', 'Both HO⁻ and Br carry negative character, so they repel. A nucleophile attacks the electron-poor (δ+) atom — which atom is that?'],
        'lpBr>C': ['wrong', 'Bromide is the <b>leaving group</b>: it leaves with the electrons rather than attacking the carbon it is leaving.'],
        'bCBr>C': ['wrong', 'Bond electrons cannot flow onto an atom they are already shared with. The pair moves to the atom that can stabilise it — the more electronegative one.'],
        'lpO>H': ['wrong', 'That would be an E2-style deprotonation, but bromomethane has no β-hydrogen. Think about the polarised C–Br bond instead.'],
        'bCH>*': ['wrong', 'C–H bonds are not the weak, polarised bond here. Which bond is polarised toward a good leaving group?'],
        'lpO>*': ['wrong', 'The lone pair should attack the electrophilic site. Check which atom carries δ+.']
      },
      partial: { 'lpO>C': 'Octet check: carbon would now have 10 electrons around it. What has to leave as the nucleophile arrives?', 'bCBr>Br': 'Br leaves with its pair — good. But what pushes the electrons in on the other side? SN2 is concerted.' },
      hints: ['Which species is the nucleophile, and which atom is the electrophile?', 'The nucleophile attacks the δ+ carbon while the C–Br bond breaks, at the same time. How many arrows is that?', 'Arrow 1: lone pair on O → carbon. Arrow 2: C–Br bond → Br.'],
      note: 'Backside attack and leaving-group departure happen in one concerted step, so the rate depends on both species (second order).'
    }]
  },
  aldol: {
    title: 'Aldol addition (base-catalysed)', sub: 'Two acetaldehyde molecules → 3-hydroxybutanal', diff: 2, cls: 'Carbonyl', cond: 'NaOH (cat.) · H₂O · 0 °C',
    steps: [{
      prompt: 'Form the enolate.', arrowType: 'full',
      before: () => bond(100, 270, 62, 292, { s: 12, e: 11 }) + bond(240, 210, 330, 160) + bond(330, 160, 330, 95, { order: 2, e: 14 }) + bond(240, 210, 240, 280, { e: 13 }) + bond(330, 160, 394, 192, { e: 12 }) +
        atom(100, 270, 'O', { charge: MINUS }) + atom(56, 295, 'H') + atom(240, 282, 'H') + atom(330, 95, 'O') + atom(400, 195, 'H') + lp(100, 246, -90) + lp(120, 288, 50) + lp(128, 270, 0) + lp(330, 71, -90) + lp(306, 93, 180) + txt(222, 190, 'α', 'lbl'),
      after: () => enolate() + PLUS(375, 200) + water(480, 200),
      els: [E('lpO', 'src', 'lp', 'lone pair on O (HO⁻)', 128, 270, 16), E('bCaH', 'src', 'σ', 'Cα–H bond', 240, 246, 14), E('piCO', 'src', 'π', 'C=O π bond', 343, 128, 14, { nx: 1, ny: 0 }),
        E('H', 'sink', 'atom', 'α-hydrogen', 240, 282, 17, { tx: 227, ty: 277 }), E('bCaC1', 'sink', 'σ', 'Cα–C bond (becomes C=C)', 285, 185, 14), E('Oc', 'sink', 'atom', 'carbonyl oxygen', 330, 95, 18, { tx: 346, ty: 90 }),
        E('C1', 'sink', 'atom', 'carbonyl carbon', 330, 160, 16, { tx: 318, ty: 166 }), E('Ca', 'sink', 'atom', 'α-carbon', 240, 210, 16, { tx: 228, ty: 205 })],
      correct: [['lpO>H', 'bCaH>bCaC1', 'piCO>Oc']],
      diag: {
        'lpO>C1': ['plausible', 'Hydroxide <i>can</i> add to the carbonyl carbon (hydrate formation), but that is reversible and a dead end here. For an aldol we need the nucleophilic α-carbon — what acidity does the α-H have?'],
        'lpO>Ca': ['wrong', 'The α-carbon is not electron-poor; HO⁻ attacks the acidic <b>hydrogen</b>, not the carbon.'],
        'piCO>C1': ['wrong', 'The π electrons cannot move onto the carbon that shares them. They go to the electronegative oxygen.'],
        'bCaH>Oc': ['wrong', 'The C–H electrons are too far from O. Push them toward the neighbouring C–C bond, and let the C=O π pair relay to oxygen.']
      },
      partial: { 'lpO>H': 'Deprotonation started. Where do the C–H electrons go? Think of a neighbouring group that can stabilise a carbanion.',
        'bCaH>bCaC1+lpO>H': 'Nearly. Carbon C₁ would now exceed an octet — what does the C=O π pair do?', 'bCaC1+lpO>H': 'Nearly. Carbon C₁ would now exceed an octet — what does the C=O π pair do?' },
      hints: ['Hydroxide is a base here, not a nucleophile at carbon. Which H is acidic, and why?', 'The α-H is acidic because the resulting carbanion is conjugated with C=O. Three arrows: a relay through the π system.', 'HO⁻ lone pair → H;  Cα–H bond → Cα–C bond;  C=O π → O.'],
      note: 'The enolate is resonance-stabilised: negative charge shared between Cα and O.'
    }, {
      prompt: 'The enolate attacks a second acetaldehyde.', arrowType: 'full',
      before: () => enolate() + aldehyde2(), after: () => chain3(false),
      els: [E('piCC', 'src', 'π', 'C=C π bond (enolate)', 215, 180, 14, { nx: 0, ny: -1 }), E('lpOm', 'src', 'lp', 'lone pair on O⁻', 196, 95, 14), E('piOp', 'src', 'π', "C'=O' π bond", 482, 165, 14, { nx: 1, ny: 0 }),
        E('C1p', 'sink', 'atom', "electrophilic carbon (C')", 470, 200, 16, { tx: 457, ty: 205 }), E('Op', 'sink', 'atom', "carbonyl oxygen (O')", 470, 130, 18, { tx: 486, ty: 124 }),
        E('Ca', 'sink', 'atom', 'α-carbon (enolate)', 260, 200, 16, { tx: 262, ty: 214 }), E('CH3p', 'sink', 'atom', 'methyl carbon', 540, 240, 14, { tx: 530, ty: 238 })],
      correct: [['piCC>C1p', 'piOp>Op']],
      diag: {
        'lpOm>C1p': ['plausible', 'O-attack is possible (it gives an enol ether and is reversible), but the aldol needs the new <b>C–C</b> bond. Which atom of the enolate is the soft, productive nucleophile?'],
        'piCC>Op': ['wrong', 'Attack at oxygen would form an unstable peroxide-like O–C bond. The electrophilic site is the carbonyl <b>carbon</b>.'],
        'piCC>CH3p': ['wrong', 'A methyl carbon is not electrophilic. Which carbon bears δ+ (it is attached to an electronegative O)?'],
        'piOp>C1p': ['wrong', 'The π electrons cannot move to the carbon that already shares them; they go to the oxygen.']
      },
      partial: { 'piCC>C1p': "C–C bond forming, but C' would have 10 electrons. Where do the C=O π electrons go?", 'piOp>Op': 'Good: O takes the pair. But what pushes the nucleophile in?' },
      hints: ['Which end of the enolate is nucleophilic — and which carbon of the second molecule is electrophilic?', 'The C=C π bond attacks the carbonyl carbon; the C=O π pair relays onto oxygen.', 'Arrow 1: C=C π → C′.  Arrow 2: C′=O′ π → O′.'],
      note: 'Carbon–carbon bond formation: the key step of the aldol reaction. The product is an alkoxide.'
    }, {
      prompt: 'Protonate the alkoxide using water.', arrowType: 'full',
      before: () => chain3(false) + water(340, 48), after: () => chain3(true) + PLUS(500, 110) + atom(560, 110, 'O', { charge: MINUS }) + atom(600, 128, 'H') + bond(560, 110, 596, 126, { s: 12, e: 11 }),
      els: [E('lpOm', 'src', 'lp', 'lone pair on O⁻', 230, 112, 14), E('bOwHa', 'src', 'σ', 'O–H bond (left H)', 311, 62, 12), E('bOwHb', 'src', 'σ', 'O–H bond (right H)', 370, 62, 12),
        E('Ha', 'sink', 'atom', 'water H (left)', 285, 76, 14, { tx: 274, ty: 82 }), E('Hb', 'sink', 'atom', 'water H (right)', 395, 76, 14, { tx: 406, ty: 82 }),
        E('Ow', 'sink', 'atom', 'water oxygen', 340, 48, 16, { tx: 330, ty: 36 }), E('Oc', 'sink', 'atom', 'carbonyl oxygen', 410, 135, 18, { tx: 424, ty: 128 })],
      correct: [['lpOm>Ha', 'bOwHa>Ow'], ['lpOm>Hb', 'bOwHb>Ow']],
      diag: {
        'lpOm>Ow': ['wrong', 'O⁻ attacking another oxygen would be an O–O bond — both are electron-rich. Target the δ+ hydrogen.'],
        'lpOm>Oc': ['wrong', 'Both oxygens are electron-rich; nothing is gained. Look for the acidic proton of water.']
      },
      partial: { 'lpOm>Ha': 'Proton picked up — but H can’t have two bonds. Where do the O–H electrons go?', 'lpOm>Hb': 'Proton picked up — but H can’t have two bonds. Where do the O–H electrons go?', 'bOwHa>Ow': 'Good, hydroxide leaves. Who supplies the new O–H bond?', 'bOwHb>Ow': 'Good, hydroxide leaves. Who supplies the new O–H bond?' },
      hints: ['An alkoxide is a strong base. What proton source is around?', 'Water donates H⁺: the base takes it, and the O–H electrons stay on oxygen (it becomes HO⁻).', 'Lone pair on O⁻ → H;  O–H bond → O of water. (Either H of water is accepted.)'],
      note: 'Hydroxide is regenerated, so the base is catalytic. Heating would continue to the enone (aldol condensation).'
    }]
  },
  radical: {
    title: 'Radical bromination — propagation', sub: 'Br• abstracts a hydrogen from methane', diff: 2, cls: 'Radical', cond: 'Br₂ · hν', radical: true,
    steps: [{
      prompt: 'Use fish-hook arrows: each moves ONE electron.', arrowType: 'half', before: radBefore, after: radAfter,
      els: [E('radBr', 'src', 'rad', 'unpaired electron on Br•', 138, 170, 16), E('bCH1', 'src', 'σ', 'C–H bond (right)', 383, 170, 14, { nx: 0, ny: -1 }), E('bCH2', 'src', 'σ', 'C–H bond (bottom)', 330, 200, 12),
        E('H1', 'sink', 'atom', 'hydrogen (right)', 436, 170, 16, { tx: 424, ty: 162 }), E('C', 'sink', 'atom', 'carbon', 330, 170, 18, { tx: 320, ty: 163 }), E('Br', 'sink', 'atom', 'bromine', 110, 170, 18, { tx: 108, ty: 150 })],
      correct: [['radBr>H1', 'bCH1>C']],
      diag: {
        'radBr>C': ['wrong', 'Bonding Br to carbon would need a 5th bond on C. Br• abstracts a <b>hydrogen</b>, which can only have one bond.'],
        'radBr>Br': ['wrong', 'A radical cannot pair with itself. Direct it to the atom it will bond to.']
      },
      partial: { 'radBr>H1': 'H–Br bond formation started. H already has a bond to C — where does the other electron of that bond go?', 'bCH1>C': 'The C–H bond homolyses, leaving a methyl radical. What provides the electron to pair with H?' },
      hints: ['Radical steps move single electrons. What arrowhead do we use?', 'Br• forms a new bond to H; the C–H bond breaks homolytically, one electron to each partner.', 'Fish-hook 1: Br• electron → H.  Fish-hook 2: C–H bond electron → C.'],
      note: 'Homolytic cleavage: each fish-hook moves one electron. The methyl radical goes on to react with Br₂ in the next propagation step.'
    }]
  }
};

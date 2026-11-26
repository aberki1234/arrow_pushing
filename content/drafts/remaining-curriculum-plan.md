# Remaining curriculum: reaction plan (C6–C9, A1–A8, G1–G5)

Plan for every track of `docs/curriculum.md` not yet drafted (2026-11-27, drafted overnight by subagents at the
owner's request). The drafting brief is the one in `foundations-plan.md` ("The brief for whoever drafts a track"),
with the changes in `f6-core-plan.md` (track files carry `level`, `curriculumCode`, `showcaseReactionSlug`) and the
ones below. Each track is drafted into its own folder with `track.json` beside the reactions.

Changes to the brief for this round:

- `level` is `core` (C), `advanced` (A) or `graduate` (G); `curriculumCode` as in the headings.
- Tracks are drafted in parallel, so **the slugs below are fixed**: do not draft a reaction listed under another
  track. "(published)" reuses a reaction from `content/published/`. A track may reuse any published reaction.
- **Stereochemistry**: states cannot carry stereo marks yet (build item 12b–12e), so draft every reaction without
  `@`/`@@`/`/`/`\`. Explain stereochemical outcomes (inversion, endo, conrotatory, Felkin–Anh, anti-periplanar, ee) in
  captions, explanations and concept cards, and say in text that the app does not check them yet. A step that only
  changes stereochemistry (e.g. an epimerisation) cannot be drawn: leave it out and report it.
- **Missing capabilities** (no transition metals: Cu, Pd, Cr, Os, Ru, Rh, Ti, Ni…; no single-electron transfer;
  no excited states / hν steps): leave those reactions out and list them in the report.
- Large molecules (graduate tracks): real structures are wanted, but a protecting group or remote substituent that
  takes no part may be simplified (e.g. OMe for OTBS) if the caption or `mechanismSummary` says so.
- Long sequences: about 8 steps per reaction at most; split into consecutive reactions (`…-part-1` style slugs are
  allowed if needed) rather than cramming.
- The checks are run with `$JOB/verify_track.sh content/drafts/<folder>` (lint, drawability, map numbers in learner
  text, track lint) where `$JOB=/home/u6938219/.claude/jobs/86d14abd/tmp`; keep your own scripts in
  `$JOB/<folder>/`, never in the repository or bare `/tmp`.

## C6 Rearrangements — `rearrangements` (folder `C6-rearrangements/`)

1. **To carbon**: `pinacol-rearrangement` (pinacol, H₂SO₄ → pinacolone), `cyclobutylmethyl-ring-expansion`
   (1-cyclobutylethan-1-ol + HBr: the cation, ring expansion to a cyclopentyl cation, bromide; or another ring
   expansion if this one lints badly), `tiffeneau-demjanov-ring-expansion` (1-(aminomethyl)cyclohexan-1-ol, HNO₂:
   start from the diazonium ion, say so; ring expansion to cycloheptanone: a semipinacol),
   `e1-dehydration-with-methyl-shift` (published, optional).
2. **To nitrogen**: `beckmann-rearrangement` (cyclohexanone oxime, H₂SO₄ → caprolactam),
   `hofmann-rearrangement` (benzamide, Br₂, NaOH → the isocyanate; hydrolysis to aniline in a second reaction
   `isocyanate-hydrolysis` if it fits the set, else in text), `curtius-rearrangement` (benzoyl azide, heat →
   phenyl isocyanate + N₂, concerted; then trapping by tert-butanol or water).
3. **To oxygen**: `baeyer-villiger-oxidation` (published), `baeyer-villiger-of-acetophenone` (mCPBA → phenyl
   acetate: phenyl migrates, not methyl; methyl benzoate as a misconception or alternative product),
   `hock-rearrangement` (cumene hydroperoxide, H₂SO₄ → phenol + acetone).
4. **Checkpoint**.

## C7 Radical reactions — `radical-reactions` (folder `C7-radical-reactions/`)

1. **Chains**: `radical-bromination-methane` (published), `allylic-bromination-with-nbs` (cyclohexene, NBS: the
   allylic radical and its resonance; the polar NBS + HBr → Br₂ step explained in text or drawn as its own step),
   `anti-markovnikov-hbr-addition` (propene, HBr, a peroxide: initiation, Br• adds to the terminal carbon, H
   transfer).
2. **Selectivity**: `chlorination-of-propane` (both chlorides: 1- and 2-chloropropane as preferred / alternative
   products), `bromination-of-propane` (2-bromopropane preferred, 1-bromopropane alternative).
3. **Tin chemistry**: `aibn-and-tributyltin-hydride` (AIBN loses N₂, the cyanoisopropyl radical takes H from
   Bu₃SnH), `barton-mccombie-deoxygenation` (a cyclohexyl xanthate + Bu₃Sn•: S–Sn bond, β-scission, H from
   Bu₃SnH), `hexenyl-radical-cyclisation` (6-bromohex-1-ene, Bu₃SnH: 5-exo-trig, H transfer →
   methylcyclopentane; cyclohexane from 6-endo as a misconception or alternative product).
4. **Checkpoint**.

## C8 Pericyclic reactions I — `pericyclic-reactions` (folder `C8-pericyclic-reactions/`)

1. **Diels–Alder**: `butadiene-and-ethene-diels-alder`, `diels-alder-regiochemistry` (2-methoxybuta-1,3-diene +
   methyl acrylate: "para" preferred, "meta" alternative), `cyclopentadiene-and-maleic-anhydride` (endo explained).
2. **Electrocyclic**: `hexatriene-electrocyclisation` (disrotatory explained), `cyclobutene-ring-opening`
   (conrotatory explained; a substituted cyclobutene if it helps the text).
3. **Sigmatropic**: `cope-rearrangement` (3-methylhexa-1,5-diene → hepta-1,5-diene, or similar),
   `allyl-vinyl-ether-claisen` (→ pent-4-enal), `aromatic-claisen-rearrangement` (allyl phenyl ether → 2-allylphenol:
   [3,3] then tautomerisation).
4. **1,3-Dipoles**: `azide-alkyne-cycloaddition` (thermal: phenyl azide + an alkyne, the 1,4- and 1,5-triazoles as
   preferred / alternative), `nitrone-cycloaddition` (a nitrone + styrene → isoxazolidine).
5. **Checkpoint**.

## C9 Mechanisms in biology — `mechanisms-in-biology` (folder `C9-mechanisms-in-biology/`; optional, last)

Small models of the active sites (say so in captions: e.g. imidazole for histidine, methanol for serine).

1. **Acyl transfer**: `serine-protease-acylation` (triad model: serine O attacks the amide, the tetrahedral
   intermediate, the amine leaves), `serine-protease-deacylation` (water, through the second tetrahedral
   intermediate).
2. **Enzymatic C–C bonds**: `class-i-aldolase` (a lysine model + dihydroxyacetone phosphate (phosphate simplified
   if needed) → enamine → aldol; split if long), `thiamine-decarboxylation` (thiazolium ylide + pyruvate: addition,
   decarboxylation to the Breslow enamine).
3. **Cofactors**: `nadh-hydride-transfer` (a 1,4-dihydropyridine model reduces an aldehyde activated by an acid),
   `plp-transamination` (external aldimine → quinonoid → ketimine; split if long).
4. **Checkpoint**.

## A1 Stereoelectronics and conformation — `stereoelectronics` (folder `A1-stereoelectronics/`)

Mostly a stereo track: draft what the constitution can show and explain the rest.

1. **Anti-periplanar**: `e2-of-menthyl-chloride` (NaOEt: the only anti-periplanar H gives the less substituted
   alkene; menthene regioisomers as preferred / alternative), `furst-plattner-epoxide-opening`
   (4-tert-butylcyclohexene oxide + HBr: trans-diaxial opening; the other regioisomer as an alternative product).
2. **Addition to carbonyls**: `felkin-anh-addition` (2-phenylpropanal + MeMgBr; diastereoselectivity explained),
   `burgi-dunitz-hydride-addition` (4-tert-butylcyclohexanone + LiAlH₄: axial attack explained).
3. **Ring closure**: `bromo-alcohol-5-exo-tet` (4-bromobutan-1-ol, base → THF), `hydroxy-enone-5-exo-trig`
   (an intramolecular oxa-Michael that Baldwin allows) and `hydroxy-ester-lactonisation` (a γ-hydroxy ester →
   γ-butyrolactone); a 5-endo-trig misconception where it fits.
4. **Anomeric effect**: `glycoside-hydrolysis` (2-methoxytetrahydropyran, H₃O⁺: the oxocarbenium ion; a glucoside
   model if the SMILES stays readable).
5. **Checkpoint**.

## A2 Neighbouring groups — `neighbouring-groups` (folder `A2-neighbouring-groups/`)

1. **Anchimeric assistance**: `mustard-episulfonium-hydrolysis` (2-chloroethyl ethyl sulfide + water),
   `acetoxonium-participation` (trans-2-acetoxycyclohexyl tosylate, acetic acid: the acetoxonium ion, acetate
   opens it).
2. **Epoxides**: `epoxide-opening-acid` (2,2-dimethyloxirane, MeOH, H₂SO₄: the more substituted carbon),
   `epoxide-opening-base` (2,2-dimethyloxirane, NaOMe: the less substituted carbon), `payne-rearrangement`
   (a 2,3-epoxy alcohol, NaOH).
3. **Ring contractions**: `favorskii-rearrangement` (2-chlorocyclohexanone, NaOMe → methyl
   cyclopentanecarboxylate via the cyclopropanone), `ramberg-backlund-reaction` (an α-chloro sulfone, KOH → the
   episulfone → alkene + SO₂).
4. **Checkpoint**.

## A3 Sigmatropic and named rearrangements — `sigmatropic-rearrangements` (folder `A3-sigmatropic-rearrangements/`)

1. **[3,3]**: `ireland-claisen-rearrangement` (allyl propanoate, LDA, TMSCl → silyl ketene acetal → [3,3];
   split if long), `johnson-claisen-rearrangement` (an allylic alcohol, triethyl orthoacetate, propanoic acid:
   from the ketene acetal if the exchange steps make it too long; say so), `anionic-oxy-cope` (a
   3-hydroxyhexa-1,5-diene, KH, 18-crown-6 (crown in text) → the enolate → the ketone).
2. **[2,3]**: `2-3-wittig-rearrangement` (an allyl ether carbanion → homoallylic alkoxide),
   `mislow-evans-rearrangement` (an allylic sulfoxide → sulfenate ester; P(OMe)₃ removes sulfur → the allylic
   alcohol).
3. **Others**: `overman-rearrangement` (an allylic trichloroacetimidate, heat → allylic trichloroacetamide; the
   imidate formation as an earlier step if it fits), `benzilic-acid-rearrangement` (benzil, KOH).
4. **Checkpoint**.

## A4 Ylides, carbenes and nitrenes — `ylides-and-carbenes` (folder `A4-ylides-and-carbenes/`)

1. **Ylides**: `horner-wadsworth-emmons` (triethyl phosphonoacetate, NaH, benzaldehyde → ethyl cinnamate;
   E explained), `corey-chaykovsky-epoxidation` (trimethylsulfonium iodide, base, cyclohexanone),
   `peterson-olefination` (an α-silyl carbanion + a ketone; the β-silyl alkoxide eliminates),
   `julia-kocienski-olefination` (only if the Smiles rearrangement stays drawable and about 8 steps; else report).
2. **Carbenes**: `dichlorocarbene-cyclopropanation` (CHCl₃, KOtBu: α-elimination to :CCl₂, then cyclohexene),
   `simmons-smith-cyclopropanation` (ICH₂ZnI and cyclohexene, the butterfly step; Zn is in the element table),
   `wolff-rearrangement` (a diazoketone, heat or Ag⁺ (Ag not available: say heat) → ketene, water adds:
   Arndt–Eistert homologation).
3. **Hydrazones**: `bamford-stevens-reaction` (a tosylhydrazone + NaOMe → diazo compound → carbene or cation →
   alkene), `shapiro-reaction` (a tosylhydrazone + 2 BuLi → vinyllithium, then water).
4. **Checkpoint**.

## A5 Heterocycles — `heterocycles` (folder `A5-heterocycles/`)

1. **π-Excessive rings**: `acylation-of-pyrrole` (Ac₂O or a Vilsmeier-type electrophile at C2; C3 attack as a
   misconception/alternative), `bromination-of-furan` or `nitration-of-furan` (pick one that is chemically clean),
   `gramine-synthesis` (indole + formaldehyde + dimethylamine: the iminium ion attacks from C3).
2. **π-Deficient rings**: `2-chloropyridine-and-methoxide` (SNAr through the N-stabilised anion),
   `chichibabin-reaction` (pyridine + NaNH₂: addition, hydride loss to H₂ or a hydride shuttle; work-up),
   `pyridine-n-oxidation` (mCPBA; then N-oxide resonance or nitration at C4 if it fits).
3. **Ring synthesis**: `paal-knorr-pyrrole` (hexane-2,5-dione + methylamine; split if long), `hantzsch-pyridine`
   (only its key steps if the whole is too long; report what was cut), `fischer-indole-synthesis` (the
   phenylhydrazone of acetone or cyclohexanone, acid: ene-hydrazine, [3,3], rearomatisation, cyclisation, loss of
   NH₃; split into two reactions if long).
4. **Checkpoint**.

## A6 Organocatalysis — `organocatalysis` (folder `A6-organocatalysis/`)

1. **Enamine catalysis**: `proline-catalysed-aldol` (acetone + 4-nitrobenzaldehyde, L-proline: enamine, C–C bond
   with the carboxylic acid delivering H⁺, hydrolysis; split if long), `hajos-parrish-cyclisation` (the triketone,
   proline: intramolecular aldol via the enamine).
2. **Iminium catalysis**: `macmillan-iminium-diels-alder` (an imidazolidinone + cinnamaldehyde → iminium;
   cyclopentadiene adds; hydrolysis; split if long), `organocatalytic-michael-addition` (iminium activation of an
   enal; a nucleophile adds 1,4).
3. **Other modes**: `nhc-benzoin-condensation` (a thiazolium carbene + benzaldehyde → Breslow intermediate →
   benzoin), `stetter-reaction` (the Breslow intermediate adds 1,4 to an enone), `phase-transfer-alkylation`
   (only if it shows more than an SN2: else report).
4. **Checkpoint**. Enantioselectivity explained, not checked.

## A7 Protecting groups and chemoselectivity — `protecting-groups` (folder `A7-protecting-groups/`)

1. **Alcohols**: `tbs-protection` (TBSCl, imidazole), `tbaf-deprotection` (fluoride at silicon, pentacoordinate
   silicate), `thp-protection` (dihydropyran, TsOH), `mom-protection` (MOMCl, i-Pr₂NEt).
2. **Amines**: `boc-protection` (Boc₂O), `boc-deprotection-with-tfa` (t-Bu cation leaves, CO₂ lost),
   `fmoc-deprotection-with-piperidine` (E1cB to dibenzofulvene, piperidine traps it).
3. **Peptide coupling**: `dcc-hobt-coupling` (the O-acylisourea is caught by HOBt, the active ester meets the
   amine; split if long), `hatu-coupling` (carboxylate + HATU → the active ester; the amine adds; split if long).
4. **Checkpoint**. PMB off with DDQ (single-electron transfer) and Cbz off with H₂/Pd (transition metals) wait.

## A8 Pericyclic reactions II — `pericyclic-reactions-ii` (folder `A8-pericyclic-reactions-ii/`)

1. **Cycloadditions**: `retro-diels-alder` (cracking dicyclopentadiene), `hetero-diels-alder` (Danishefsky's diene
   or 1-methoxybutadiene + an aldehyde; the work-up to the dihydropyranone if Danishefsky's), `alder-ene-reaction`
   (propene or another alkene + maleic anhydride), `cheletropic-so2-extrusion` (3-sulfolene → butadiene + SO₂).
2. **Sigmatropic hydrogen shifts**: `suprafacial-1-5-hydrogen-shift` (5-methylcyclopenta-1,3-diene → the 1-methyl
   isomer).
3. **Selection rules**: `octatetraene-electrocyclisation` (8π conrotatory, then the 6π disrotatory closure to the
   bicycle if it fits; rotation sense explained).
4. **Checkpoint**. Photochemistry ([2+2], Norrish II) waits for excited states.

## G1 Robinson's tropinone (1917) — `robinson-tropinone` (folder `G1-robinson-tropinone/`)

`tropinone-iminium-formation` (succinaldehyde + methylamine → the cyclic iminium ion), `tropinone-first-mannich`
(the acetonedicarboxylate enol attacks), `tropinone-second-iminium` and/or `tropinone-second-mannich` (ring closure;
merge or split as the step count allows), `tropinone-decarboxylation` (β-keto acid, six-membered cyclic TS; the
second decarboxylation in text or a second reaction). Problem sets follow the curriculum's four; a checkpoint.

## G2 Wieland–Miescher ketone — `wieland-miescher-ketone` (folder `G2-wieland-miescher-ketone/`)

`wieland-miescher-michael` (2-methylcyclohexane-1,3-dione + MVK, base), `proline-enamine-of-the-triketone`,
`wieland-miescher-aldol` (intramolecular, via the enamine; hydrolysis), `wieland-miescher-dehydration` (E1cB to
the enone). The ee-deciding step explained.

## G3 Johnson's progesterone (1971) — `johnson-progesterone` (folder `G3-johnson-progesterone/`)

`johnson-allylic-cation` (the tertiary allylic alcohol + TFA), `johnson-polyene-cyclisation` (the cation–π cascade:
one concerted step or consecutive steps, as lints; the vinyl cation trapped by ethylene carbonate or water),
`ozonolysis-of-an-alkene` (Criegee mechanism; reductive work-up), `johnson-intramolecular-aldol` (the 1,5-diketone
→ the cyclohexenone). Simplify remote groups if the SMILES grows unreadable, and say so.

## G4 Corey's prostaglandin F₂α (1969) — `corey-prostaglandin` (folder `G4-corey-prostaglandin/`)

`corey-diels-alder` (5-(methoxymethyl)cyclopentadiene + 2-chloroacrylonitrile), `corey-ketone-unmasking`
(KOH, DMSO: α-chloronitrile → ketone; the polar route the textbooks give), `corey-baeyer-villiger` (the
bicyclic ketone → lactone), `iodolactonisation` (I₂, KI, the carboxylate), `tin-hydride-deiodination` (Bu₃SnH,
AIBN), `corey-horner-wadsworth-emmons` (the aldehyde + dimethyl (2-oxoheptyl)phosphonate), `corey-wittig`
(the lactol + the ylide of (4-carboxybutyl)triphenylphosphonium). Stereo explained.

## G5 Woodward's reserpine (1956) — `woodward-reserpine` (folder `G5-woodward-reserpine/`)

`woodward-diels-alder` (p-benzoquinone + methyl (E)-penta-2,4-dienoate), `woodward-mpv-reduction`
(Al(OiPr)₃), `bischler-napieralski-cyclisation` (amide + POCl₃ → the iminium; split if long),
`iminium-reduction-with-borohydride`; the C3 epimerisation only changes stereo: explained in a concept card,
reported as blocked.

## Not drafted

- **A9 Metal-catalysed reactions**: the whole track needs transition metals.
- Within tracks: organocuprates (C3), Sandmeyer (C4), Cr oxidations and Birch (C5), PMB/DDQ and Cbz/H₂–Pd (A7),
  photochemistry (A8), Rh carbenoids (A4), and stereo-only steps.

# Core C3–C5: reaction plan

Plan for C3 Conjugate addition, C4 Nucleophilic aromatic substitution and C5 Oxidation and reduction
(`docs/curriculum.md`, 2026-11-26). The drafting brief is the one in `foundations-plan.md` ("The brief for whoever
drafts a track"), with the changes listed in `f6-core-plan.md` (track files carry `level: "core"`,
`curriculumCode` and `showcaseReactionSlug`). Each track is drafted into its own folder with `track.json` beside
the reactions. Nothing is pushed to Create until the owner has reviewed the drafts.

Since 2026-11-26 the element table also has **Zn, Se, Sn, Hg and Ce** (Ce counted as Ce(III)). Transition metals
(Cu, Cr) and single-electron transfer are still missing, so the cuprate, Sandmeyer, chromium and Birch reactions of
the curriculum are left out of these tracks for now.

## C3 Conjugate addition — `conjugate-addition` (folder `C3-conjugate-addition/`)

1. **Michael addition**: `malonate-and-methyl-vinyl-ketone` (NaOEt: the malonate enolate adds 1,4; the new enolate
   is protonated by ethanol), `thiol-and-cyclohexenone` (a soft nucleophile: thiolate adds 1,4; 1,2 as a
   misconception), `methyllithium-and-cyclohexenone` (a hard nucleophile adds 1,2; work-up; 1,4 as an alternative
   product or a misconception, whichever the linter and the chemistry support).
2. **Enamines and amines**: `stork-enamine-michael` (the pyrrolidine enamine of cyclohexanone + methyl vinyl
   ketone or acrylonitrile; hydrolysis of the iminium ion only if it stays within about 8 steps, else end at the
   iminium ion and say so), `aza-michael-addition` (diethylamine + methyl acrylate).
3. **Baylis–Hillman**: `baylis-hillman-reaction` (DABCO, methyl acrylate, benzaldehyde: conjugate addition of
   DABCO, aldol, proton transfer, elimination of DABCO).
4. **Checkpoint**. (Organocuprates wait for transition metals.)

## C4 Nucleophilic aromatic substitution — `nucleophilic-aromatic-substitution` (folder `C4-nucleophilic-aromatic-substitution/`)

1. **SNAr**: `methoxide-and-2-4-dinitrochlorobenzene` (addition to the Meisenheimer complex, chloride leaves),
   `dimethylamine-and-2-4-dinitrofluorobenzene` (fluoride as the best SNAr leaving group: the addition is the slow
   step).
2. **Benzyne**: `benzyne-from-4-chlorotoluene` (NaNH₂, NH₃: elimination to the aryne, amide adds, protonation;
   p- and m-toluidine as preferred and alternative products).
3. **Diazonium salts**: `nitrosonium-ion-formation` (HNO₂ + H₃O⁺ → NO⁺ + water), `diazotisation-of-aniline`
   (from NO⁺: N-nitrosation, proton shuttles, loss of water to the diazonium ion), `azo-coupling` (benzenediazonium
   + phenoxide, para attack, rearomatisation), `diazonium-hydrolysis` (warming in water: N₂ leaves, the aryl
   cation is trapped by water).
4. **Checkpoint**. (Sandmeyer waits for transition metals.)

## C5 Oxidation and reduction — `oxidation-and-reduction` (folder `C5-oxidation-and-reduction/`)

1. **Hydride reductions**: `sodium-borohydride-chemoselectivity` (a keto ester: the ketone is reduced, the ester
   is not; ester attack as a misconception), `luche-reduction` (NaBH₄, CeCl₃, MeOH, cyclohex-2-enone: Ce³⁺ on the
   carbonyl oxygen, 1,2-reduction to the allylic alcohol; 1,4 as a misconception or alternative product; draw the
   Ce–O bond only if it reads well and stays drawable, else explain cerium in text),
   `meerwein-ponndorf-verley-reduction` (Al(OiPr)₃, isopropanol: the six-membered hydride transfer, then exchange).
2. **Oxidations without metals**: `swern-oxidation` (DMSO + oxalyl chloride → chlorodimethylsulfonium, the
   alcohol adds, Et₃N, the sulfonium ylide, intramolecular elimination; split into two reactions if it exceeds
   about 8 steps: `swern-activation` and `swern-oxidation`), `dess-martin-oxidation` (hypervalent iodine(V): the
   alcohol exchanges onto iodine, then acetate removes the α-H; leave it out if the strict reader or the picking
   cannot represent I(V) and say what failed), `baeyer-villiger-oxidation` (mCPBA + cyclohexanone →
   ε-caprolactone: addition to the Criegee intermediate, then the migration; C6 will add migratory aptitude).
3. **Removing C=O**: `wolff-kishner-reduction` (from the hydrazone, KOH, ethylene glycol, heat: proton transfers,
   loss of N₂, carbanion protonation). Clemmensen (Zn/Hg, HCl) goes through electron transfer from the zinc
   surface and its mechanism is not settled: leave it out and explain why, unless a defensible polar version
   exists.
4. **Checkpoint**. (Jones / PCC wait for transition metals; Birch for single-electron transfer.)

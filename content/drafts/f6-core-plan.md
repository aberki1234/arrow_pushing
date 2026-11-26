# F6 and Core C1–C2: reaction plan

Plan for the next three tracks of the authoring order in `docs/curriculum.md` (2026-11-26): F6 Carboxylic acid
derivatives, then the first two Core (second-year) tracks, C1 Enols and enolates and C2 Carbonyl condensations. The
drafting brief is the one in `foundations-plan.md` ("The brief for whoever drafts a track"), with the changes below.
Each track is drafted into its own folder with `track.json` beside the reactions. Nothing is pushed to Create until
the owner has reviewed the drafts.

Changes to the brief since F1–F5:

- Track files now carry `level` (`foundations` or `core`), `curriculumCode` (`F6`, `C1`, `C2`) and
  `showcaseReactionSlug` (one of the track's set items, drawn whole on the track's card): the owner's item 11.
- The three tracks are drafted in parallel, so the slugs below are fixed: do not draft a reaction of another track.

## F6 Carboxylic acid derivatives — `carboxylic-acid-derivatives` (folder `F6-carboxylic-acid-derivatives/`)

1. **Addition–elimination**: `acetyl-chloride-and-methylamine` (addition, chloride leaves, a second methylamine
   takes the proton), `methyl-acetate-saponification` (hydroxide adds, methoxide leaves, then the irreversible proton
   transfer to the carboxylate), `ethyl-acetate-acid-hydrolysis` (H₃O⁺: protonate, water adds, proton shuttles,
   ethanol leaves, deprotonate).
2. **Making esters and amides**: `fischer-esterification` (acetic acid + methanol, H₂SO₄ as an acid species),
   `acetic-anhydride-and-ethanol` (pyridine as the base), `dcc-amide-coupling` (carboxylic acid + DCC →
   O-acylisourea; the amine adds; dicyclohexylurea leaves).
3. **Two additions**: `methylmagnesium-bromide-and-ethyl-acetate` (addition, ethoxide leaves, the ketone adds a
   second Grignard, acid work-up), `lithium-aluminium-hydride-and-ethyl-acetate` (two hydride additions, work-up),
   `dibal-reduction-of-an-ester` (the tetrahedral intermediate survives at −78 °C; work-up gives the aldehyde).
4. **Checkpoint**: 4–6 of the above.

## C1 Enols and enolates — `enols-and-enolates` (folder `C1-enols-and-enolates/`)

1. **Tautomerism**: `acid-catalysed-enolisation-of-acetone` (H₃O⁺: protonate O, water removes an α-H),
   `base-catalysed-enolisation-of-acetone` (hydroxide removes an α-H; the enolate takes a proton on O from water).
2. **α-Substitution**: `acid-catalysed-bromination-of-acetone` (enol, then Br₂; deprotonation),
   `haloform-cleavage` (a tribromomethyl ketone + hydroxide: addition, CBr₃⁻ leaves, proton transfer to
   bromoform and the carboxylate; the three brominations explained in text).
3. **Enolate alkylation**: `lda-and-cyclohexanone-methylation` (LDA deprotonates, methyl iodide SN2),
   `kinetic-enolate-of-2-methylcyclohexanone` (LDA, −78 °C: the less substituted enolate preferred, the
   thermodynamic enolate as an alternative product with a caption).
4. **The aldol**: `aldol-addition-base` (published), `claisen-schmidt-condensation` (benzaldehyde + acetone,
   NaOH: aldol, then E1cB dehydration to benzalacetone).
5. **Checkpoint**.

## C2 Carbonyl condensations — `carbonyl-condensations` (folder `C2-carbonyl-condensations/`)

1. **Claisen family**: `claisen-condensation-of-ethyl-acetate` (ethoxide; the final deprotonation of the β-keto
   ester drives it; acid work-up), `dieckmann-cyclisation` (diethyl adipate → ethyl 2-oxocyclopentanecarboxylate),
   `crossed-claisen-with-ethyl-formate` (or another partner that cannot enolise).
2. **Mannich and Knoevenagel**: `mannich-reaction` (formaldehyde + dimethylamine → iminium; the enol of acetone
   attacks), `knoevenagel-condensation` (diethyl malonate + benzaldehyde, piperidine).
3. **Robinson annulation**: `robinson-michael-step` (cyclohexanone enolate + methyl vinyl ketone),
   `robinson-aldol-and-dehydration` (intramolecular aldol and E1cB to the octalone). C3 will own the plain malonate
   Michael addition, so do not draft that one.
4. **Checkpoint**.

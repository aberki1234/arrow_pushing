# ArrowPush curriculum roadmap

> Author roadmap (decided 2026-11-26): which Learn tracks exist, in what order, what each teaches and what the app
> needs before it can host them. Human copy: `docs/curriculum.html`. Keep the two in step.

Backbone: Clayden, Greeves and Warren, *Organic Chemistry* (2nd edition), checked against a typical UK MChem / US BS
and first-year graduate syllabus. A track is 3–6 problem sets and about 12–25 reactions ending in a checkpoint; each
reaction keeps its own difficulty tier 1–3. Examples are starting points, settled per track when it is drafted.

Status: **live** (published), **next** (first in the authoring order), **optional** (lower priority).

## Levels

- **Foundations** (First year): Curved arrows and the reactions every later track builds on.
- **Core** (Second year): Enolates, condensations, conjugate addition, rearrangements, radicals and the first pericyclic reactions.
- **Advanced** (Third and fourth year): Stereoelectronics, named rearrangements, ylides and carbenes, heterocycles, organocatalysis, protecting groups, metal catalysis.
- **Graduate** (Synthesis case studies): One track per published synthesis: its key steps in order, with the real conditions.

## Foundations (First year)

Curved arrows and the reactions every later track builds on.

### F1 · Curved arrows — **next**

Sources and sinks, formal charge, resonance and proton transfer, before any named reaction.

- Prerequisites: none
- *Sources and sinks*: hydroxide + H₃O⁺; NH₃ + BF₃ (Lewis adduct); Cl⁻ + a carbocation
- *Formal charge and octets*: protonating water and ammonia; t-butyl cation from t-BuOH₂⁺; a pentavalent-carbon trap (feedback)
- *Resonance*: carboxylate; enolate; allyl cation; amide; nitro group
- *Proton transfer and pKa*: acetic acid + hydroxide; alkoxide + water (which way it goes); phenol vs alcohol acidity

### F2 · Nucleophilic substitution — **next**

SN2 and SN1: who attacks, what leaves, and why the mechanism changes.

- Prerequisites: F1 Curved arrows
- *SN2*: hydroxide + bromomethane (published); cyanide + iodoethane; Finkelstein (NaI, acetone); azide + benzyl bromide
- *SN1*: t-butyl bromide solvolysis; benzylic and allylic cations; a carbocation rearrangement (1,2-shift)
- *Making leaving groups*: alcohol + HBr; tosylate formation and displacement; Appel (PPh₃, CBr₄)
- Needs: stereo validation
- Note: Inversion and racemisation are explained; checking them needs stereo validation.

### F3 · Elimination — **next**

E2, E1 and E1cB, and when elimination beats substitution.

- Prerequisites: F2 Nucleophilic substitution
- *E2*: 2-bromopropane + ethoxide; Zaitsev vs Hofmann (alternative products); anti-periplanar in cyclohexanes
- *E1*: acid dehydration of t-butanol; dehydration with a hydride shift
- *E1cB*: β-hydroxy ketone dehydration
- *Substitution or elimination?*: primary vs tertiary substrates; t-BuOK vs NaOEt
- Needs: stereo validation
- Note: Anti-periplanar geometry is explained, not checked, until stereo validation.

### F4 · Addition to alkenes

Electrophiles adding to C=C: Markovnikov, bromonium ions and concerted additions.

- Prerequisites: F1 Curved arrows
- *Via carbocations*: HBr (Markovnikov); acid-catalysed hydration; addition with a rearrangement
- *Via three-membered rings*: bromination (bromonium); halohydrin formation; epoxidation with mCPBA
- *Hydroboration*: BH₃ then H₂O₂/NaOH (anti-Markovnikov)
- Needs: stereo validation
- Note: Anti and syn addition need stereo validation to be checked.

### F5 · Carbonyl addition — **next**

Nucleophiles adding to aldehydes and ketones, and what happens to the tetrahedral intermediate.

- Prerequisites: F1 Curved arrows
- *Nucleophilic addition*: NaBH₄ reduction; Grignard addition; cyanohydrin
- *Hydrates, hemiacetals and acetals*: acid-catalysed acetal formation; acetal hydrolysis; acetals as protecting groups
- *Imines and enamines*: imine formation; enamine from a secondary amine; reductive amination (NaBH₃CN)
- *Ylides*: Wittig methylenation (published); betaine vs oxaphosphetane routes

### F6 · Carboxylic acid derivatives

Nucleophilic acyl substitution through the tetrahedral intermediate, and the reactivity order.

- Prerequisites: F5 Carbonyl addition
- *Addition–elimination*: acid chloride + amine; ester hydrolysis (base); ester hydrolysis (acid)
- *Making esters and amides*: Fischer esterification; DCC coupling; anhydride + alcohol
- *Two additions*: Grignard + ester (tertiary alcohol); LiAlH₄ reduction of an ester; DIBAL to the aldehyde

### F7 · Electrophilic aromatic substitution — **live**

How arenes react with electrophiles, and where.

- Prerequisites: F1 Curved arrows
- *Making the electrophile*: nitronium ion; Br₂/AlBr₃; acylium ion; isopropyl cation (hydride shift)
- *The arenium ion*: nitration, bromination, Friedel–Crafts alkylation and acylation, sulfonation of benzene
- *Directing effects*: toluene, anisole, phenol, acetanilide, chlorobenzene, nitrobenzene
- *Predict the position*: four new substrates
- Note: Live since 2026-11-26: 19 reactions and a checkpoint.

## Core (Second year)

Enolates, condensations, conjugate addition, rearrangements, radicals and the first pericyclic reactions.

### C1 · Enols and enolates

Making enols and enolates, and their reactions at carbon.

- Prerequisites: F5 Carbonyl addition, F1 Curved arrows
- *Tautomerism*: acid-catalysed enolisation; base-catalysed enolisation
- *α-Substitution*: α-bromination (acid); haloform reaction
- *Enolate alkylation*: LDA + methyl iodide; kinetic vs thermodynamic enolate (alternative products)
- *The aldol*: aldol addition (published); aldol condensation (E1cB)

### C2 · Carbonyl condensations

Enolates attacking esters and iminium ions: building C–C bonds and rings.

- Prerequisites: C1 Enols and enolates, F6 Carboxylic acid derivatives
- *Claisen family*: Claisen condensation; Dieckmann cyclisation; crossed Claisen
- *Mannich and Knoevenagel*: Mannich reaction; Knoevenagel condensation
- *Robinson annulation*: Michael then aldol then dehydration
- Note: Prerequisite of the tropinone and Wieland–Miescher case studies.

### C3 · Conjugate addition

1,2 vs 1,4 addition to enones, and soft nucleophiles.

- Prerequisites: C1 Enols and enolates
- *Michael addition*: malonate + methyl vinyl ketone; 1,2 vs 1,4 (alternative products)
- *Enamines and amines*: Stork enamine alkylation; aza-Michael
- *Baylis–Hillman*: DABCO-catalysed MBH
- *Organocuprates*: Me₂CuLi conjugate addition
- Needs: transition metals
- Note: Cuprates need transition-metal support; the rest works now.

### C4 · Nucleophilic aromatic substitution

When arenes are attacked by nucleophiles: Meisenheimer complexes, benzyne, diazonium salts.

- Prerequisites: F7 Electrophilic aromatic substitution
- *SNAr*: 2,4-dinitrochlorobenzene + methoxide; fluoride as a leaving group
- *Benzyne*: chlorobenzene + NaNH₂ (alternative products)
- *Diazonium salts*: diazotisation; azo coupling; Sandmeyer (CuX)
- Needs: transition metals
- Note: Sandmeyer needs copper; diazotisation and azo coupling work now.

### C5 · Oxidation and reduction

Hydride donors, oxygen-transfer reagents and dissolving metals, by mechanism.

- Prerequisites: F5 Carbonyl addition, F6 Carboxylic acid derivatives
- *Hydride reductions*: NaBH₄ vs LiAlH₄ chemoselectivity; Luche (CeCl₃); Meerwein–Ponndorf–Verley
- *Oxidations without metals*: Swern; Dess–Martin; Baeyer–Villiger
- *Removing C=O*: Wolff–Kishner; Clemmensen (Zn/Hg)
- *Chromium and dissolving metals*: Jones / PCC; Birch reduction
- Needs: transition metals, single-electron transfer
- Note: Most of the track works now (Ce and Zn are in the element table since 2026-11-26); Cr oxidations wait for transition metals and Birch for single-electron transfer.

### C6 · Rearrangements

1,2-Shifts to electron-poor carbon, nitrogen and oxygen.

- Prerequisites: F2 Nucleophilic substitution, F3 Elimination
- *To carbon*: pinacol rearrangement; Wagner–Meerwein; semipinacol
- *To nitrogen*: Beckmann; Hofmann; Curtius
- *To oxygen*: Baeyer–Villiger (migratory aptitude); Criegee / hydroperoxide rearrangement
- Note: Needs the 1,2-shift picking built in item 10g.

### C7 · Radical reactions

Chains, selectivity and radical C–C bond formation, with fish-hook arrows.

- Prerequisites: F1 Curved arrows
- *Chains*: bromination of methane (published); allylic bromination (NBS); HBr with peroxides (anti-Markovnikov)
- *Selectivity*: chlorination vs bromination of propane (alternative products)
- *Tin chemistry*: Barton–McCombie; radical cyclisation (Bu₃SnH, AIBN)
- Note: Tin (Sn) is in the element table since 2026-11-26 (also the v1 content list's Barton–McCombie).

### C8 · Pericyclic reactions I

Concerted cycloadditions, electrocyclic reactions and sigmatropic shifts, drawn as one step.

- Prerequisites: F4 Addition to alkenes
- *Diels–Alder*: butadiene + ethene; regiochemistry (alternative products); endo rule
- *Electrocyclic*: hexatriene ring closure; ring opening of cyclobutenes
- *Sigmatropic*: Cope; Claisen (allyl vinyl ether)
- *1,3-Dipoles*: azide–alkyne (thermal); nitrone cycloaddition
- Needs: stereo validation
- Note: Endo and con/disrotatory outcomes are explained until stereo validation.

### C9 · Mechanisms in biology — **optional**

The same arrows in enzymes and cofactors. Optional, lower priority.

- Prerequisites: C1 Enols and enolates, F6 Carboxylic acid derivatives
- *Acyl transfer*: serine protease (catalytic triad)
- *Enzymatic C–C bonds*: class I aldolase via an enamine; thiamine (umpolung)
- *Cofactors*: NAD⁺/NADH hydride transfer; PLP transamination

## Advanced (Third and fourth year)

Stereoelectronics, named rearrangements, ylides and carbenes, heterocycles, organocatalysis, protecting groups, metal catalysis.

### A1 · Stereoelectronics and conformation

Why orbital alignment decides which bonds form and break.

- Prerequisites: F3 Elimination, C1 Enols and enolates
- *Anti-periplanar*: E2 in cyclohexanes; Fürst–Plattner epoxide opening
- *Addition to carbonyls*: Felkin–Anh; Bürgi–Dunitz trajectory
- *Ring closure*: Baldwin's rules (allowed and disfavoured closures)
- *Anomeric effect*: glycoside hydrolysis
- Needs: stereo validation
- Note: Mostly a stereo-validation track; ring closures work now.

### A2 · Neighbouring groups

Participation, three-membered intermediates and ring contractions.

- Prerequisites: F2 Nucleophilic substitution, C6 Rearrangements
- *Anchimeric assistance*: episulfonium (mustard); acetoxonium ion
- *Epoxides*: acid vs base opening (alternative products); Payne rearrangement
- *Ring contractions*: Favorskii; Ramberg–Bäcklund
- Needs: stereo validation

### A3 · Sigmatropic and named rearrangements

[3,3] and [2,3] shifts in synthesis.

- Prerequisites: C8 Pericyclic reactions I, C6 Rearrangements
- *[3,3]*: Ireland–Claisen; Johnson–Claisen; oxy-Cope (anionic)
- *[2,3]*: [2,3]-Wittig; Mislow–Evans
- *Others*: Overman; benzilic acid rearrangement
- Needs: stereo validation

### A4 · Ylides, carbenes and nitrenes

Making C=C and three-membered rings with reactive intermediates.

- Prerequisites: F5 Carbonyl addition, C6 Rearrangements
- *Ylides*: Horner–Wadsworth–Emmons; Corey–Chaykovsky; Julia–Kocienski; Peterson (Si)
- *Carbenes*: dichlorocarbene cyclopropanation; Simmons–Smith (Zn); Wolff / Arndt–Eistert
- *Hydrazones*: Bamford–Stevens; Shapiro
- Needs: transition metals, stereo validation
- Note: Zn (Simmons–Smith) is in the element table; Rh carbenoids need transition metals.

### A5 · Heterocycles

Electrophilic and nucleophilic substitution of heteroaromatics, and making the rings.

- Prerequisites: F7 Electrophilic aromatic substitution, C4 Nucleophilic aromatic substitution, C2 Carbonyl condensations
- *π-Excessive rings*: pyrrole and furan at C2; indole at C3
- *π-Deficient rings*: pyridine SNAr (2-chloropyridine); Chichibabin; pyridine N-oxide
- *Ring synthesis*: Paal–Knorr; Hantzsch pyridine; Fischer indole ([3,3])
- Note: Takes the heteroaromatics planned as a second SEAr batch (decided 2026-11-26).

### A6 · Organocatalysis

Enamine and iminium catalysis with small organic molecules.

- Prerequisites: C1 Enols and enolates, C3 Conjugate addition
- *Enamine catalysis*: proline aldol; Hajos–Parrish
- *Iminium catalysis*: MacMillan Diels–Alder; organocatalytic Michael
- *Other modes*: NHC benzoin / Stetter; phase-transfer alkylation
- Needs: stereo validation
- Note: Enantioselectivity is the point; turnover is drawn now, selectivity needs stereo validation.

### A7 · Protecting groups and chemoselectivity

Putting groups on and off by mechanism, and choosing the right one.

- Prerequisites: F6 Carboxylic acid derivatives, C5 Oxidation and reduction
- *Alcohols*: TBS on (imidazole) and off (fluoride); THP and MOM acetals; PMB off (DDQ)
- *Amines*: Boc on and off (TFA); Fmoc off (piperidine, E1cB); Cbz off (H₂, Pd)
- *Peptide coupling*: DCC/HOBt; HATU
- Needs: single-electron transfer, transition metals
- Note: PMB/DDQ needs SET; Cbz hydrogenolysis needs Pd.

### A8 · Pericyclic reactions II

Frontier orbitals and selection rules.

- Prerequisites: C8 Pericyclic reactions I
- *Cycloadditions*: retro-Diels–Alder; hetero-Diels–Alder; ene reaction
- *Photochemistry*: [2+2] photocycloaddition; Norrish type II
- *Selection rules*: thermal vs photochemical electrocyclisation
- Needs: excited states, stereo validation

### A9 · Metal-catalysed reactions

Catalytic cycles as arrow-pushing: oxidative addition, transmetallation, insertion, reductive elimination.

- Prerequisites: F6 Carboxylic acid derivatives, C3 Conjugate addition
- *Cross-coupling*: Suzuki; Heck; Sonogashira (Pd/Cu); Buchwald–Hartwig
- *Oxidation*: Wacker; Sharpless epoxidation (Ti); Upjohn dihydroxylation (Os)
- *Other cycles*: olefin metathesis (Ru); hydrogenation (Rh)
- Needs: transition metals
- Note: The whole track waits for transition-metal support.

## Graduate (Synthesis case studies)

One track per published synthesis: its key steps in order, with the real conditions.

### G1 · Robinson's tropinone (1917)

One-pot double Mannich: succinaldehyde, methylamine and acetonedicarboxylic acid give tropinone.

- Prerequisites: C2 Carbonyl condensations
- *Iminium formation*: succinaldehyde + methylamine
- *First Mannich*: intermolecular, with the dicarboxylate enol
- *Second Mannich*: intramolecular ring closure
- *Decarboxylation*: two β-keto acid decarboxylations
- Note: Conditions: aqueous buffer, pH 7, rt.

### G2 · Wieland–Miescher ketone

Robinson annulation of 2-methylcyclohexane-1,3-dione with methyl vinyl ketone; the proline-catalysed (Hajos–Parrish–Eder–Sauer–Wiechert) version.

- Prerequisites: C2 Carbonyl condensations, C3 Conjugate addition
- *Michael addition*: dione + MVK
- *Intramolecular aldol*: via a proline enamine
- *Dehydration*: enone formation
- Needs: stereo validation
- Note: The enantioselective version needs stereo validation to check its ee-deciding step.

### G3 · Johnson's progesterone (1971)

A cationic polyene cyclisation forming three rings in one step.

- Prerequisites: C6 Rearrangements, A1 Stereoelectronics and conformation
- *Initiation*: allylic cation from a tertiary allylic alcohol (TFA)
- *Cyclisation*: cation–π cascade; vinyl cation trapping
- *Endgame*: ozonolysis; intramolecular aldol
- Needs: stereo validation

### G4 · Corey's prostaglandin F₂α (1969)

The Corey lactone route: Diels–Alder, Baeyer–Villiger, iodolactonisation, then the side chains.

- Prerequisites: C8 Pericyclic reactions I, C5 Oxidation and reduction, A4 Ylides, carbenes and nitrenes
- *Building the lactone*: cyclopentadiene + 2-chloroacrylonitrile; ketone unmasking; Baeyer–Villiger
- *Iodolactonisation*: I₂/KI; Bu₃SnH deiodination
- *Side chains*: HWE; Wittig
- Needs: stereo validation
- Note: Sn (Bu₃SnH) is in the element table.

### G5 · Woodward's reserpine (1956)

Diels–Alder to a cis-decalin, then Meerwein–Ponndorf–Verley, Bischler–Napieralski and an epimerisation.

- Prerequisites: C8 Pericyclic reactions I, A5 Heterocycles
- *The E ring*: benzoquinone + vinylacrylate Diels–Alder; MPV reduction (Al)
- *Joining the indole*: Bischler–Napieralski (POCl₃); iminium reduction
- *Epimerisation*: C3 epimerisation
- Needs: stereo validation

Second wave (each marked with what it needs):

- Overman's strychnine (1993): aza-Cope–Mannich. Needs: transition metals
- Nicolaou's taxol (1994): Shapiro, McMurry coupling. Needs: transition metals
- A modern Pd- or Ru-catalysed synthesis: cross-coupling or metathesis as the key step. Needs: transition metals

## Capabilities the curriculum needs

| Capability | What it means | Tracks waiting on it |
|---|---|---|
| New main-group elements | **Done 2026-11-26**: Zn, Se, Sn, Hg and Ce are in the strict reader's element table (valence and period; Ce counted as Ce(III)) and in the picking rules. Sm waits for single-electron transfer (SmI₂ only reacts by SET). | none |
| Stereo validation | Checking wedges and E/Z in answers (deferred in SPEC §9). Until then stereochemistry is explained in text and drawn, not assessed. | F2, F3, F4, C8, A1, A2, A3, A4, A6, A8, G2, G3, G4, G5 |
| Single-electron transfer | An electron as a reagent (Na/NH₃, Li, SmI₂, DDQ): radical anions and SET steps drawn with fish-hooks from a metal or a reagent. | C5, A7 |
| Transition metals | Pd, Cu, Ru, Rh, Ni, Os, Cr, Ti… with an electron-counting model (oxidation state, d-electrons, 16/18-electron rule) so oxidative addition, migratory insertion and reductive elimination can be drawn and checked. | C3, C4, C5, A4, A7, A9 |
| Excited states | hν as a step: an excited state or triplet diradical drawn as a state. | A8 |
| Whole-mechanism mode | Several reactions joined into one run (deferred in SPEC §9); a synthesis track works without it, one step per reaction. | none yet |

Suggested build order for capabilities: new main-group elements (done 2026-11-26), then stereo
validation (the most tracks), then single-electron transfer, then transition metals (a new electron-counting model).

## Authoring order

Foundations first: each is a prerequisite of later tracks, and the daily puzzle needs a broad pool of tier-1 reactions.

1. F1 Curved arrows
2. F2 Nucleophilic substitution
3. F3 Elimination
4. F5 Carbonyl addition
5. F6 Carboxylic acid derivatives
6. F4 Addition to alkenes
7. C1 Enols and enolates
8. C2 Carbonyl condensations
9. C3 Conjugate addition
10. C6 Rearrangements
11. C8 Pericyclic reactions I
12. C7 Radical reactions
13. C5 Oxidation and reduction
14. C4 Nucleophilic aromatic substitution
15. A5 Heterocycles
16. G1 Robinson's tropinone (1917)
17. G2 Wieland–Miescher ketone
18. A1 Stereoelectronics and conformation
19. A2 Neighbouring groups
20. A3 Sigmatropic and named rearrangements
21. A4 Ylides, carbenes and nitrenes
22. A6 Organocatalysis
23. A7 Protecting groups and chemoselectivity
24. A8 Pericyclic reactions II
25. G3 Johnson's progesterone (1971)
26. G4 Corey's prostaglandin F₂α (1969)
27. G5 Woodward's reserpine (1956)
28. C9 Mechanisms in biology
29. A9 Metal-catalysed reactions

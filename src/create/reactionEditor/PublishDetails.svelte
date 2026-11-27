<script lang="ts">
  // Publish's folded sections: More details (authors, references, daily puzzle) and Advanced
  // (spectators, atom roles for wrong-answer patterns; where the per-state and per-step
  // settings are).
  import { suggestedDailyPuzzleEligible } from "../reactionEditing/publishing/dailyPuzzleSuggestion.js";
  import { setReactionField } from "../reactionEditing/draft/fieldEdits.js";
  import type { ReactionDocument } from "../reactionEditing/draft/reactionDraft.js";
  import {
    authorsText,
    mapNumbersText,
    readAuthors,
    readMapNumbers,
    readRoles,
    type ReadText,
    rolesText,
  } from "./fieldText.js";

  type Edit = ReturnType<typeof setReactionField>;

  const { document, apply }: { document: ReactionDocument; apply: (edit: Edit) => void } = $props();

  // The owner's rule (docs/SPEC.md §1): only reactions that make or break a real bond.
  const dailySuggested = $derived(suggestedDailyPuzzleEligible(document));

  const listOf = <Item,>(key: string): Item[] =>
    Array.isArray(document[key]) ? (document[key] as Item[]) : [];

  function setFromText<Value>(key: string, read: ReadText<Value>): void {
    apply(
      "reason" in read
        ? { outcome: "refused", reason: read.reason }
        : setReactionField(document, key, read.value),
    );
  }
</script>

<details class="adv mt">
  <summary>More details: authors, references, daily puzzle</summary>
  <label class="f" for="authors">Authors (one per line: name | optional link)</label>
  <textarea
    id="authors"
    data-field="authors"
    rows="2"
    value={authorsText(listOf("authors"))}
    onchange={(event) => {
      setFromText("authors", readAuthors(event.currentTarget.value));
    }}></textarea>
  <label class="f" for="references">References (one per line)</label>
  <textarea
    id="references"
    data-field="references"
    rows="2"
    value={listOf<string>("references").join("\n")}
    onchange={(event) => {
      const references = event.currentTarget.value.split("\n").filter((line) => line.trim() !== "");
      apply(setReactionField(document, "references", references));
    }}></textarea>
  <label class="row small mt">
    <input
      type="checkbox"
      data-field="dailyPuzzleEligible"
      checked={document.dailyPuzzleEligible === true}
      onchange={(event) => {
        apply(setReactionField(document, "dailyPuzzleEligible", event.currentTarget.checked));
      }}
    />
    Can be a daily puzzle
    <span class="small muted">
      suggested: {dailySuggested
        ? "yes (a bond other than an O–H, N–H… forms or breaks)"
        : "no (resonance or proton transfers only: practice and Learn)"}
    </span>
  </label>
</details>
<details class="adv">
  <summary>Advanced (rarely needed)</summary>
  <label class="f" for="spectators">Spectator atoms, drawn faded (atom numbers)</label>
  <input
    id="spectators"
    data-field="spectatorMapNumbers"
    value={mapNumbersText(listOf("spectatorMapNumbers"))}
    onchange={(event) => {
      setFromText("spectatorMapNumbers", readMapNumbers(event.currentTarget.value));
    }}
  />
  <label class="f" for="roles">Atom roles for wrong-answer patterns (role: atom numbers)</label>
  <textarea
    id="roles"
    data-field="atomRoleToMapNumbers"
    rows="2"
    value={rolesText((document.atomRoleToMapNumbers ?? {}) as Record<string, number[]>)}
    onchange={(event) => {
      setFromText("atomRoleToMapNumbers", readRoles(event.currentTarget.value));
    }}></textarea>
  <p class="small muted">
    A state's name, caption and notes on atoms: Mechanism → select the state → Advanced. A step's
    key, route and other arrow sets: Mechanism → select the step → Advanced.
  </p>
</details>

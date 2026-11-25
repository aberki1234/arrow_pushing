<script lang="ts">
  // The reaction's own fields (docs/schema-design.md §3.1). Each field is saved when it loses
  // focus, through `apply` (so it can be undone); a refusal says why in the page's message.
  import { REACTION_CLASSES, setReactionField } from "../reactionEditing/fieldEdits.js";
  import type { ReactionDocument } from "../reactionEditing/reactionDraft.js";
  import {
    abbreviatedGroupsText,
    authorsText,
    mapNumbersText,
    readAbbreviatedGroups,
    readAuthors,
    readMapNumbers,
    readRoles,
    type ReadText,
    rolesText,
  } from "./fieldText.js";

  type Edit = ReturnType<typeof setReactionField>;

  const { document, apply }: { document: ReactionDocument; apply: (edit: Edit) => void } = $props();

  const textOf = (key: string): string => {
    const value = document[key];
    return typeof value === "string" ? value : "";
  };
  const classes = $derived(
    Array.isArray(document.reactionClasses) ? document.reactionClasses.map(String) : [],
  );
  const listOf = <Item,>(key: string): Item[] =>
    Array.isArray(document[key]) ? (document[key] as Item[]) : [];

  function setField(key: string, value: unknown): void {
    apply(setReactionField(document, key, value));
  }

  function setFromText<Value>(key: string, read: ReadText<Value>): void {
    apply(
      "reason" in read
        ? { outcome: "refused", reason: read.reason }
        : setReactionField(document, key, read.value),
    );
  }

  function toggleClass(reactionClass: string): void {
    setField(
      "reactionClasses",
      classes.includes(reactionClass)
        ? classes.filter((item) => item !== reactionClass)
        : [...classes, reactionClass],
    );
  }
</script>

<section class="card" aria-label="Reaction fields">
  <h3>Reaction</h3>
  <label class="small" for="title">Title</label>
  <input
    id="title"
    value={textOf("title")}
    onchange={(event) => {
      setField("title", event.currentTarget.value);
    }}
  />
  <label class="small" for="subtitle">Subtitle</label>
  <input
    id="subtitle"
    value={textOf("subtitle")}
    onchange={(event) => {
      setField("subtitle", event.currentTarget.value);
    }}
  />
  <label class="small" for="conditions">Conditions (over the reaction arrow)</label>
  <input
    id="conditions"
    value={textOf("conditionsLabel")}
    onchange={(event) => {
      setField("conditionsLabel", event.currentTarget.value);
    }}
  />
  <label class="small" for="summary">Mechanism summary (shown when the reaction is finished)</label>
  <textarea
    id="summary"
    rows="3"
    value={textOf("mechanismSummary")}
    onchange={(event) => {
      setField("mechanismSummary", event.currentTarget.value);
    }}></textarea>

  <p class="small">Types</p>
  <div class="row">
    {#each REACTION_CLASSES as reactionClass (reactionClass)}
      <button
        class="chip"
        aria-pressed={classes.includes(reactionClass)}
        onclick={() => {
          toggleClass(reactionClass);
        }}
      >
        {reactionClass}
      </button>
    {/each}
  </div>
  <div class="row mt">
    <label class="small" for="tier">Difficulty</label>
    <select
      id="tier"
      value={String(document.difficultyTier)}
      onchange={(event) => {
        setField("difficultyTier", Number(event.currentTarget.value));
      }}
    >
      <option value="1">●○○</option>
      <option value="2">●●○</option>
      <option value="3">●●●</option>
    </select>
    <label class="small">
      <input
        type="checkbox"
        checked={document.dailyPuzzleEligible === true}
        onchange={(event) => {
          setField("dailyPuzzleEligible", event.currentTarget.checked);
        }}
      />
      Daily puzzle
    </label>
  </div>

  <label class="small" for="authors">Authors (one per line: name | optional link)</label>
  <textarea
    id="authors"
    rows="2"
    value={authorsText(listOf("authors"))}
    onchange={(event) => {
      setFromText("authors", readAuthors(event.currentTarget.value));
    }}></textarea>
  <label class="small" for="references">References (one per line)</label>
  <textarea
    id="references"
    rows="2"
    value={listOf<string>("references").join("\n")}
    onchange={(event) => {
      setField("references", event.currentTarget.value.split("\n"));
    }}></textarea>
  <label class="small" for="spectators">Spectators, drawn faded (map numbers)</label>
  <input
    id="spectators"
    value={mapNumbersText(listOf("spectatorMapNumbers"))}
    onchange={(event) => {
      setFromText("spectatorMapNumbers", readMapNumbers(event.currentTarget.value));
    }}
  />
  <label class="small" for="roles">Atom roles for misconception patterns (role: map numbers)</label>
  <textarea
    id="roles"
    rows="2"
    value={rolesText((document.atomRoleToMapNumbers ?? {}) as Record<string, number[]>)}
    onchange={(event) => {
      setFromText("atomRoleToMapNumbers", readRoles(event.currentTarget.value));
    }}></textarea>
  <label class="small" for="groups">Abbreviated groups (label @ attachment: map numbers)</label>
  <textarea
    id="groups"
    rows="2"
    value={abbreviatedGroupsText(listOf("abbreviatedGroups"))}
    onchange={(event) => {
      setFromText("abbreviatedGroups", readAbbreviatedGroups(event.currentTarget.value));
    }}></textarea>
</section>

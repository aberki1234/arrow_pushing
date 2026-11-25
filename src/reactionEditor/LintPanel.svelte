<script lang="ts">
  // The live lint findings: ✕ blocks submission, ⚠ is advice. A click goes to the place.
  import type { LintFinding } from "../reactionLinting/lintFindings.js";

  const {
    findings,
    linting,
    onGoTo,
  }: {
    findings: readonly LintFinding[];
    linting: boolean;
    onGoTo: (finding: LintFinding) => void;
  } = $props();

  const errorCount = $derived(findings.filter((finding) => finding.lintLevel === "error").length);
</script>

<section class="card" aria-label="Lint">
  <h3>Lint {linting ? "…" : ""}</h3>
  {#if findings.length === 0}
    <p class="small">{linting ? "Checking…" : "✓ No findings."}</p>
  {:else}
    <p class="small muted">{errorCount} error(s) block submission; warnings are advice.</p>
    <ul class="outline">
      {#each findings as finding, position (position)}
        <li>
          <button
            class="btn sm finding"
            onclick={() => {
              onGoTo(finding);
            }}
          >
            <span aria-label={finding.lintLevel}>{finding.lintLevel === "error" ? "✕" : "⚠"}</span>
            <b>{finding.lintRuleId}</b>
            <code class="small">{finding.instancePath || "/"}</code>
            <span class="small">{finding.message}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

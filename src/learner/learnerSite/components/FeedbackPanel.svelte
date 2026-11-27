<script lang="ts">
  // The feedback box under the controls; announced to screen readers when it changes.
  import type { FeedbackText } from "../../stepSession/feedbackText.js";

  const { feedback }: { feedback: FeedbackText } = $props();
</script>

<div class={`fb ${feedback.feedbackTone}`} role="status" aria-live="polite">
  <h3>{feedback.heading}</h3>
  {#each feedback.paragraphs as paragraph, position (position)}
    <p>{paragraph}</p>
  {/each}
</div>

<script lang="ts">
  // Create's sign-in (docs/SPEC.md §6, "Contributors"; mockups/review.html): anyone may sign in,
  // with GitHub or Google (those the server offers).
  import type { SignInProvider } from "../model/contributorClientInterface.js";
  import { PROVIDER_TO_LABEL } from "../model/reviewView.js";

  const {
    providers,
    onSignIn,
  }: {
    providers: readonly SignInProvider[];
    onSignIn: (provider: SignInProvider) => void;
  } = $props();
</script>

<section class="card signin mt" aria-label="Sign in">
  <h2>Create on ArrowPush</h2>
  <p class="muted">
    Draw a mechanism, add hints and common mistakes, and submit it. A reviewer checks it before
    learners see it.
  </p>
  {#each providers as provider (provider)}
    <button
      class="btn primary provider"
      onclick={() => {
        onSignIn(provider);
      }}
    >
      Sign in with {PROVIDER_TO_LABEL[provider]}
    </button>
  {/each}
  <p class="small muted mt">
    We keep your name and email to credit your reactions. Learners never need an account.
  </p>
</section>

<script lang="ts">
  // Publish, on the server only (docs/SPEC.md §5, backend, "Publishing"): the licence tick, needed
  // at an author's first Publish (later versions keep that date), and the Publish button. The
  // server lints the draft and refuses it on any lint error.
  const { onPublish }: { onPublish: (licenceAgreed: boolean) => void } = $props();

  let licenceAgreed = $state(false);
</script>

<label class="small row">
  <input type="checkbox" bind:checked={licenceAgreed} />
  I publish this under CC BY-SA 4.0 (needed once)
</label>
<button
  class="btn primary sm"
  title="Save, then publish: the server lints the draft first"
  onclick={() => {
    onPublish(licenceAgreed);
  }}
>
  Publish
</button>

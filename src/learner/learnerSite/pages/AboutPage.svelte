<script lang="ts">
  // The About page (#/about, 2026-11-27): the source code, which the AGPL asks that every user of
  // the running site be offered; the two licences (code AGPL-3.0-or-later, reaction content
  // CC BY-SA 4.0); the credits; and how to contribute.
  import { SOURCE_CODE_ADDRESS } from "../model/siteNavigation.js";

  const {
    createAddress,
  }: {
    /** Create's address (VITE_CREATE_ADDRESS); null leaves its link out. */
    createAddress: string | null;
  } = $props();

  const createHref = $derived(
    createAddress === null || createAddress.endsWith("/") ? createAddress : `${createAddress}/`,
  );
</script>

<h1 class="mt">About ArrowPush</h1>
<p class="muted">Learn organic reaction mechanisms by drawing the curved arrows yourself.</p>

<div class="grid mt">
  <section class="card flat" aria-labelledby="open-source-heading">
    <h2 id="open-source-heading">Open source</h2>
    <p>
      ArrowPush is free and open source, under the GNU Affero General Public License. You may read,
      change and share its code. Anyone who runs a changed version as a website must share their
      changes in the same way.
    </p>
    <p><a href={SOURCE_CODE_ADDRESS}>Source code on GitHub</a></p>
  </section>

  <section class="card flat" aria-labelledby="licences-heading">
    <h2 id="licences-heading">Licences</h2>
    <ul>
      <li>
        The code:
        <a href={`${SOURCE_CODE_ADDRESS}/blob/main/LICENSE`}>AGPL-3.0-or-later</a>.
      </li>
      <li>
        The reactions (mechanisms, hints, explanations):
        <a href={`${SOURCE_CODE_ADDRESS}/blob/main/content/LICENSE`}>CC BY-SA 4.0</a>. Reuse them
        with credit to their authors, and share what you adapt under the same licence.
      </li>
    </ul>
  </section>

  <section class="card flat" aria-labelledby="credits-heading">
    <h2 id="credits-heading">Credits</h2>
    <ul>
      <li>Made by Maksim Lisau.</li>
      <li>
        Reactions are written by Maksim Lisau and contributors; the authors are named on each
        reaction's summary, with its references.
      </li>
      <li>
        Mechanisms follow the standard textbooks, chiefly Clayden, Greeves and Warren,
        <i>Organic Chemistry</i> (2nd edition, Oxford University Press).
      </li>
      <li>
        Built with RDKit (molecules, BSD licence), Ketcher by EPAM (Create's structure editor,
        Apache 2.0), Svelte, Vite, Hono, Better Auth, Kysely and PostgreSQL.
      </li>
    </ul>
  </section>

  <section class="card flat" aria-labelledby="contribute-heading">
    <h2 id="contribute-heading">Get involved</h2>
    <ul>
      {#if createHref !== null}
        <li><a href={createHref}>Write a reaction in Create</a>; every submission is reviewed.</li>
      {/if}
      <li>
        Found a wrong mechanism or a bug? <a href={`${SOURCE_CODE_ADDRESS}/issues`}>
          Report a problem
        </a>.
      </li>
      <li>
        Code and docs: see
        <a href={`${SOURCE_CODE_ADDRESS}/blob/main/CONTRIBUTING.md`}>how to contribute</a>.
      </li>
    </ul>
  </section>
</div>

<script lang="ts">
  // The owner's Users page (docs/SPEC.md §6, "Contributors"): name, sign-in provider, reactions,
  // joined, and a role menu Contributor / Reviewer / Blocked (the owner's own role is fixed).
  import type { ContributorClient, EditableRole, SiteUser } from "./contributorClient.js";
  import { PROVIDER_TO_LABEL, ROLE_TO_LABEL, timeAgo, userReactionsText } from "./reviewView.js";

  const { client, now = new Date() }: { client: ContributorClient; now?: Date } = $props();

  const EDITABLE_ROLES: readonly EditableRole[] = ["contributor", "reviewer", "blocked"];

  let users = $state.raw<SiteUser[] | null>(null);
  let message = $state("");

  function load(): void {
    client.users().then(
      (loaded) => {
        users = loaded;
      },
      (error: unknown) => {
        message = error instanceof Error ? error.message : String(error);
      },
    );
  }

  $effect(() => {
    load();
  });

  async function changeRole(user: SiteUser, siteRole: EditableRole): Promise<void> {
    const outcome = await client.setRole(user.userId, siteRole);
    message =
      outcome.outcome === "done"
        ? `${user.displayName} is now ${ROLE_TO_LABEL[siteRole].toLowerCase()}.`
        : outcome.reason;
    load();
  }

  function providersText(user: SiteUser): string {
    return user.providers
      .map((provider) =>
        provider === "github" || provider === "google" ? PROVIDER_TO_LABEL[provider] : provider,
      )
      .join(", ");
  }
</script>

<h2 class="mt2">Users</h2>
{#if message !== ""}
  <p class="small message good" role="status">{message}</p>
{/if}
<section class="card flat" aria-label="Users">
  {#if users === null}
    <p class="small muted">Loading…</p>
  {:else}
    <table class="users">
      <thead>
        <tr><th>Name</th><th>Signed in with</th><th>Reactions</th><th>Joined</th><th>Role</th></tr>
      </thead>
      <tbody>
        {#each users as user (user.userId)}
          <tr>
            <td>{user.displayName}</td>
            <td>{providersText(user)}</td>
            <td>{userReactionsText(user)}</td>
            <td>{timeAgo(user.joinedAt, now)}</td>
            <td>
              {#if user.siteRole === "owner"}
                Owner
              {:else}
                <select
                  aria-label={`Role of ${user.displayName}`}
                  value={user.siteRole}
                  onchange={(event) => {
                    void changeRole(user, event.currentTarget.value as EditableRole);
                  }}
                >
                  {#each EDITABLE_ROLES as role (role)}
                    <option value={role}>{ROLE_TO_LABEL[role]}</option>
                  {/each}
                </select>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
<p class="small muted">
  Blocked: can sign in and see their drafts but not save or submit; their submissions leave the
  queue.
</p>

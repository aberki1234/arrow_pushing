// @vitest-environment jsdom
/** Component test for CreateHome.svelte: Your mechanisms filtered by drafts or published. */
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import CreateHome from "./CreateHome.svelte";
import type { ListedReactionFile } from "./reactionFileStore.js";

function listed(reactionSlug: string, newestSubmissionStatus: string): ListedReactionFile {
  return {
    fileName: `${reactionSlug}.json`,
    reactionSlug,
    title: reactionSlug,
    newestReactionVersion: 1,
    newestSubmissionStatus,
    ownerUserId: "me",
    newestAuthorUserId: "me",
    creationProgress: null,
  };
}

test("All, Drafts and Published show the matching rows, with their counts", async () => {
  render(CreateHome, {
    props: {
      files: [
        listed("draft-one", "draft"),
        listed("in-review", "submitted"),
        listed("live-one", "published"),
      ],
      storagePlace: "the server",
      message: "",
      userId: "me",
      onNew: () => undefined,
      onOpen: () => undefined,
      onOpenLocal: () => undefined,
    },
  });
  const rowTitles = (): string[] =>
    [...document.querySelectorAll(".mylist .item b")].map((title) => title.textContent);
  expect(rowTitles()).toEqual(["draft-one", "in-review", "live-one"]);
  await fireEvent.click(screen.getByRole("button", { name: "Drafts (2)" }));
  expect(rowTitles()).toEqual(["draft-one", "in-review"]);
  await fireEvent.click(screen.getByRole("button", { name: "Published (1)" }));
  expect(rowTitles()).toEqual(["live-one"]);
  expect(screen.getByRole("button", { name: "All (3)" })).toBeTruthy();
});

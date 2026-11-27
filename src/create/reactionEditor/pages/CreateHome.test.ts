// @vitest-environment jsdom
/** Component test for CreateHome.svelte: Your mechanisms filtered by drafts or published. */
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import CreateHome from "./CreateHome.svelte";
import type { ListedReactionFile } from "../model/reactionFileStoreInterface.js";

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

const BASE_PROPS = {
  storagePlace: "the server",
  message: "",
  userId: "me",
  onNew: (): undefined => undefined,
  onOpen: (): undefined => undefined,
  onOpenLocal: (): undefined => undefined,
};

test("ticked drafts are published together after a confirmation", async () => {
  const published: string[][] = [];
  render(CreateHome, {
    props: {
      ...BASE_PROPS,
      files: [listed("one", "draft"), listed("two", "submitted"), listed("live", "published")],
      onPublishSelected: (reactionSlugs: readonly string[]) => {
        published.push([...reactionSlugs]);
        return Promise.resolve({ tone: "good" as const, text: "Published 2 versions." });
      },
    },
  });
  expect(screen.queryByRole("checkbox", { name: "Select live" })).toBeNull();
  await fireEvent.click(screen.getByRole("checkbox", { name: "Select one" }));
  await fireEvent.click(screen.getByRole("checkbox", { name: "Select two" }));
  await fireEvent.click(screen.getByRole("button", { name: "Publish selected (2)" }));
  expect(published).toEqual([]);
  await fireEvent.click(screen.getByRole("button", { name: "Publish 2 now" }));
  expect(published).toEqual([["one", "two"]]);
  expect(await screen.findByText("Published 2 versions.")).toBeTruthy();
});

test("Select all ticks every publishable row; without the right to publish, no ticks", async () => {
  const view = render(CreateHome, {
    props: {
      ...BASE_PROPS,
      files: [listed("one", "draft"), listed("two", "draft")],
      onPublishSelected: () => Promise.resolve({ tone: "good" as const, text: "" }),
    },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Select all (2)" }));
  expect(screen.getByRole("button", { name: "Publish selected (2)" })).toBeTruthy();
  view.unmount();
  render(CreateHome, { props: { ...BASE_PROPS, files: [listed("one", "draft")] } });
  expect(screen.queryByRole("checkbox")).toBeNull();
});

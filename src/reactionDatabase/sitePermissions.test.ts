/** Tests for sitePermissions.ts: what each site role may do. */
import { expect, it } from "vitest";
import { mayPerform, SITE_ACTIONS, siteActionsOf } from "./sitePermissions.js";

it("lets the owner do everything", () => {
  expect(siteActionsOf("owner")).toEqual(SITE_ACTIONS);
});

it("lets a reviewer review others, but not publish their own directly or manage users", () => {
  expect(siteActionsOf("reviewer")).toEqual([
    "createReactions",
    "seeEveryReaction",
    "submitForReview",
    "review",
  ]);
  expect(mayPerform("reviewer", "publish")).toBe(false);
  expect(mayPerform("reviewer", "manageUsers")).toBe(false);
});

it("lifts the open-drafts limit for the owner only", () => {
  expect(mayPerform("owner", "keepUnlimitedDrafts")).toBe(true);
  expect(mayPerform("reviewer", "keepUnlimitedDrafts")).toBe(false);
  expect(mayPerform("contributor", "keepUnlimitedDrafts")).toBe(false);
});

it("lets a contributor create and submit, nothing more", () => {
  expect(siteActionsOf("contributor")).toEqual(["createReactions", "submitForReview"]);
  expect(mayPerform("contributor", "publish")).toBe(false);
  expect(mayPerform("contributor", "seeEveryReaction")).toBe(false);
});

it("lets a blocked user do nothing", () => {
  expect(siteActionsOf("blocked")).toEqual([]);
});

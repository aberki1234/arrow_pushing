/** Tests for sitePermissions.ts: what each site role may do. */
import { expect, it } from "vitest";
import { mayPerform, SITE_ACTIONS, siteActionsOf } from "./sitePermissions.js";

it("lets the owner do everything", () => {
  expect(siteActionsOf("owner")).toEqual(SITE_ACTIONS);
});

it("lets a reviewer see every reaction, publish and review", () => {
  expect(siteActionsOf("reviewer")).toEqual([
    "createReactions",
    "seeEveryReaction",
    "submitForReview",
    "publish",
    "review",
  ]);
});

it("lets a contributor create and submit, nothing more", () => {
  expect(siteActionsOf("contributor")).toEqual(["createReactions", "submitForReview"]);
  expect(mayPerform("contributor", "publish")).toBe(false);
  expect(mayPerform("contributor", "seeEveryReaction")).toBe(false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTagIds, parseTagNames, buildCandidateTagRows } from "../lib/candidates/tags.js";

test("normalizeTagIds removes blanks and duplicate ids while preserving order", () => {
  assert.deepEqual(normalizeTagIds([" tag-a ", "", "tag-b", "tag-a", null]), ["tag-a", "tag-b"]);
});

test("parseTagNames accepts comma, semicolon, and pipe separated import values", () => {
  assert.deepEqual(parseTagNames("Walk-in, Priority; Night Shift | Priority"), ["Walk-in", "Priority", "Night Shift"]);
});

test("buildCandidateTagRows returns join rows for normalized tag ids", () => {
  assert.deepEqual(buildCandidateTagRows("candidate-1", ["tag-1", "tag-1", "tag-2"], "user-1"), [
    { candidate_id: "candidate-1", tag_id: "tag-1", assigned_by: "user-1" },
    { candidate_id: "candidate-1", tag_id: "tag-2", assigned_by: "user-1" },
  ]);
});

/**
 * Runtime shape validators for locally-persisted state (F-343bb92d).
 *
 * These guard the boundary where `JSON.parse(content) as T` previously
 * trusted disk content at face value. capsule-session.json and any
 * user-chosen *-draft.json are ordinary user-writable files — a crash
 * mid-write or manual edit can produce content that type-checks past an
 * `as` cast but violates the real shape (e.g. collaborators not an
 * array, editionSize a string), which used to throw deep inside a
 * consumer (e.g. `s.collaborators.filter(...)`) instead of being caught
 * here.
 */
import { describe, it, expect } from "vitest";
import { isValidStudioDraft, isValidSessionState } from "./validate";
import { DRAFT, VALID_SESSION } from "../__test__/fixtures";

describe("isValidStudioDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(isValidStudioDraft(DRAFT)).toBe(true);
  });

  it("accepts a draft with collaborators", () => {
    const withCollabs = {
      ...DRAFT,
      collaborators: [
        { name: "Alice", role: "producer", address: "rAlice123", splitPercent: 30 },
      ],
    };
    expect(isValidStudioDraft(withCollabs)).toBe(true);
  });

  it("tolerates unknown extra fields (forward compatibility)", () => {
    expect(isValidStudioDraft({ ...DRAFT, futureField: "whatever", nested: { a: 1 } })).toBe(true);
  });

  it("rejects null and non-objects", () => {
    expect(isValidStudioDraft(null)).toBe(false);
    expect(isValidStudioDraft(undefined)).toBe(false);
    expect(isValidStudioDraft("a string")).toBe(false);
    expect(isValidStudioDraft(42)).toBe(false);
    expect(isValidStudioDraft([])).toBe(false);
  });

  it("rejects when collaborators is not an array (the concrete crash case in F-b69d884a)", () => {
    expect(isValidStudioDraft({ ...DRAFT, collaborators: "not-an-array" })).toBe(false);
    expect(isValidStudioDraft({ ...DRAFT, collaborators: { name: "Alice" } })).toBe(false);
  });

  it("rejects when a collaborator entry is malformed", () => {
    expect(
      isValidStudioDraft({
        ...DRAFT,
        collaborators: [{ name: "Alice", role: "producer", address: "rAlice", splitPercent: "30" }],
      })
    ).toBe(false);
  });

  it("rejects when editionSize is a string instead of a number", () => {
    expect(isValidStudioDraft({ ...DRAFT, editionSize: "5" })).toBe(false);
  });

  it("rejects when title or artist is missing or the wrong type", () => {
    const { title, ...withoutTitle } = DRAFT;
    expect(isValidStudioDraft(withoutTitle)).toBe(false);
    expect(isValidStudioDraft({ ...DRAFT, artist: 123 })).toBe(false);
  });

  it("accepts nullable path fields as null", () => {
    expect(
      isValidStudioDraft({
        ...DRAFT,
        coverArtPath: null,
        mediaFilePath: null,
        benefitContentPath: null,
        walletsPath: null,
        draftPath: null,
      })
    ).toBe(true);
  });

  it("accepts nullable path fields as strings", () => {
    expect(
      isValidStudioDraft({
        ...DRAFT,
        coverArtPath: "/a.png",
        mediaFilePath: "/b.mp3",
        benefitContentPath: "/c.zip",
        walletsPath: "/w.json",
        draftPath: "/d.json",
      })
    ).toBe(true);
  });

  it("rejects when a nullable path field is neither null nor a string", () => {
    expect(isValidStudioDraft({ ...DRAFT, coverArtPath: 123 })).toBe(false);
  });
});

describe("isValidSessionState", () => {
  it("accepts a well-formed session", () => {
    expect(isValidSessionState(VALID_SESSION)).toBe(true);
  });

  it("accepts a session with draft: null", () => {
    expect(isValidSessionState({ ...VALID_SESSION, draft: null })).toBe(true);
  });

  it("accepts a session with a valid embedded draft", () => {
    expect(isValidSessionState({ ...VALID_SESSION, draft: DRAFT })).toBe(true);
  });

  it("rejects a session whose embedded draft is malformed", () => {
    expect(
      isValidSessionState({ ...VALID_SESSION, draft: { ...DRAFT, collaborators: "nope" } })
    ).toBe(false);
  });

  it("tolerates unknown extra top-level fields", () => {
    expect(isValidSessionState({ ...VALID_SESSION, futureField: 123 })).toBe(true);
  });

  it("rejects null and non-objects", () => {
    expect(isValidSessionState(null)).toBe(false);
    expect(isValidSessionState("session")).toBe(false);
    expect(isValidSessionState([])).toBe(false);
  });

  it("rejects when version is not 1", () => {
    expect(isValidSessionState({ ...VALID_SESSION, version: 2 })).toBe(false);
  });

  it("rejects an unknown activeStep value (would break the StudioShell page lookup)", () => {
    expect(isValidSessionState({ ...VALID_SESSION, activeStep: "not-a-real-step" })).toBe(false);
  });

  it("accepts every known activeStep value", () => {
    for (const step of ["create", "benefit", "review", "publish", "test", "recovery", "proof"]) {
      expect(isValidSessionState({ ...VALID_SESSION, activeStep: step })).toBe(true);
    }
  });

  it("rejects an unknown mode value", () => {
    expect(isValidSessionState({ ...VALID_SESSION, mode: "turbo" })).toBe(false);
  });

  it("rejects when artifactPaths is missing keys", () => {
    expect(isValidSessionState({ ...VALID_SESSION, artifactPaths: {} })).toBe(false);
  });

  it("rejects when an artifactPaths entry is neither null nor a string", () => {
    expect(
      isValidSessionState({
        ...VALID_SESSION,
        artifactPaths: { ...VALID_SESSION.artifactPaths, manifestPath: 42 },
      })
    ).toBe(false);
  });

  it("rejects when completed is missing keys or has non-boolean values", () => {
    expect(isValidSessionState({ ...VALID_SESSION, completed: {} })).toBe(false);
    expect(
      isValidSessionState({
        ...VALID_SESSION,
        completed: { ...VALID_SESSION.completed, published: "yes" },
      })
    ).toBe(false);
  });
});

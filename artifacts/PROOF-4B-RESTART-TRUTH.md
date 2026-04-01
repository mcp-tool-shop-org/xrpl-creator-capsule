# Proof 4B — Restart Truth

## What was built

1. **Session persistence module** (`app/src/state/session.ts`). Saves and restores app state to the Tauri app data directory as JSON. Distinguishes between:
   - Draft state (artist intent, pre-manifest)
   - Artifact paths (post-publish references to real files)
   - Completion flags (what has been published/verified)

2. **Draft autosave.** Debounced 2-second autosave on every draft change and step navigation. No manual save required for session persistence.

3. **Session restore on mount.** StudioProvider loads the last session on startup and validates all artifact paths before restoring. Broken paths are cleared. Completion flags are reset if corresponding artifacts are missing.

4. **Published state is never inferred from cache.** The `validateSession()` function reads each artifact path from disk before trusting it. If the receipt file is missing or unreadable, `completed.published` is set to false — no false "published" status from stale UI cache.

5. **Session clear on draft reset.** Starting a new release clears the session file.

## What this proves

- Drafts restore correctly after app restart
- Artifact references survive restart (if files still exist at recorded paths)
- No false "published" state from cached data
- Broken/moved file paths fail clearly (cleared to null, completion flags reset)
- Recovery from restart is obvious (app resumes where you left off)

## Files changed

- `app/src/state/session.ts` — new session persistence module
- `app/src/state/studio.tsx` — autosave on draft changes, restore on mount
- `app/src/components/studio/PublishPage.tsx` — saves artifact paths on successful publish
- `app/src-tauri/tauri.conf.json` — added APPDATA/APPCONFIG/APPLOCALDATA to FS scope

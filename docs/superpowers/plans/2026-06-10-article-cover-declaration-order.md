# Article Cover And Declaration Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move article cover and declaration handling to immediately after the article title is filled, while keeping AI declaration after editor content is built.

**Architecture:** Update the publish draft builder order in `src/penguin/publish-article.ts` and align orchestrator tests so they verify article cover and declaration happen before editor media work, with AI declaration still last.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Lock The New Order In Tests

**Files:**
- Modify: `C:/Users/LXYou/workspace/ixBrowser_skills/tests/cli/orchestrator.test.ts`
- Test: `C:/Users/LXYou/workspace/ixBrowser_skills/tests/cli/orchestrator.test.ts`

- [ ] **Step 1: Update the existing order assertions**

Adjust the pause-mode orchestrator assertions so article cover and declaration are expected before image insertion and video upload, while AI declaration submit remains after media work.

- [ ] **Step 2: Run the targeted orchestrator test to verify it fails**

Run: `npm test -- tests/cli/orchestrator.test.ts`
Expected: FAIL on the updated ordering assertions because implementation still uses the old order.

### Task 2: Reorder The Publish Draft Builder

**Files:**
- Modify: `C:/Users/LXYou/workspace/ixBrowser_skills/src/penguin/publish-article.ts`
- Test: `C:/Users/LXYou/workspace/ixBrowser_skills/tests/cli/orchestrator.test.ts`

- [ ] **Step 1: Move article cover and declaration earlier**

In `buildDraft`, place `setArticleCover(articleCoverPath)` and `applyDeclaration()` immediately after `fillTitle(title)`, and keep `applyAiDeclaration()` after `ensureVideoReady()` and `removeEmptyContentBlocks?.()`.

- [ ] **Step 2: Re-run the targeted orchestrator test to verify it passes**

Run: `npm test -- tests/cli/orchestrator.test.ts`
Expected: PASS

### Task 3: Full Verification

**Files:**
- Modify: none
- Test: `C:/Users/LXYou/workspace/ixBrowser_skills/tests/cli/orchestrator.test.ts`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: TypeScript build passes

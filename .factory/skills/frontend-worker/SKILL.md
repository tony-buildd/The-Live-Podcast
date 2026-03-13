---
name: frontend-worker
description: Implements React components, pages, and client-side features for TonyPodcast using Next.js App Router with Tailwind CSS.
---

# Frontend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features involving:
- React components (src/components/)
- Next.js pages (src/app/)
- Client-side logic (hooks, context, state management)
- Styling and layout (Tailwind CSS 4)
- Browser APIs (Web Speech, SpeechSynthesis, YouTube IFrame API)
- Client-side integrations (SSE consumption, form handling)

## Design Principles (from frontend-design skill)

Before writing code, consider:
- **Tone**: TonyPodcast should feel modern, conversational, and focused. Dark theme friendly.
- **Spacing**: Use Tailwind's spacing scale (multiples of 4px). No magic numbers.
- **Typography**: Clear hierarchy — heading sizes for page titles, section headings, body text.
- **Color palette**: Primary accent color, neutrals, semantic colors (error red, success green).
- **Layout**: 12-column grid concepts via Tailwind. Mobile-first responsive.
- **Empty states**: Never leave areas blank — show instructional content with CTAs.
- **Loading states**: Skeleton screens over spinners where possible.
- **Accessibility**: 4.5:1 contrast, focus rings, semantic HTML, ARIA labels on icon buttons.

## Work Procedure

### 1. Understand the Feature

Read the feature description, preconditions, expectedBehavior, and verificationSteps carefully. Check that API endpoints and data models this feature depends on exist. If preconditions are NOT met, return to orchestrator.

### 2. Write Tests First (RED)

Before writing any component code:
- Create test file(s) co-located with components or in `tests/` directory
- Use Vitest + React Testing Library (install @testing-library/react if not present)
- Test rendering, user interactions, state transitions, error states
- Run tests to confirm they FAIL: `npx vitest run <test-file> --reporter=verbose`

### 3. Implement

- Use `"use client"` directive for components with interactivity, hooks, or browser APIs
- Follow existing patterns: `@/*` path alias, named exports, interfaces for props
- Use Tailwind CSS 4 classes exclusively for styling (no inline styles, no CSS modules)
- Responsive design: mobile-first with sm:/md:/lg: breakpoints
- Semantic HTML: proper heading hierarchy, button vs a, lists, form elements
- Accessible: focus management, ARIA labels, keyboard navigation
- For pages: use Next.js App Router conventions (page.tsx, layout.tsx, loading.tsx, error.tsx)
- For components: one component per file in src/components/

### 4. Make Tests Pass (GREEN)

- Run tests: `npx vitest run <test-file> --reporter=verbose`
- Fix implementation until all tests pass

### 5. Verify with agent-browser

This is CRITICAL. Every user-facing feature must be verified visually:
- Start the dev server: `node node_modules/next/dist/bin/next dev --port 3100`
- Use agent-browser to navigate to the page
- Verify each expectedBehavior item visually:
  - Component renders correctly
  - Interactions work (clicks, keyboard, form submission)
  - Responsive layout at different viewport sizes
  - Loading and error states display properly
  - Accessibility: tab navigation works, focus rings visible
- Each verified behavior = one `interactiveChecks` entry with the action taken and result observed
- Stop the dev server when done

### 6. Run Validators

- `npx tsc --noEmit` (must pass with zero errors)
- `npx eslint .` (must pass)
- `npx vitest run --reporter=verbose` (full test suite must pass)

### 7. Commit

- Stage only files related to this feature
- Write a clear commit message describing what was implemented

## Example Handoff

```json
{
  "salientSummary": "Built the Watch page (/watch/[id]) with YouTubePlayer component (IFrame API), ChatPanel with message list + input, and JumpInButton. Verified via agent-browser: player loads video, Jump In pauses and opens chat, messages send and stream, Resume closes chat and resumes playback. All responsive at mobile/desktop.",
  "whatWasImplemented": "src/app/watch/[id]/page.tsx (watch page with player + chat layout), src/components/YouTubePlayer.tsx (YouTube IFrame API wrapper with play/pause/seek/getCurrentTime), src/components/ChatPanel.tsx (message list with auto-scroll, input with Enter-to-send, streaming display), src/components/JumpInButton.tsx (pauses video, captures timestamp, opens chat). Tests for all components.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run tests/components/ --reporter=verbose", "exitCode": 0, "observation": "18 tests passing across 4 component test files" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" },
      { "command": "npx eslint .", "exitCode": 0, "observation": "No lint errors" }
    ],
    "interactiveChecks": [
      { "action": "Navigate to /watch/test-episode-id via agent-browser", "observed": "Page loads with YouTube player on left, chat panel on right. Player shows video thumbnail." },
      { "action": "Click Jump In button", "observed": "Video pauses. Chat panel activates with text input focused. Jump In button replaced by Resume button." },
      { "action": "Type 'Hello' and press Enter", "observed": "User message appears in chat. Assistant response streams in token by token. Auto-scroll follows." },
      { "action": "Click Resume", "observed": "Chat panel deactivates. Video resumes from paused position." },
      { "action": "Resize viewport to 375px width", "observed": "Layout switches to stacked: player on top, chat below. No horizontal scrollbar." }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/components/YouTubePlayer.test.tsx",
        "cases": [
          { "name": "renders iframe with correct video ID", "verifies": "VAL-UI-011" },
          { "name": "exposes play/pause/getCurrentTime methods", "verifies": "VAL-UI-012" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- API endpoint this component depends on doesn't exist or returns unexpected format
- Required npm package not installed and you're unsure if it should be added
- Design requirements are ambiguous (layout unclear, missing states)
- Browser API (YouTube IFrame, Web Speech) doesn't work as expected in the dev environment
- agent-browser reveals visual issues that require architectural changes

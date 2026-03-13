# TonyPodcast UI / Pages / Navigation — Behavioral Assertions

---

## Landing Page (/)

### VAL-UI-001: Landing page renders hero section
The landing page at `/` renders a visible hero section containing the TonyPodcast branding/logo, a headline, and a sub-headline or tagline describing the product.
**Pass condition:** Hero section is visible on page load with branding, headline text, and tagline.
**Evidence:** DOM contains a hero container with heading elements and brand imagery.

### VAL-UI-002: Landing page displays "Add a podcast" CTA button
The landing page renders a prominent "Add a podcast" call-to-action button within or below the hero section.
**Pass condition:** A button or link with text "Add a podcast" (or equivalent) is visible and clickable.
**Evidence:** Query for a button/anchor with accessible name matching "Add a podcast".

### VAL-UI-003: "Add a podcast" CTA opens the AddEpisodeModal
Clicking the "Add a podcast" CTA on the landing page opens the AddEpisodeModal dialog.
**Pass condition:** After click, a modal/dialog appears with an input for a podcast URL and a submit action.
**Evidence:** A dialog element or overlay with role="dialog" becomes visible in the DOM.

### VAL-UI-004: Landing page is accessible and has correct metadata
The landing page has a descriptive `<title>`, proper heading hierarchy (single h1), and all images have alt text.
**Pass condition:** Document title is set to a TonyPodcast-specific string; exactly one `<h1>` exists; no images lack `alt`.
**Evidence:** Inspect `document.title`, query `h1` count, and audit `img[alt]`.

### VAL-UI-005: Landing page responsive layout — mobile
On viewports ≤ 640px, the landing page stacks content vertically, hero text and CTA remain fully visible without horizontal scrolling.
**Pass condition:** No horizontal overflow; CTA button is fully visible and tappable at 375px width.
**Evidence:** Set viewport to 375×812; verify `document.documentElement.scrollWidth <= window.innerWidth`; CTA is in viewport.

### VAL-UI-006: Landing page responsive layout — desktop
On viewports ≥ 1024px, the landing page renders hero content centered or in a visually balanced layout appropriate for wide screens.
**Pass condition:** Hero content does not stretch full-width edge-to-edge; max-width constraint is applied.
**Evidence:** Inspect computed styles on hero container; confirm `max-width` or centered layout.

---

## Navigation

### VAL-UI-010: Navigate from Landing to Library
A navigation path exists from the landing page (`/`) to the library page (`/library`), either via a nav link, header menu, or programmatic redirect after adding an episode.
**Pass condition:** User can reach `/library` from `/` through at most 2 clicks.
**Evidence:** A nav element or link with `href="/library"` is present, or the AddEpisodeModal success flow redirects to `/library`.

### VAL-UI-011: Navigate from Library to Watch page
Clicking an episode card on the library page navigates to the corresponding watch page at `/watch/[id]`.
**Pass condition:** After clicking an EpisodeCard, the URL changes to `/watch/<episode-id>` and the watch page renders.
**Evidence:** `window.location.pathname` matches `/watch/<id>` pattern; watch page content is visible.

### VAL-UI-012: Navigate from Watch page back to Library
The watch page provides a way to navigate back to the library (back button, breadcrumb, or header nav link).
**Pass condition:** A clickable element navigates the user to `/library`.
**Evidence:** A link/button with `href="/library"` or equivalent `router.push` behavior is present on the watch page.

### VAL-UI-013: Direct URL access to Library page
Navigating directly to `/library` via the browser address bar renders the library page without errors.
**Pass condition:** Page renders successfully with either the episode grid or the empty state; no 404 or error page.
**Evidence:** HTTP 200 response; page contains library-specific UI elements.

### VAL-UI-014: Direct URL access to Watch page with valid ID
Navigating directly to `/watch/<valid-id>` renders the watch page with the YouTube player and chat panel.
**Pass condition:** Page loads without error; YouTube player iframe and chat panel are present.
**Evidence:** HTTP 200; DOM contains an iframe with `youtube.com/embed` src and a chat panel container.

### VAL-UI-015: Direct URL access to Watch page with invalid ID
Navigating to `/watch/<invalid-id>` (nonexistent episode) shows an appropriate error or not-found state.
**Pass condition:** Page shows a user-friendly error message or redirects; does not crash or show a blank page.
**Evidence:** Error message is visible, or redirect to `/library` occurs, or a 404 page renders.

### VAL-UI-016: 404 page for unknown routes
Navigating to a route that does not exist (e.g., `/nonexistent`) shows a proper 404 or not-found page.
**Pass condition:** A 404-style page renders with a message and optionally a link back to `/` or `/library`.
**Evidence:** HTTP 404 status or a Next.js not-found page renders.

---

## Add Episode Modal

### VAL-UI-020: AddEpisodeModal opens on CTA click
Clicking the "Add a podcast" CTA (on landing or library page) opens the AddEpisodeModal.
**Pass condition:** Modal overlay and dialog become visible; focus is trapped inside the modal.
**Evidence:** Element with `role="dialog"` or equivalent appears; `aria-modal="true"` is set.

### VAL-UI-021: AddEpisodeModal contains URL input field
The modal contains a text input for pasting a YouTube podcast URL.
**Pass condition:** An `<input>` with appropriate type (text/url) and placeholder text is present inside the modal.
**Evidence:** Query `input[type="text"]` or `input[type="url"]` within the dialog.

### VAL-UI-022: AddEpisodeModal contains a submit button
The modal contains a submit/add button to confirm the URL entry.
**Pass condition:** A button with submit-like text ("Add", "Submit", "Add Episode") is present and initially enabled.
**Evidence:** Query for a button element inside the dialog with appropriate accessible name.

### VAL-UI-023: AddEpisodeModal can be dismissed
The modal can be closed/dismissed via a close button (X), clicking outside the overlay, or pressing Escape.
**Pass condition:** At least one dismiss mechanism works; modal disappears and the underlying page is interactive again.
**Evidence:** After dismiss action, the dialog element is removed from the DOM or hidden.

### VAL-UI-024: Pasting a valid YouTube URL enables submission
When a valid YouTube URL (e.g., `https://www.youtube.com/watch?v=...`) is pasted into the input, the submit button remains enabled and the form can be submitted.
**Pass condition:** Input accepts the URL; submit button is not disabled; form submission triggers the add flow.
**Evidence:** Set input value to a valid YouTube URL; verify submit button is enabled.

### VAL-UI-025: Submitting shows loading state
After submitting a valid URL, the modal displays a loading indicator (spinner, skeleton, or disabled button with loading text).
**Pass condition:** A loading state is visible between submission and resolution (success or error).
**Evidence:** Submit button shows spinner or text changes to "Adding…" / "Loading…"; or a separate loading indicator appears.

### VAL-UI-026: Successful submission shows success feedback
After the episode is successfully added, the modal shows a success message or automatically closes and the new episode appears in the library.
**Pass condition:** Either (a) a success toast/message appears and modal closes, or (b) modal closes and user is redirected to library where the new episode is visible.
**Evidence:** Success message in DOM, or navigation to `/library` with the new episode card present.

### VAL-UI-027: Failed submission shows error feedback
If the submission fails (invalid URL, network error, duplicate, etc.), the modal displays a user-facing error message without closing.
**Pass condition:** An error message is visible inside the modal; the input retains the entered URL; the user can retry.
**Evidence:** Error text element is visible in the dialog; input value is preserved; submit button is re-enabled.

### VAL-UI-028: Empty URL submission is prevented
Submitting the modal with an empty input is prevented via client-side validation.
**Pass condition:** Submit button is disabled when input is empty, or clicking submit with empty input shows a validation error without making a network request.
**Evidence:** Button has `disabled` attribute when input is empty, or a validation message appears.

### VAL-UI-029: Invalid (non-YouTube) URL shows validation error
Pasting a non-YouTube URL (e.g., `https://example.com`) and submitting shows a validation error indicating only YouTube URLs are accepted.
**Pass condition:** A validation error message is displayed; no network request is made for obviously invalid URLs.
**Evidence:** Error text mentioning "YouTube" or "valid URL" appears in the dialog.

---

## Library Page (/library)

### VAL-UI-040: Library page renders empty state when no episodes exist
When there are no episodes in the database, the library page displays an empty state with a message (e.g., "No podcasts yet") and a CTA to add one.
**Pass condition:** Empty state UI is visible with instructional text and an "Add a podcast" button or link.
**Evidence:** Query for empty-state container with text content and a CTA element.

### VAL-UI-041: Library page displays episodes grouped by podcaster
When episodes exist, they are visually grouped by podcaster/channel name with a section heading for each group.
**Pass condition:** Each podcaster group has a visible heading (channel name) and one or more EpisodeCards beneath it.
**Evidence:** Multiple section containers exist, each with a heading and child card elements.

### VAL-UI-042: Episode cards show thumbnail image
Each EpisodeCard displays a thumbnail image for the episode.
**Pass condition:** Each card contains an `<img>` element with a `src` pointing to a thumbnail URL and appropriate `alt` text.
**Evidence:** Query `img` inside each card; `src` is a non-empty URL; `alt` is set.

### VAL-UI-043: Episode cards show title
Each EpisodeCard displays the episode title as visible text.
**Pass condition:** Each card contains a heading or prominent text element with the episode's title.
**Evidence:** A heading element (h2/h3/h4) or styled text within the card matches the episode title from data.

### VAL-UI-044: Episode cards show description/excerpt
Each EpisodeCard displays a description or excerpt of the episode, potentially truncated.
**Pass condition:** Each card contains a paragraph or text element with descriptive content (may be truncated with ellipsis).
**Evidence:** A `<p>` or text container within the card has non-empty text content.

### VAL-UI-045: Clicking an episode card navigates to its watch page
Clicking anywhere on an EpisodeCard navigates to `/watch/[id]` for that episode.
**Pass condition:** After click, the URL is `/watch/<episode-id>` and the watch page renders.
**Evidence:** `window.location.pathname` matches the expected watch URL.

### VAL-UI-046: Library page grid is responsive — mobile
On viewports ≤ 640px, episode cards stack in a single column.
**Pass condition:** Cards are laid out in a single column; no horizontal scrolling required.
**Evidence:** At 375px viewport width, all cards have the same `x` offset; `scrollWidth <= clientWidth`.

### VAL-UI-047: Library page grid is responsive — tablet
On viewports between 641px and 1023px, episode cards display in a 2-column grid.
**Pass condition:** Cards are arranged in 2 columns per row.
**Evidence:** At 768px viewport, adjacent cards have different `x` positions; grid has 2 columns.

### VAL-UI-048: Library page grid is responsive — desktop
On viewports ≥ 1024px, episode cards display in a 3+ column grid.
**Pass condition:** Cards are arranged in 3 or more columns.
**Evidence:** At 1280px viewport, the grid renders 3+ cards per row.

### VAL-UI-049: Library page "Add a podcast" CTA is accessible from library
Even when episodes exist, the library page provides a way to add more episodes (e.g., a header button or floating action button).
**Pass condition:** An "Add a podcast" or "+" button is visible and opens the AddEpisodeModal.
**Evidence:** A button triggering the modal is present regardless of episode count.

---

## Watch Page (/watch/[id])

### VAL-UI-060: Watch page renders YouTube player
The watch page embeds a YouTube player (IFrame API) that loads the correct video for the given episode ID.
**Pass condition:** An `<iframe>` element with src containing `youtube.com/embed/<video-id>` is present and visible.
**Evidence:** Query `iframe[src*="youtube.com"]`; src includes the correct video ID from the episode data.

### VAL-UI-061: YouTube player plays video on user interaction
The YouTube player plays the video when the user clicks the play button (either the YouTube native play or a custom overlay).
**Pass condition:** After clicking play, the player state changes to "playing" (YT.PlayerState.PLAYING = 1).
**Evidence:** YouTube IFrame API `getPlayerState()` returns 1 after play action.

### VAL-UI-062: YouTube player controls work — pause
The user can pause the video using standard YouTube controls or a custom pause button.
**Pass condition:** Video transitions from playing to paused state.
**Evidence:** `getPlayerState()` returns 2 (paused) after pause action.

### VAL-UI-063: YouTube player controls work — seek
The user can seek to a different position in the video using the progress bar.
**Pass condition:** After seeking, `getCurrentTime()` reflects the new position (±2 seconds tolerance).
**Evidence:** Compare `getCurrentTime()` before and after seek; values differ.

### VAL-UI-064: YouTube player controls work — volume
The user can adjust volume through the YouTube player volume control.
**Pass condition:** Volume change is reflected in `getVolume()` or mute state in `isMuted()`.
**Evidence:** YouTube API volume methods reflect the change.

### VAL-UI-065: Watch page renders chat panel
The watch page includes a chat panel alongside or below the YouTube player.
**Pass condition:** A chat panel container is present in the DOM with identifiable chat UI elements (message list area, input field).
**Evidence:** A container with chat-related test IDs or class names is visible; contains a message display area and text input.

### VAL-UI-066: Watch page layout — desktop side-by-side
On desktop viewports (≥ 1024px), the YouTube player and chat panel are arranged side by side (player on the left, chat on the right).
**Pass condition:** Player and chat panel are horizontally adjacent; player occupies the larger portion.
**Evidence:** At 1280px viewport, player and chat have different `x` positions; both are visible without scrolling.

### VAL-UI-067: Watch page layout — mobile stacked
On mobile viewports (≤ 640px), the YouTube player and chat panel stack vertically (player on top, chat below).
**Pass condition:** Player and chat are vertically stacked; player is above chat.
**Evidence:** At 375px viewport, player `y` < chat `y`; both elements span full width.

### VAL-UI-068: Watch page layout — player maintains aspect ratio
The YouTube player maintains a 16:9 aspect ratio across all viewport sizes.
**Pass condition:** Player container's width-to-height ratio is approximately 16:9 (±5% tolerance).
**Evidence:** `clientWidth / clientHeight` of the player container ≈ 1.78.

---

## Jump In Button

### VAL-UI-080: Jump In button is visible on watch page
The watch page displays a "Jump In" button that is clearly visible and labeled.
**Pass condition:** A button with text "Jump In" (or equivalent) is rendered and visible on the watch page.
**Evidence:** Query for button with accessible name "Jump In"; element is in viewport.

### VAL-UI-081: Jump In button pauses the YouTube video
Clicking the "Jump In" button pauses the currently playing YouTube video.
**Pass condition:** If video is playing, clicking "Jump In" causes `getPlayerState()` to return 2 (paused).
**Evidence:** Start video playing; click Jump In; verify player state is paused.

### VAL-UI-082: Jump In button opens/activates the chat panel
Clicking the "Jump In" button opens or activates the chat panel (e.g., expands it, focuses the input, or transitions to an interactive chat state).
**Pass condition:** Chat panel becomes active/expanded; the chat text input receives focus or becomes enabled.
**Evidence:** Chat panel has an "active" class/state; input field is focused or enabled.

### VAL-UI-083: Jump In button is disabled or hidden when chat is already active
If the chat panel is already active/open, the Jump In button is either hidden, disabled, or replaced by a "Resume" button.
**Pass condition:** Jump In button is not clickable when chat is already in the active state.
**Evidence:** Button has `disabled` attribute, or is not present in the DOM, or is replaced by Resume button.

### VAL-UI-084: Jump In button pauses then opens chat atomically
The pause and chat-open actions from Jump In happen as a single user-perceived action — no intermediate state where video is paused but chat isn't open.
**Pass condition:** Within the same render cycle or event handler, both pause and chat activation occur.
**Evidence:** After clicking Jump In, both conditions (video paused AND chat active) are true on the next frame.

---

## Resume Button

### VAL-UI-090: Resume button is visible when chat is active
When the chat panel is active (after Jump In), a "Resume" button is visible.
**Pass condition:** A button with text "Resume" (or equivalent) is rendered and visible.
**Evidence:** Query for button with accessible name "Resume"; element is in viewport.

### VAL-UI-091: Resume button closes/deactivates the chat panel
Clicking the "Resume" button closes or deactivates the chat panel.
**Pass condition:** Chat panel returns to its inactive/collapsed state.
**Evidence:** Chat panel loses "active" class/state; chat input is no longer focused.

### VAL-UI-092: Resume button resumes video playback
Clicking the "Resume" button resumes the YouTube video from where it was paused.
**Pass condition:** `getPlayerState()` returns 1 (playing) after clicking Resume; `getCurrentTime()` is ≥ the time when Jump In was clicked.
**Evidence:** Player state is PLAYING; current time is at or near the pause point.

### VAL-UI-093: Resume button closes chat and resumes video atomically
Both actions (close chat, resume video) happen as a single user-perceived action.
**Pass condition:** After clicking Resume, both conditions (chat inactive AND video playing) are true on the next frame.
**Evidence:** Both state changes occur within the same event handler / render cycle.

### VAL-UI-094: Resume button is hidden or disabled when chat is not active
The Resume button is not visible or not interactive when the chat panel is not in its active state.
**Pass condition:** Resume button is absent from DOM or has `disabled` attribute when chat is inactive.
**Evidence:** Query returns null or button has `disabled`.

---

## Chat Panel

### VAL-UI-100: Chat panel displays message list area
The chat panel contains a scrollable area for displaying conversation messages.
**Pass condition:** A container with overflow-y scroll/auto is present; it renders messages when they exist.
**Evidence:** Chat message list container has `overflow-y: auto` or `scroll`; child message elements render.

### VAL-UI-101: Chat panel displays text input field
The chat panel contains a text input or textarea for the user to type messages.
**Pass condition:** An `<input>` or `<textarea>` element is present inside the chat panel.
**Evidence:** Query for input/textarea within the chat container.

### VAL-UI-102: Chat panel displays send button
The chat panel contains a send/submit button for the text input.
**Pass condition:** A button with send icon or "Send" text is present near the text input.
**Evidence:** Query for button inside chat panel with submit-like accessible name or icon.

### VAL-UI-103: Chat panel auto-scrolls to latest message
When a new message appears in the chat, the message list scrolls to show the latest message.
**Pass condition:** After a new message is added, `scrollTop + clientHeight ≈ scrollHeight` for the message container.
**Evidence:** Message list container's scroll position is at the bottom after new message render.

### VAL-UI-104: Chat panel is responsive on mobile
On mobile viewports, the chat panel occupies full width and has an appropriate height that doesn't obscure the video player entirely.
**Pass condition:** At 375px viewport, chat panel width ≈ viewport width; player remains partially visible or is scrollable to.
**Evidence:** Chat panel `clientWidth` ≈ 375px; page is scrollable to reveal player.

---

## Cross-Cutting: Mobile Responsive Behavior

### VAL-UI-110: No horizontal scrollbar on any page at mobile viewport
At 375px viewport width, none of the three pages (/, /library, /watch/[id]) produce a horizontal scrollbar.
**Pass condition:** `document.documentElement.scrollWidth <= window.innerWidth` on all pages.
**Evidence:** Check scroll width vs viewport width on each page.

### VAL-UI-111: Touch targets meet minimum size on mobile
All interactive elements (buttons, links, cards) have a minimum tap target of 44×44px on mobile.
**Pass condition:** All clickable elements have `clientWidth >= 44` and `clientHeight >= 44` (or equivalent padding).
**Evidence:** Audit all interactive elements for minimum dimensions.

### VAL-UI-112: Text remains readable without zooming on mobile
Body text is at least 16px (or 1rem) on mobile viewports to prevent auto-zoom on iOS and ensure readability.
**Pass condition:** Computed `font-size` of body text elements is ≥ 16px at 375px viewport.
**Evidence:** `getComputedStyle` on paragraph/body text elements returns font-size ≥ 16px.

### VAL-UI-113: Navigation is accessible on mobile
Navigation links/menu are accessible on mobile — either always visible or behind a hamburger menu that is reachable.
**Pass condition:** Nav links are visible or a toggle button reveals them; all page destinations are reachable.
**Evidence:** Nav element or hamburger toggle is in viewport; all links are functional.

### VAL-UI-114: Modal is usable on mobile
The AddEpisodeModal is fully visible and usable on mobile viewports without being cut off or requiring horizontal scroll.
**Pass condition:** Modal content fits within 375px width; input and buttons are fully visible and tappable.
**Evidence:** Modal `clientWidth <= 375px`; all interactive elements are in viewport.

---

## YouTube Player Component (YouTubePlayer)

### VAL-UI-120: YouTubePlayer loads IFrame API script
The YouTubePlayer component loads the YouTube IFrame API script (`https://www.youtube.com/iframe_api`) if not already present.
**Pass condition:** A `<script>` tag with src matching the YouTube IFrame API URL is present in the document after the component mounts.
**Evidence:** `document.querySelector('script[src*="youtube.com/iframe_api"]')` is not null.

### VAL-UI-121: YouTubePlayer creates player instance on mount
The component creates a `YT.Player` instance targeting the correct DOM element on mount.
**Pass condition:** An iframe is inserted into the designated container element after the API is ready.
**Evidence:** The container div has a child `<iframe>` after `onYouTubeIframeAPIReady` fires.

### VAL-UI-122: YouTubePlayer cleans up on unmount
When the component unmounts (e.g., navigating away), the YouTube player instance is destroyed to prevent memory leaks.
**Pass condition:** `player.destroy()` is called on unmount; no orphaned iframes remain.
**Evidence:** After navigating away from the watch page, no YouTube iframes persist in the DOM.

---

## Episode Card Component (EpisodeCard)

### VAL-UI-130: EpisodeCard renders as a clickable unit
The entire EpisodeCard is clickable (wrapped in a link or has an onClick handler), not just the title.
**Pass condition:** Clicking anywhere on the card (thumbnail, title, or description area) triggers navigation.
**Evidence:** The card's root element is an `<a>` tag or has a click handler that covers the full card area.

### VAL-UI-131: EpisodeCard thumbnail has loading placeholder
While the thumbnail image is loading, a placeholder (skeleton, blur, or background color) is shown to prevent layout shift.
**Pass condition:** Before image loads, a placeholder is visible; no cumulative layout shift occurs.
**Evidence:** Card maintains consistent dimensions during image load; placeholder element or CSS is present.

### VAL-UI-132: EpisodeCard truncates long titles gracefully
If an episode title exceeds the available space, it is truncated with ellipsis or clamped to a maximum number of lines.
**Pass condition:** Long titles do not break the card layout; text is clamped or truncated.
**Evidence:** CSS `text-overflow: ellipsis` or `-webkit-line-clamp` is applied to the title element.

### VAL-UI-133: EpisodeCard truncates long descriptions gracefully
If an episode description exceeds the available space, it is truncated with ellipsis or clamped.
**Pass condition:** Long descriptions do not expand the card beyond its expected size.
**Evidence:** CSS line-clamp or text-overflow is applied; card height is consistent.

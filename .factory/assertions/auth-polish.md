# Auth & Polish — Behavioral Assertions

### VAL-POLISH-001: Sign up with email/password — happy path
A new visitor navigates to the sign-up page, enters a valid email and a password that meets minimum requirements (≥ 8 characters), and submits the form. A new `User` row is created in the database with the provided email. The user is redirected to the authenticated home/library page and sees their session (e.g., name or email in the header).
Evidence: Check the `User` table for the new record; verify the session cookie is set; confirm redirect URL is the authenticated landing page.

### VAL-POLISH-002: Sign up with email/password — duplicate email
A visitor attempts to sign up with an email that already exists. The form displays a toast or inline error message indicating the email is already registered. No duplicate `User` row is created.
Evidence: Verify the error toast/message text; confirm the `User` table has exactly one row for that email.

### VAL-POLISH-003: Sign up with email/password — validation errors
A visitor submits the sign-up form with an invalid email format or a password shorter than the minimum length. The form shows inline validation errors before any network request is made. The submit button remains enabled after correction.
Evidence: Inspect the DOM for validation error elements; confirm no API call is fired (network tab or mock).

### VAL-POLISH-004: Sign in with email/password — happy path
An existing user enters their correct email and password on the sign-in page. They are authenticated, a session is created, and they are redirected to the authenticated home/library page.
Evidence: Verify NextAuth session cookie; confirm redirect to the library/home page; check the session endpoint returns the user's data.

### VAL-POLISH-005: Sign in with email/password — wrong password
A user enters a valid email but incorrect password. A toast notification appears with a generic error message (e.g., "Invalid credentials") that does not reveal whether the email exists. The user remains on the sign-in page.
Evidence: Verify the toast message text; confirm no session cookie is set; verify the URL remains on the sign-in page.

### VAL-POLISH-006: Sign in with email/password — non-existent email
A visitor attempts to sign in with an email that does not exist. The same generic "Invalid credentials" toast is shown (identical to wrong-password case, to prevent user enumeration). No session is created.
Evidence: Compare error message with VAL-POLISH-005; confirm no session cookie.

### VAL-POLISH-007: Sign in with Google OAuth — happy path
A user clicks "Sign in with Google" on the login page. They are redirected to Google's OAuth consent screen. After granting consent, they are redirected back to TonyPodcast, a session is created, and a `User` row exists (created if first-time, reused if returning). The user lands on the authenticated home/library page.
Evidence: Verify the OAuth redirect flow (302 to Google, callback URL); check `User` table; verify session cookie.

### VAL-POLISH-008: Sign in with Google OAuth — cancelled/denied
A user clicks "Sign in with Google" but cancels or denies consent on Google's page. They are redirected back to the TonyPodcast sign-in page with an appropriate error toast (e.g., "Sign in cancelled"). No session is created.
Evidence: Verify redirect back to sign-in page; confirm error toast is displayed; confirm no session cookie.

### VAL-POLISH-009: Sign out
An authenticated user clicks the sign-out button/link. The session is destroyed, the session cookie is removed, and the user is redirected to the sign-in page. Subsequent attempts to access protected routes redirect to sign-in.
Evidence: Verify session cookie is cleared; confirm redirect to sign-in page; attempt to access a protected route and confirm redirect.

### VAL-POLISH-010: Protected routes redirect unauthenticated users to login
An unauthenticated visitor (no session cookie) attempts to navigate directly to a protected route (e.g., `/library`, `/watch/[id]`, `/profile`). They are redirected to the sign-in page. The originally requested URL is preserved as a `callbackUrl` query parameter so the user can be redirected back after authentication.
Evidence: Navigate to protected URL without session; confirm 302/307 redirect to sign-in page; inspect `callbackUrl` query parameter; sign in and verify redirect to the original URL.

### VAL-POLISH-011: Protected API routes return 401 for unauthenticated requests
An unauthenticated HTTP client sends a request to a protected API route (e.g., `/api/conversations`, `/api/chat`). The server responds with HTTP 401 Unauthorized and a JSON error body. No data is leaked.
Evidence: Send a request without session cookie; verify 401 status code and error JSON; confirm no sensitive data in response body.

### VAL-POLISH-012: Auth state persists across page refreshes
An authenticated user refreshes the browser on any page. The session is preserved — the user remains authenticated, sees their identity in the UI, and can continue using the app without re-authenticating.
Evidence: Sign in, note session cookie, refresh the page; verify the session endpoint still returns user data; confirm the UI shows the authenticated state.

### VAL-POLISH-013: Auth state persists across tabs
An authenticated user opens a new browser tab and navigates to TonyPodcast. The session from the original tab carries over; the user is authenticated in the new tab without signing in again.
Evidence: Open a new tab to a protected route; verify no redirect to sign-in; confirm session data is present.

### VAL-POLISH-014: Toast notification on failed API call
When an API call fails (e.g., network error, server 500), a toast notification appears with a user-friendly error message. The toast auto-dismisses after a reasonable duration (3–5 seconds) or can be manually dismissed.
Evidence: Simulate a failed API call (e.g., mock server error); verify toast appears with readable message; verify auto-dismiss timing or manual dismiss.

### VAL-POLISH-015: Toast notification on invalid YouTube URL
A user submits an invalid or unsupported YouTube URL (e.g., a non-YouTube link, a private video URL, a malformed string). A toast notification appears with a descriptive error (e.g., "Invalid YouTube URL"). The app does not crash or show a blank screen.
Evidence: Submit various invalid URLs; verify toast message for each; confirm the form/page remains usable.

### VAL-POLISH-016: Toast notification on transcript fetch failure
A user submits a valid YouTube URL but the transcript fetch fails (e.g., no captions available, video is private). A toast notification explains the issue (e.g., "Could not fetch transcript for this video"). The user can try another URL.
Evidence: Use a video known to have no captions; verify toast message; confirm the page remains interactive.

### VAL-POLISH-017: Loading skeleton on library page
When the library page is loading data (podcasters, episodes), skeleton placeholders are displayed in place of the content cards/list items. Skeletons match the approximate dimensions of the real content. Once data loads, skeletons are replaced with actual content seamlessly.
Evidence: Throttle the network or add artificial delay; verify skeleton elements are visible; verify they disappear once data arrives.

### VAL-POLISH-018: Loading skeleton on watch/episode page
When the watch page is loading episode data, transcript, and conversation history, skeleton placeholders are shown for the video player area, chat area, and transcript section. Content replaces skeletons once loaded.
Evidence: Throttle the network; verify distinct skeleton areas for player, chat, and transcript; verify smooth transition to real content.

### VAL-POLISH-019: Loading state on sign-in/sign-up form submission
After submitting the sign-in or sign-up form, the submit button shows a loading indicator (spinner or disabled state with loading text) and is disabled to prevent duplicate submissions. The loading state clears when the response arrives (success or failure).
Evidence: Submit the form; verify button is disabled with loading indicator; verify it re-enables on error or navigates on success.

### VAL-POLISH-020: Retry logic for failed LLM chat requests
When an LLM API call fails (e.g., timeout, 5xx error), the system automatically retries up to a configured number of times (e.g., 3) with exponential backoff. If all retries fail, a toast notification informs the user (e.g., "Failed to get a response. Please try again."). A manual "Retry" button is available.
Evidence: Mock LLM API to fail; verify retry attempts in server logs or network tab; verify final error toast; click retry and confirm new attempt.

### VAL-POLISH-021: Retry logic for failed transcript fetch
When the transcript fetch fails due to a transient error (e.g., network timeout), the system retries automatically. If retries are exhausted, the user sees an error message with an option to retry manually.
Evidence: Mock transcript API to fail intermittently; verify retry behavior; verify user-facing error and retry affordance.

### VAL-POLISH-022: Responsive layout — mobile watch page (stacked player + chat)
On viewports ≤ 768px (mobile), the watch page displays the video player stacked above the chat interface (single column layout). Both elements are fully visible without horizontal scrolling. The chat input is accessible and not obscured by the video player.
Evidence: Resize browser to 375px width or use mobile emulation; verify player is above chat in a single column; verify no horizontal scroll; verify chat input is reachable.

### VAL-POLISH-023: Responsive layout — tablet watch page
On viewports between 769px and 1024px (tablet), the watch page either uses a side-by-side layout with reduced sizing or a stacked layout with larger elements. The layout is usable without horizontal scrolling.
Evidence: Resize browser to 768–1024px; verify layout adapts; verify no overflow.

### VAL-POLISH-024: Responsive layout — desktop watch page
On viewports ≥ 1025px (desktop), the watch page displays the video player and chat side by side. Both have adequate space; the chat area is at least 300px wide.
Evidence: View at 1280px+ width; verify side-by-side layout; measure chat area width.

### VAL-POLISH-025: Responsive library page — grid adapts to mobile
On mobile viewports (≤ 768px), the library page displays podcaster/episode cards in a single-column grid. Cards span the full width of the viewport minus padding. No horizontal scrolling occurs.
Evidence: Resize to 375px; verify single-column layout; verify no horizontal overflow.

### VAL-POLISH-026: Responsive library page — grid adapts to tablet
On tablet viewports (769–1024px), the library grid displays 2 columns of cards. Cards are evenly sized with consistent gaps.
Evidence: Resize to ~800px; count columns; verify consistent gap and card sizes.

### VAL-POLISH-027: Responsive library page — grid adapts to desktop
On desktop viewports (≥ 1025px), the library grid displays 3 or more columns. Cards are consistently sized and the layout fills available space proportionally.
Evidence: Resize to 1280px+; count columns; verify layout fills width.

### VAL-POLISH-028: Streaming LLM tokens appear progressively in chat
When a user sends a message in the chat, the assistant's response tokens appear in the chat bubble one-by-one (or in small chunks) as they are streamed from the LLM API. The user does not wait for the entire response before seeing output. A typing indicator or partial text is visible during streaming.
Evidence: Send a chat message; observe the assistant's bubble growing in real time; verify tokens appear incrementally (not all at once); check that the streaming endpoint uses chunked transfer encoding or SSE.

### VAL-POLISH-029: Streaming response maintains scroll position
As LLM tokens stream in, the chat container automatically scrolls to keep the latest content visible. If the user manually scrolls up during streaming, auto-scroll pauses. When the user scrolls back to the bottom, auto-scroll resumes.
Evidence: Send a message and observe auto-scroll during streaming; scroll up mid-stream and verify auto-scroll stops; scroll to bottom and verify it resumes.

### VAL-POLISH-030: Streaming response handles LLM errors gracefully
If the LLM stream encounters an error mid-response (e.g., connection drop), the partial response is preserved in the chat bubble and an error indicator (toast or inline message) informs the user. A "Retry" option is available to re-request the response.
Evidence: Mock a mid-stream error; verify partial text remains visible; verify error indicator and retry affordance.

### VAL-POLISH-031: Lazy loading of episode thumbnail images
Episode thumbnail images on the library page use lazy loading (`loading="lazy"` or Intersection Observer). Images below the fold are not fetched until they scroll into or near the viewport. Above-the-fold images load immediately.
Evidence: Open the library page with many episodes; check the network tab for image requests; verify below-fold images load only on scroll; verify `loading="lazy"` attribute or Intersection Observer in source.

### VAL-POLISH-032: Lazy loading of heavy components
Heavy components (e.g., the YouTube player embed, chat history) are loaded lazily using `next/dynamic` or `React.lazy`. The initial JavaScript bundle does not include these components. A fallback (skeleton or spinner) is shown while the component loads.
Evidence: Check the Network tab for chunked JS loading; verify `next/dynamic` or `React.lazy` usage in source; verify fallback UI during component load.

### VAL-POLISH-033: Next.js Image optimization
All user-visible images (thumbnails, profile pictures, logos) use Next.js `<Image>` component with proper `width`, `height`, and `alt` attributes. Images are served in modern formats (WebP/AVIF) and are responsive.
Evidence: Inspect image elements in the DOM; verify `<Image>` component usage in source; check served image formats in the network tab; verify `alt` attributes are present and descriptive.

### VAL-POLISH-034: Sign-in page is accessible without authentication
The sign-in and sign-up pages are accessible to unauthenticated users. They do not redirect or show a blank screen. The pages render the full form with all interactive elements.
Evidence: Clear all cookies; navigate to sign-in and sign-up pages; verify forms render fully.

### VAL-POLISH-035: Authenticated user redirected away from sign-in page
An already-authenticated user who navigates to the sign-in or sign-up page is redirected to the home/library page. They do not see the sign-in form.
Evidence: Sign in; navigate to `/auth/signin`; verify redirect to the library/home page.

### VAL-POLISH-036: Session provider wraps the application
The NextAuth `SessionProvider` wraps the entire application in the root layout, ensuring `useSession()` works in all client components without errors.
Evidence: Check `layout.tsx` for `SessionProvider`; verify no "useSession must be wrapped in SessionProvider" errors in the console on any page.

### VAL-POLISH-037: CSRF protection on auth endpoints
NextAuth CSRF protection is active. Auth form submissions include a CSRF token. Requests without a valid CSRF token are rejected with an appropriate error.
Evidence: Inspect form hidden fields for CSRF token; attempt a sign-in POST without the token and verify rejection (403 or equivalent).

### VAL-POLISH-038: Password is hashed before storage
User passwords are never stored in plaintext. The database stores only bcrypt (or equivalent) hashed passwords. The hash is not reversible and differs between users with the same password due to salting.
Evidence: Inspect the User table for password field; verify it contains a hash (e.g., `$2b$` prefix for bcrypt); confirm two users with the same password have different hashes.

### VAL-POLISH-039: Auth callback URL is validated
The `callbackUrl` parameter on the sign-in page only allows relative URLs or URLs matching the app's domain. External URLs are rejected to prevent open redirect attacks.
Evidence: Attempt sign-in with `callbackUrl=https://evil.com`; verify the redirect goes to the default authenticated page, not the external URL.

### VAL-POLISH-040: Toast notifications are non-blocking
Toast notifications do not block user interaction. The user can continue clicking, typing, and navigating while a toast is visible. Toasts stack or queue if multiple errors occur simultaneously.
Evidence: Trigger multiple errors rapidly; verify toasts stack visually; verify the underlying page remains interactive during toast display.

### VAL-POLISH-041: Loading skeleton matches final content layout
Skeleton placeholders have the same approximate dimensions, spacing, and position as the content they replace. There is no visible layout shift (CLS) when real content replaces skeletons.
Evidence: Measure skeleton element dimensions vs. real content dimensions; use Lighthouse or CLS measurement tools; verify CLS score < 0.1 for pages with skeletons.

### VAL-POLISH-042: Chat input disabled during streaming
While the LLM is streaming a response, the chat input field and/or send button is disabled (or visually indicates "waiting") to prevent the user from sending overlapping messages.
Evidence: Send a message; attempt to type and send another while streaming is in progress; verify the input is disabled or the send button is non-interactive.

### VAL-POLISH-043: Empty state on library page for new users
A newly authenticated user with no saved podcasters or episodes sees a friendly empty state on the library page (e.g., "No podcasts yet — add your first one!") rather than a blank page or broken grid.
Evidence: Sign up as a new user; navigate to the library page; verify the empty state message and/or call-to-action is displayed.

### VAL-POLISH-044: Network-offline toast notification
When the user loses network connectivity while using the app, a toast or banner informs them that they are offline. When connectivity is restored, the notification is dismissed or replaced with a "Back online" message.
Evidence: Toggle network off in DevTools; verify offline indicator appears; toggle network on; verify recovery indicator.

### VAL-POLISH-045: Form inputs preserve state on failed submission
If a sign-up or sign-in form submission fails (e.g., server error, validation error), the form fields retain the user's input. The user does not have to re-type their email or other fields.
Evidence: Fill in the form with deliberate error; submit; verify fields retain their values after the error toast/message.

### VAL-POLISH-046: Accessible focus management on auth forms
Auth form inputs have visible focus indicators. Pressing Tab cycles through form fields and the submit button in a logical order. Screen readers can identify all form labels and error messages.
Evidence: Tab through the sign-in form; verify visible focus rings; use a screen reader or accessibility audit tool; verify all inputs have associated labels.

### VAL-POLISH-047: Rate limiting on auth endpoints
The sign-in and sign-up API endpoints enforce rate limiting. After a configurable number of failed attempts (e.g., 5 within 1 minute), subsequent requests are temporarily blocked with an appropriate error message (e.g., "Too many attempts. Please try again later.").
Evidence: Send rapid successive failed sign-in requests; verify that after the threshold, a 429 status code or equivalent error is returned; verify the user-facing toast/message.

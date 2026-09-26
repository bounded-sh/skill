# Automatic login completion

This describes SDK source after published client 0.0.104.
Use it after upgrading to a release containing automatic OAuth completion; it is not a claim that 0.0.104 already supports this behavior.
Until that package release, use the [published quickstart](app-auth.md), including its explicit completion call.

With the new SDK, initialization owns the entire return from hosted login:

```ts
import { init, openBoundedWidget, getCurrentUser } from '@bounded-sh/client'

await init({ appId: '<appId>' })
const currentUser = getCurrentUser()

// Call from a sign-in button.
async function signIn() {
  return openBoundedWidget({ methods: ['email', 'google'], wallet: true })
}
```

Await initialization before rendering authentication-dependent UI.
A cancelled or failed OAuth return leaves the SDK ready for another sign-in; read `getLoginReturnError()` to display that failure, or open the standard widget, which shows it.
The optional `completeLoginFromRedirect()` helper still reports the return error to callers that use it.
A fresh sign-in clears the failure.
Configuration and session-restoration failures still reject initialization and must be displayed.
No manual `completeLoginFromRedirect()` call or application-owned `postMessage` handler is required.
Do not copy popup completion code into the app entrypoint.
The widget uses full-page hosted login on mobile and a popup on desktop, with a full-page fallback when opening the popup fails.
Inline email and wallet login retain their existing behavior.

For a custom hosted login button, `loginWithRedirect()` and `loginWithPopup()` remain available.
On web, their default return address is the current origin and path.
A custom `redirectUri` must stay on the initiating app's origin, contain no fragment or OAuth response parameters, and initialize the same app and auth server.
Register the origin for that app before starting login.

Popup returns are correlated to the original window; a disconnected or expired attempt fails with a retry message.
Full-page returns complete in their own tab.
Repeated initialization with equivalent data options shares an in-progress initialization.
Provider instances and callback functions must retain the same references.
Await it before changing the SDK configuration.
Unrelated callbacks are left alone.
PKCE, state checks, app binding, and origin checks remain part of completion.

Existing apps must upgrade and rebuild their frontend bundle to receive the fix.
Remove copied popup relays when upgrading and start a fresh login, because the new SDK uses a new attempt format.
The separate `completeLoginInPopup()` export is removed.
React Native continues to complete hosted login inside `loginWithRedirect()` without a web callback page.

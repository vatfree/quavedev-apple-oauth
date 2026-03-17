# Vatfree Apple OAuth Fork

This is a fork of `quave:apple-oauth` with fixes for Safari's Intelligent Tracking Prevention (ITP).

## Issue Fixed

The original `quave:apple-oauth@4.0.0` package has a bug in the `_isNativeSignInWindow()` function that incorrectly detects all WebKit browsers (including desktop Safari and Chrome) as "native sign-in windows". This forces redirect mode for OAuth, which breaks authentication in Safari due to:

1. **Safari's Intelligent Tracking Prevention (ITP)** blocks third-party cookies
2. **Cookie Blocking Latch Mode** blocks cookies on all redirects once blocked on initial request
3. **sessionStorage restrictions** prevent the OAuth state from being stored

### Symptoms

- Users sign in with Apple on Safari
- They're redirected to Apple's auth page successfully
- After successful authentication, they're redirected back to the login page
- No session is established (appears logged out)
- Works fine in Firefox and other browsers

### The Fix

Modified `apple_client.js` line 137-146 to make `_isNativeSignInWindow()` return `false` for regular web browsers. This ensures:

- Popup mode is used instead of redirect mode
- Safari's cookie blocking latch mode is avoided
- OAuth flow completes successfully

## Changes from upstream

- **File**: `apple_client.js`
- **Function**: `Apple._isNativeSignInWindow()`
- **Change**: Returns `false` for web browsers, only `true` for actual native iOS/Cordova apps
- **Package name**: `vatfree:apple-oauth` (was `quave:apple-oauth`)
- **Version**: `4.0.1` (was `4.0.0`)

## Upstream

Original package: https://github.com/quavedev/apple-oauth

## Related Issues

- https://github.com/quavedev/apple-oauth/issues/28 - "The page refreshes when I try to log in with Apple"
- https://github.com/quavedev/apple-oauth/issues/29 - "Login is successful but user isn't set on connection"

## Safari ITP Documentation

- https://webkit.org/tracking-prevention/
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/

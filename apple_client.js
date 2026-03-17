/* global OAuth */
import Apple from "./namespace.js"
import { Accounts } from "meteor/accounts-base"
import semver from "semver-lite"
import { getAppIdFromOptions, getClientIdFromOptions, getServiceConfiguration, stateParam } from "./utils"

/**
 * Request Apple credentials for the user (boilerplate).
 * Called from accounts-apple.
 *
 * @param {Object}    options                             Optional
 * @param {Function}  credentialRequestCompleteCallback   Callback function to call on completion. Takes one argument, credentialToken on success, or Error on error.
 */
Apple.requestCredential = async function (options, oauthCallback, nativeCallback) {
	const nativeFlow = hasSupportForNativeLogin()

	let credentialRequestCompleteCallback = nativeFlow ? nativeCallback : oauthCallback
	// Support both (options, callback) and (callback).
	if (!credentialRequestCompleteCallback && typeof options === "function") {
		credentialRequestCompleteCallback = options
		options = {}
	} else if (!options) {
		options = {}
	}

	// For web OAuth flow, open popup IMMEDIATELY to prevent Safari AutoFill interception
	// Safari requires window.open() to be called synchronously within the user gesture
	let popupWindow = null
	if (!nativeFlow) {
		try {
			// Open blank popup immediately to maintain user gesture chain
			// This prevents Safari from showing its native "Sign in with Apple" dialog
			const width = 650
			const height = 600
			const screenX = typeof window.screenX !== "undefined" ? window.screenX : window.screenLeft
			const screenY = typeof window.screenY !== "undefined" ? window.screenY : window.screenTop
			const outerWidth = typeof window.outerWidth !== "undefined" ? window.outerWidth : document.body.clientWidth
			const outerHeight =
				typeof window.outerHeight !== "undefined" ? window.outerHeight : document.body.clientHeight - 22
			const left = screenX + (outerWidth - width) / 2
			const top = screenY + (outerHeight - height) / 2
			const features = `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`

			popupWindow = window.open("about:blank", "Login", features)
			if (popupWindow && popupWindow.focus) {
				popupWindow.focus()
			}
		} catch (e) {
			console.error("Failed to open popup window:", e)
		}
	}

	const appId = getAppIdFromOptions(options)
	const config = await getServiceConfiguration({ appId })

	if (!config) {
		if (popupWindow) {
			popupWindow.close()
		}
		credentialRequestCompleteCallback && credentialRequestCompleteCallback(new ServiceConfiguration.ConfigError())
		return
	}
	if (!nativeFlow) {
		const credentialToken = Random.secret()
		const loginStyle = Apple._isNativeSignInWindow() ? "redirect" : OAuth._loginStyle("apple", config, options)
		const scope = options && options.requestPermissions ? options.requestPermissions.join("%20") : "name%20email"

		const redirectUri =
			(options && options.absoluteUrlOptions && options.absoluteUrlOptions.rootUrl) || config.redirectUri
		const redirectUriWithOauth = redirectUri.includes("/_oauth/apple")
			? redirectUri
			: `${redirectUri}${redirectUri.endsWith("/") ? "" : "/"}_oauth/apple`

		const loginUrl =
			"https://appleid.apple.com/auth/authorize" +
			"?response_type=code%20id_token" +
			"&response_mode=form_post" +
			`&redirect_uri=${redirectUriWithOauth}` +
			`&client_id=${getClientIdFromOptions(options, config)}` +
			`&scope=${scope}` +
			`&state=${stateParam({
				loginStyle,
				credentialToken,
				redirectUrl: options && options.redirectUrl,
				shard: options.shard,
				appId: options.appId,
			})}`

		// If we successfully opened a popup, navigate it to the OAuth URL
		if (popupWindow && !popupWindow.closed) {
			popupWindow.location.href = loginUrl

			// Set up popup monitoring
			const checkPopupOpen = setInterval(() => {
				let popupClosed
				try {
					popupClosed = popupWindow.closed || popupWindow.closed === undefined
				} catch (e) {
					return
				}
				if (popupClosed) {
					clearInterval(checkPopupOpen)
					credentialRequestCompleteCallback(credentialToken)
				}
			}, 100)
		} else {
			// Fallback to standard OAuth.launchLogin if popup failed
			OAuth.launchLogin({
				loginService: "apple",
				loginStyle,
				loginUrl,
				credentialRequestCompleteCallback,
				credentialToken,
				popupOptions: {
					height: 600,
				},
			})
		}
		return
	}

	const scope = []
	const requestPermissions = (options && options.requestPermissions) || []
	if (requestPermissions.includes("name")) {
		scope.push(0)
	}
	if (requestPermissions.includes("email")) {
		scope.push(1)
	}

	window.cordova.plugins.SignInWithApple.signin(
		{ requestedScopes: scope },
		function (succ) {
			Accounts.callLoginMethod({
				methodArguments: [{ ...succ, code: succ.authorizationCode, methodName: "native-apple" }],
				userCallback: credentialRequestCompleteCallback,
			})
		},
		function (err) {
			console.error("err", err)
			credentialRequestCompleteCallback(err)
		}
	)
}

function hasSupportForNativeLogin() {
	if (!Meteor.isCordova) return false

	const isiOS = device.platform === "iOS"

	if (!isiOS) return false

	let version = device.version.split(".")

	// Apple doesn't follow semver all the time, so fix it to look like major.minor.patch
	while (version.length < 3) {
		version = version.concat([0])
	}
	return isiOS && semver.gte(version.join("."), "13.0.0")
}

/**
 * Checks if browser uses native sign in window
 *
 * FIXED: The original implementation incorrectly detected all WebKit >= 605 browsers
 * (including desktop Safari and Chrome) as "native sign-in windows", which forced
 * redirect mode and broke OAuth in Safari due to Intelligent Tracking Prevention.
 *
 * This function should only return true for actual iOS/macOS native app contexts
 * (WKWebView in Cordova/Capacitor apps), NOT regular desktop browsers.
 *
 * For standard web browsers, we should use popup mode to avoid Safari's cookie
 * blocking in redirect flows.
 */
Apple._isNativeSignInWindow = function () {
	// If we're in Cordova, the hasSupportForNativeLogin() function handles it
	if (Meteor.isCordova) {
		return false // Let hasSupportForNativeLogin handle Cordova
	}

	// Never use "native sign-in window" behavior for regular web browsers
	// This ensures popup mode is used, which works with Safari's ITP
	return false
}

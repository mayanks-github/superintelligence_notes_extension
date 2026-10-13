const DEFAULT_API_URL = 'http://localhost:3000/api/v1'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SAVE_NOTE') {
    saveNote(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'GOOGLE_SIGN_IN') {
    signInWithGoogle(message.apiUrl)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }

  if (message?.type === 'GET_AUTH') {
    chrome.storage.local.get(['token', 'apiUrl', 'user'], (data) => {
      sendResponse({
        token: data.token || null,
        apiUrl: data.apiUrl || DEFAULT_API_URL,
        user: data.user || null,
      })
    })
    return true
  }

  return false
})

async function signInWithGoogle(apiUrl) {
  const baseUrl = (apiUrl || DEFAULT_API_URL).replace(/\/$/, '')
  const redirectUrl = chrome.identity.getRedirectURL()
  const authUrl = `${baseUrl}/auth/google?return_to=${encodeURIComponent(redirectUrl)}`
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  })

  if (!responseUrl) {
    throw new Error('Google sign-in was cancelled.')
  }

  const redirected = new URL(responseUrl)
  const oauthError = redirected.searchParams.get('error')
  const token = redirected.searchParams.get('token')
  if (oauthError || !token) {
    throw new Error(oauthError || 'Google sign-in failed')
  }

  const meResponse = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const meBody = await meResponse.json().catch(() => ({}))
  if (!meResponse.ok) {
    throw new Error(meBody.error || 'Could not load your Google account')
  }

  await chrome.storage.local.set({
    token,
    user: meBody.user,
    apiUrl: baseUrl,
  })

  return { token, user: meBody.user, apiUrl: baseUrl }
}

async function saveNote(payload) {
  const { token, apiUrl } = await chrome.storage.local.get(['token', 'apiUrl'])
  const baseUrl = apiUrl || DEFAULT_API_URL

  if (!token) {
    throw new Error('Sign in via the Superintelligence Notes extension popup first.')
  }

  const response = await fetch(`${baseUrl}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ note: payload }),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      body.error ||
      (Array.isArray(body.errors) ? body.errors.join(', ') : null) ||
      'Failed to save note'
    throw new Error(message)
  }

  return body
}

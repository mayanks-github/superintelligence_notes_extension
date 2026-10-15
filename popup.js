const DEFAULT_API_URL = 'http://localhost:3000/api/v1'
const DEFAULT_WEB_APP_URL = 'http://localhost:5173'

const loginForm = document.getElementById('login-form')
const signedIn = document.getElementById('signed-in')
const statusEl = document.getElementById('status')
const userLine = document.getElementById('user-line')
const errorEl = document.getElementById('error')
const apiUrlInput = document.getElementById('apiUrl')
const logoutButton = document.getElementById('logout')
const openWebsiteButton = document.getElementById('open-website')
const googleSignInButton = document.getElementById('google-signin')
const googleLabel = googleSignInButton.querySelector('.google-btn-label')

function showError(message) {
  errorEl.textContent = message
  errorEl.classList.remove('hidden')
}

function clearError() {
  errorEl.textContent = ''
  errorEl.classList.add('hidden')
}

function setGoogleButtonState(state) {
  googleSignInButton.classList.remove('is-pressing', 'is-loading')
  if (state) googleSignInButton.classList.add(state)

  if (state === 'is-loading') {
    googleSignInButton.disabled = true
    googleLabel.textContent = 'Connecting…'
  } else {
    googleSignInButton.disabled = false
    googleLabel.textContent = 'Continue with Google'
  }
}

function renderAuth(data) {
  apiUrlInput.value = data.apiUrl || DEFAULT_API_URL

  if (data.token && data.user) {
    loginForm.classList.add('hidden')
    signedIn.classList.remove('hidden')
    statusEl.textContent = 'Ready to save Gemini summaries into your Google Docs.'
    userLine.textContent = `Signed in as ${data.user.name} (${data.user.email})`
  } else {
    loginForm.classList.remove('hidden')
    signedIn.classList.add('hidden')
    statusEl.textContent = 'Sign in with Google to save summaries into your Docs.'
  }
}

async function loadAuth() {
  const data = await chrome.storage.local.get(['token', 'apiUrl', 'user', 'webAppUrl'])
  renderAuth({
    token: data.token,
    apiUrl: data.apiUrl || DEFAULT_API_URL,
    user: data.user,
    webAppUrl: data.webAppUrl || DEFAULT_WEB_APP_URL,
  })
}

googleSignInButton.addEventListener('pointerdown', () => {
  googleSignInButton.classList.add('is-pressing')
})

;['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((type) => {
  googleSignInButton.addEventListener(type, () => {
    if (!googleSignInButton.classList.contains('is-loading')) {
      googleSignInButton.classList.remove('is-pressing')
    }
  })
})

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  clearError()
  setGoogleButtonState('is-loading')

  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, '') || DEFAULT_API_URL
  chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN', apiUrl }, (response) => {
    setGoogleButtonState(null)

    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message)
      return
    }

    if (!response?.ok) {
      showError(response?.error || 'Google sign-in failed')
      return
    }

    renderAuth({ token: response.token, user: response.user, apiUrl })
  })
})

logoutButton.addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'user'])
  clearError()
  renderAuth({ token: null, user: null, apiUrl: apiUrlInput.value || DEFAULT_API_URL })
})

openWebsiteButton.addEventListener('click', () => {
  clearError()
  chrome.runtime.sendMessage({ type: 'OPEN_WEB_APP', webAppUrl: DEFAULT_WEB_APP_URL }, (response) => {
    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message)
      return
    }
    if (!response?.ok) {
      showError(response?.error || 'Could not open the website')
    }
  })
})

loadAuth()

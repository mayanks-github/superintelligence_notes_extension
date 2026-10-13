const DEFAULT_API_URL = 'http://localhost:3000/api/v1'

const loginForm = document.getElementById('login-form')
const signedIn = document.getElementById('signed-in')
const statusEl = document.getElementById('status')
const userLine = document.getElementById('user-line')
const errorEl = document.getElementById('error')
const apiUrlInput = document.getElementById('apiUrl')
const logoutButton = document.getElementById('logout')

function showError(message) {
  errorEl.textContent = message
  errorEl.classList.remove('hidden')
}

function clearError() {
  errorEl.textContent = ''
  errorEl.classList.add('hidden')
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
  const data = await chrome.storage.local.get(['token', 'apiUrl', 'user'])
  renderAuth({
    token: data.token,
    apiUrl: data.apiUrl || DEFAULT_API_URL,
    user: data.user,
  })
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault()
  clearError()

  const apiUrl = apiUrlInput.value.trim().replace(/\/$/, '') || DEFAULT_API_URL
  chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN', apiUrl }, (response) => {
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

loadAuth()

const BUTTON_ID = 'superintelligence-notes-save-btn'
const TOAST_ID = 'superintelligence-notes-toast'

function getVideoId() {
  const url = new URL(window.location.href)
  return url.searchParams.get('v')
}

function getVideoTitle() {
  return (
    document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
    document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() ||
    document.title.replace(/ - YouTube$/, '').trim()
  )
}

function extractGeminiSummary() {
  const selectors = [
    '#panels ytd-engagement-panel-section-list-renderer[target-id*="engagement-panel"]',
    'ytd-engagement-panel-section-list-renderer',
    '[aria-label*="Gemini" i]',
    '[aria-label*="summary" i]',
    '#chat-messages',
    'yt-formatted-string',
  ]

  const candidates = []

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      const text = node.innerText?.trim()
      if (!text || text.length < 80) return
      if (!/summary|key point|takeaway|gemini|chapter|overview/i.test(text) && text.length < 160) {
        return
      }
      candidates.push(text)
    })
  }

  const unique = [...new Set(candidates)].sort((a, b) => b.length - a.length)
  return unique[0] || ''
}

function showToast(message, isError = false) {
  let toast = document.getElementById(TOAST_ID)
  if (!toast) {
    toast = document.createElement('div')
    toast.id = TOAST_ID
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.className = isError ? 'error' : 'ok'
  toast.style.display = 'block'
  window.clearTimeout(showToast._timer)
  showToast._timer = window.setTimeout(() => {
    toast.style.display = 'none'
  }, 3200)
}

async function saveSummary() {
  const videoId = getVideoId()
  if (!videoId) {
    showToast('Open a YouTube watch page first.', true)
    return
  }

  const summaryText = extractGeminiSummary()
  if (!summaryText) {
    showToast('Could not find Gemini summary text. Open the summary panel, then try again.', true)
    return
  }

  const payload = {
    video_id: videoId,
    video_title: getVideoTitle(),
    video_url: `https://www.youtube.com/watch?v=${videoId}`,
    summary_text: summaryText,
    source: 'gemini-youtube',
    captured_at: new Date().toISOString(),
    sections: [],
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_NOTE',
    payload,
  })

  if (!response?.ok) {
    showToast(response?.error || 'Failed to save note.', true)
    return
  }

  showToast('Saved to your Google Docs')
}

function ensureButton() {
  if (!getVideoId()) return
  if (document.getElementById(BUTTON_ID)) return

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.textContent = 'Save to Google Docs'
  button.addEventListener('click', () => {
    saveSummary().catch((error) => showToast(error.message, true))
  })
  document.body.appendChild(button)
}

ensureButton()

const observer = new MutationObserver(() => ensureButton())
observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('yt-navigate-finish', ensureButton)

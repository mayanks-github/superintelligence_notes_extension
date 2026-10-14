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

function cleanCapturedText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function looksLikePageChrome(text) {
  return (
    /Show less|Show transcript|Subscribe|How this was made|Auto-dubbed/i.test(text) &&
    !/key (points|takeaways)|gemini|tl;dr|overview/i.test(text.slice(0, 400))
  )
}

function extractGeminiSummary() {
  const panelSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id*="summary"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="ai"]',
    'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
    '[aria-label*="Gemini" i]',
    '[aria-label*="summary" i]',
    '#panels ytd-engagement-panel-section-list-renderer',
  ]

  const candidates = []

  for (const selector of panelSelectors) {
    document.querySelectorAll(selector).forEach((node) => {
      const text = cleanCapturedText(node.innerText || '')
      if (!text || text.length < 80) return
      if (looksLikePageChrome(text)) return
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

async function saveSummary(button) {
  const videoId = getVideoId()
  if (!videoId) {
    showToast('Open a YouTube watch page first.', true)
    return
  }

  const summaryText = extractGeminiSummary()
  if (!summaryText) {
    showToast('Could not find Gemini summary text. Open the AI/Gemini summary panel, then try again.', true)
    return
  }

  button.disabled = true
  button.textContent = 'Saving…'
  showToast('Saving to Google Docs…')

  try {
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
  } finally {
    button.disabled = false
    button.textContent = 'Save to Google Docs'
  }
}

function ensureButton() {
  if (!getVideoId()) return
  if (document.getElementById(BUTTON_ID)) return

  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.textContent = 'Save to Google Docs'
  button.addEventListener('click', () => {
    saveSummary(button).catch((error) => {
      button.disabled = false
      button.textContent = 'Save to Google Docs'
      showToast(error.message, true)
    })
  })
  document.body.appendChild(button)
}

ensureButton()

const observer = new MutationObserver(() => ensureButton())
observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('yt-navigate-finish', ensureButton)

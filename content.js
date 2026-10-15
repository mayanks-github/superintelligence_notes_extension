const BUTTON_ID = 'superintelligence-notes-save-btn'
const MOUNT_ID = 'superintelligence-notes-save-mount'
const TOAST_ID = 'superintelligence-notes-toast'
const BUTTON_LABEL = 'Save to Google Docs'
const EXTENSION_BUILD = '0.1.6'

const SPARKLE_SVG =
  '<svg class="sin-sparkle" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M12 2.2l1.35 5.4 5.45 1.4-5.45 1.4L12 15.8l-1.35-5.4-5.45-1.4 5.45-1.4L12 2.2zm7.2 11.1l.7 2.8 2.8.7-2.8.7-.7 2.8-.7-2.8-2.8-.7 2.8-.7.7-2.8zM5.4 14.6l.55 2.15 2.15.55-2.15.55L5.4 20l-.55-2.15-2.15-.55 2.15-.55.55-2.15z"/>' +
  '</svg>'

let isSaving = false
let suppressSyncUntil = 0
let lastActivateAt = 0

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

function stripAskChrome(text) {
  return cleanCapturedText(
    text
      .replace(/Ask about this video/gi, ' ')
      .replace(/Ask a question.*/gi, ' ')
      .replace(/Get answers, explore topics,? and more/gi, ' ')
      .replace(/Ask questions/gi, ' ')
      .replace(/Summarize (the )?video/gi, ' ')
      .replace(/Save to Google Docs/gi, ' ')
      .replace(/Saved!/gi, ' ')
      .replace(/Saving…/gi, ' ')
      .replace(/\bSend\b/g, ' ')
      .replace(/\bGemini\b/g, ' ')
  )
}

function looksLikePageChrome(text) {
  const head = text.slice(0, 500)
  const hasWatchChrome =
    /Show less|Show transcript|Subscribe|How this was made|Auto-dubbed/i.test(text)
  const looksLikeSummary =
    /key (points|takeaways)|summary|overview|tl;dr|here('s| is) what|in this video|the video/i.test(
      head
    )
  return hasWatchChrome && !looksLikeSummary
}

function getAskPanel() {
  return (
    document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
    ) ||
    document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id*="youchat" i][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
    )
  )
}

function findPromptTextarea(panel) {
  return (
    panel.querySelector('you-chat-prompt-view-model textarea') ||
    panel.querySelector('textarea[placeholder*="Ask" i]') ||
    panel.querySelector('textarea[aria-label*="Ask" i]') ||
    panel.querySelector('textarea')
  )
}

function queryDeepAll(root, selector) {
  const results = []
  if (!root) return results

  const visit = (node) => {
    if (!node) return
    if (node.querySelectorAll) {
      node.querySelectorAll(selector).forEach((el) => results.push(el))
    }
    const children = node.querySelectorAll ? node.querySelectorAll('*') : []
    children.forEach((el) => {
      if (el.shadowRoot) visit(el.shadowRoot)
    })
  }

  visit(root)
  return results
}

function collectMessageTexts(panel) {
  const selectors = [
    'you-chat-item-view-model',
    'yt-chat-user-turn-view-model',
    '[class*="YouChatItem"]',
    '[class*="chat-item"]',
    'yt-item-section-renderer[data-target-id="youchat_messages_section"] #contents > *',
    '#contents ytd-transcript-segment-renderer',
  ]

  const chunks = []
  for (const selector of selectors) {
    queryDeepAll(panel, selector).forEach((node) => {
      if (node.closest?.('you-chat-prompt-view-model')) return
      if (node.querySelector?.('textarea')) return
      if (node.id === MOUNT_ID || node.id === BUTTON_ID) return
      const text = stripAskChrome(node.innerText || node.textContent || '')
      if (text.length >= 40) chunks.push(text)
    })
  }
  return chunks
}

function extractGeminiSummary() {
  const askPanel = getAskPanel()
  if (askPanel) {
    const messageChunks = collectMessageTexts(askPanel)
    if (messageChunks.length) {
      const combined = cleanCapturedText(messageChunks.join('\n\n'))
      if (combined.length >= 40 && !looksLikePageChrome(combined)) {
        return combined
      }
    }

    // Clone panel text without our chrome so empty Ask panels don't look like answers.
    const clone = askPanel.cloneNode(true)
    clone.querySelector(`#${MOUNT_ID}`)?.remove()
    clone.querySelector(`#${BUTTON_ID}`)?.remove()
    const panelText = stripAskChrome(clone.innerText || '')
    if (panelText.length >= 40 && !looksLikePageChrome(panelText)) {
      return panelText
    }
  }

  const panelSelectors = [
    'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="youchat" i]',
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
      const text = stripAskChrome(node.innerText || '')
      if (!text || text.length < 40) return
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
    document.documentElement.appendChild(toast)
  }
  toast.textContent = message
  toast.className = isError ? 'error' : 'ok'
  toast.style.cssText =
    'position:fixed;right:20px;bottom:24px;z-index:2147483647;display:block;' +
    'max-width:320px;padding:12px 14px;border-radius:12px;' +
    'font:500 13px/1.4 "Google Sans", Roboto, "Segoe UI", sans-serif;' +
    'color:#fff;background:#1a222c;box-shadow:0 10px 30px rgba(0,0,0,.35);' +
    (isError
      ? 'border:1px solid rgba(255,107,129,.55);'
      : 'border:1px solid rgba(61,214,198,.5);')
  window.clearTimeout(showToast._timer)
  showToast._timer = window.setTimeout(() => {
    toast.style.display = 'none'
  }, 5000)
}

function setButtonLabel(button, label) {
  const text = button.querySelector('.sin-label')
  if (text) {
    text.textContent = label
  } else {
    button.textContent = label
  }
}

function setButtonState(button, state) {
  button.classList.remove('is-pressing', 'is-saving', 'is-success', 'is-error')
  if (state) button.classList.add(state)
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome?.runtime?.id) {
        reject(new Error('Extension was reloaded. Refresh this YouTube tab and try again.'))
        return
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(response)
      })
    } catch (error) {
      reject(error)
    }
  })
}

async function saveSummary(button) {
  if (isSaving) return

  // Keep MutationObserver from ripping the button out mid-save.
  suppressSyncUntil = Date.now() + 15000
  isSaving = true

  const videoId = getVideoId()
  if (!videoId) {
    isSaving = false
    showToast('Open a YouTube watch page first.', true)
    return
  }

  const summaryText = extractGeminiSummary()
  console.info('[Superintelligence Notes] captured summary length', summaryText.length)

  if (!summaryText) {
    isSaving = false
    setButtonState(button, 'is-error')
    showToast('No Gemini answer found yet. Ask a question or tap Summarize, then save.', true)
    window.setTimeout(() => setButtonState(button, null), 1200)
    return
  }

  button.disabled = true
  setButtonState(button, 'is-saving')
  setButtonLabel(button, 'Saving…')
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

    const response = await sendRuntimeMessage({
      type: 'SAVE_NOTE',
      payload,
    })

    if (!response?.ok) {
      setButtonState(button, 'is-error')
      showToast(response?.error || 'Failed to save note.', true)
      return
    }

    setButtonState(button, 'is-success')
    setButtonLabel(button, 'Saved!')
    showToast('Saved to your Google Docs')
    console.info('[Superintelligence Notes] save ok', response.result)
  } catch (error) {
    setButtonState(button, 'is-error')
    showToast(error.message || 'Failed to save note.', true)
    console.error('[Superintelligence Notes] save failed', error)
  } finally {
    window.setTimeout(() => {
      isSaving = false
      suppressSyncUntil = Date.now() + 500
      if (button.isConnected) {
        button.disabled = false
        setButtonLabel(button, BUTTON_LABEL)
        setButtonState(button, null)
      }
    }, 1400)
  }
}

function createButton() {
  const button = document.createElement('button')
  button.id = BUTTON_ID
  button.type = 'button'
  button.className = 'sin-gemini-btn'
  button.dataset.sinBuild = EXTENSION_BUILD
  button.setAttribute('aria-label', BUTTON_LABEL)
  button.innerHTML = `${SPARKLE_SVG}<span class="sin-label">${BUTTON_LABEL}</span>`
  button.style.setProperty('color', '#ffffff', 'important')
  button.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important')
  button.style.setProperty('pointer-events', 'auto', 'important')
  button.style.setProperty('cursor', 'pointer', 'important')
  const label = button.querySelector('.sin-label')
  label?.style.setProperty('color', '#ffffff', 'important')
  label?.style.setProperty('-webkit-text-fill-color', '#ffffff', 'important')

  // YouTube's Ask panel often cancels the synthetic "click".
  // Save on pointerup in the capture phase so the action always runs.
  const onActivate = (event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

    const now = Date.now()
    if (now - lastActivateAt < 800) return
    lastActivateAt = now

    setButtonState(button, 'is-pressing')
    void saveSummary(button)
  }

  button.addEventListener('pointerup', onActivate, true)
  button.addEventListener('click', onActivate, true)
  button.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') onActivate(event)
    },
    true
  )

  return button
}

function removeLegacyFloatingButton() {
  const button = document.getElementById(BUTTON_ID)
  if (!button) return
  if (button.parentElement === document.body || !button.classList.contains('sin-gemini-btn')) {
    button.remove()
  }
}

function removeButton() {
  if (isSaving || Date.now() < suppressSyncUntil) return
  document.querySelectorAll('.sin-prompt-inline-host').forEach((el) => {
    el.classList.remove('sin-prompt-inline-host')
  })
  document.getElementById(BUTTON_ID)?.remove()
  document.getElementById(MOUNT_ID)?.remove()
}

function isCompactRow(el) {
  if (!el || el === document.body || el === document.documentElement) return false
  const rect = el.getBoundingClientRect()
  return rect.height >= 28 && rect.height <= 88 && rect.width >= 140
}

function inputRowFor(textarea, panel) {
  let el = textarea.parentElement
  while (el && el !== panel && el !== document.body) {
    if (isCompactRow(el)) return el
    el = el.parentElement
  }
  return textarea.parentElement
}

function ensureMount(panel) {
  const textarea = findPromptTextarea(panel)
  if (!textarea) return null

  const row = inputRowFor(textarea, panel)
  if (!row) return null

  let mount = document.getElementById(MOUNT_ID)
  if (mount && mount.parentElement === row) return mount

  // Keep current mount if YouTube briefly reshuffles while saving.
  if ((isSaving || Date.now() < suppressSyncUntil) && mount && panel.contains(mount)) {
    return mount
  }

  mount?.remove()
  mount = document.createElement('div')
  mount.id = MOUNT_ID
  mount.className = 'sin-save-mount'
  mount.style.setProperty('pointer-events', 'auto', 'important')

  const sendButton =
    row.querySelector('button[aria-label="Send"]') ||
    row.querySelector('button[aria-label*="Send" i]') ||
    panel.querySelector('button[aria-label="Send"]') ||
    panel.querySelector('button[aria-label*="Send" i]')

  row.classList.add('sin-prompt-inline-host')
  if (sendButton && row.contains(sendButton)) {
    sendButton.insertAdjacentElement('beforebegin', mount)
  } else {
    textarea.insertAdjacentElement('afterend', mount)
  }
  return mount
}

function ensureButton() {
  if (isSaving || Date.now() < suppressSyncUntil) return

  removeLegacyFloatingButton()

  if (!getVideoId()) {
    removeButton()
    return
  }

  const panel = getAskPanel()
  if (!panel) {
    removeButton()
    return
  }

  const panelText = panel.innerText || ''
  const askUiReady =
    Boolean(findPromptTextarea(panel)) ||
    /Ask about this video|Ask a question|Ask questions/i.test(panelText)

  if (!askUiReady) {
    removeButton()
    return
  }

  const mount = ensureMount(panel)
  if (!mount) return

  let button = document.getElementById(BUTTON_ID)
  if (!button) {
    button = createButton()
  }

  if (button.parentElement !== mount) {
    mount.appendChild(button)
  }
}

let syncScheduled = false
function scheduleEnsureButton() {
  if (syncScheduled || isSaving || Date.now() < suppressSyncUntil) return
  syncScheduled = true
  requestAnimationFrame(() => {
    syncScheduled = false
    ensureButton()
  })
}

console.info(`[Superintelligence Notes] content script ${EXTENSION_BUILD}`)
removeLegacyFloatingButton()
ensureButton()

const observer = new MutationObserver(scheduleEnsureButton)
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['visibility', 'target-id'],
})

window.addEventListener('yt-navigate-finish', scheduleEnsureButton)

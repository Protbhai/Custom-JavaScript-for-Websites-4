import 'chrome-extension-async'
import {
  findMatchedHosts,
  getHostKey,
  getActiveTab,
  getHosts,
  setLastFocusedWindowId,
  decodeSource
} from 'libs'

const getURL = ({ url }) => new URL(url)

const reloadTab = (tab) => chrome.tabs.reload(tab.id)

const LIB_BASE = 'https://ajax.googleapis.com/ajax/libs'

const isValidURL = (url) => {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const fetchScript = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Fail to fetch ${url}: ${res.status}`)
  }
  return await res.text()
}

const buildJsArray = async (host, customjs) => {
  const { config: { include, extra } = {}, source } = customjs
  const js = [{ file: 'base.js' }]

  if (include) {
    const url = LIB_BASE + include
    try {
      js.push({ code: await fetchScript(url) })
    } catch (e) {
      console.error(e)
    }
  }

  const extras = (extra || '')
    .split(';')
    .map((x) => x.trim())
    .filter(isValidURL)

  for (const url of extras) {
    try {
      js.push({ code: await fetchScript(url) })
    } catch (e) {
      console.error(e)
    }
  }

  let code = decodeSource(source)
  if (typeof host === 'object' && host.isRegex) {
    code = `if (new RegExp(${JSON.stringify(host.pattern)}).test(location.href)) {\n${code}\n}`
  }
  js.push({ code })
  return js
}

const buildMatch = (host) => {
  if (typeof host === 'string') {
    return [`${host}/*`]
  }
  return ['<all_urls>']
}

const registerAllUserScripts = async () => {
  const { hosts = [] } = await chrome.storage.sync.get({ hosts: [] })
  const scripts = []

  for (const host of hosts) {
    const hostKey = getHostKey(host)
    const data = await chrome.storage.sync.get(hostKey)
    const customjs = data[hostKey]
    if (!customjs || !customjs.config?.enable) {
      continue
    }
    const js = await buildJsArray(host, customjs)
    const matches = buildMatch(host)
    scripts.push({ id: hostKey, matches, js, allFrames: true })
  }

  await chrome.userScripts.unregister()
  if (scripts.length > 0) {
    await chrome.userScripts.register(scripts)
  }
}

const methodMap = {
  getData: async (message, { tab, url }, sendResponse) => {
    const { host, protocol } = url
    const hosts = await getHosts()
    const matchedHosts = findMatchedHosts(hosts, url, message)
    if (matchedHosts.length === 0) {
      sendResponse({ host, protocol, tab })
    } else {
      const matchedHost = matchedHosts[0]
      const hostKey = getHostKey(matchedHost)
      const data = await chrome.storage.sync.get(hostKey)
      const customjs = data[hostKey]
      sendResponse({ customjs, host, protocol, tab, matchedHost })
    }
  },
  setData: async (message, _, sendResponse) => {
    const { matchedHost, customjs } = message
    const hostKey = getHostKey(matchedHost)
    try {
      await chrome.storage.sync.set({ [hostKey]: customjs })
      sendResponse()
    } catch (err) {
      sendResponse(err)
    }
  },
  removeData: (message, { url }) => {
    const { isRegex, pattern } = message
    if (isRegex) {
      chrome.storage.sync.remove(pattern)
    } else {
      chrome.storage.sync.remove(url.origin)
    }
  },
  goTo: (message, { tab }) => chrome.tabs.update(tab.id, { url: message.link })
}

const onMessage = async (message, sender, sendResponse) => {
  const { domain } = message
  try {
    const tab = await getActiveTab()
    const url = domain ? getURL({ url: domain }) : getURL(tab)
    const { method, reload } = message

    const func = methodMap[method]
    if (func && typeof func === 'function') {
      func(message, { tab, url }, sendResponse)
    } else {
      console.error(`Unknown method: ${method}`)
      sendResponse({ source: '', config: {} })
    }

    if (reload) {
      reloadTab(tab)
    }
  } catch (e) {
    sendResponse({ error: e.message })
  }
}

const onFocusChanged = (windowId) => {
  if (windowId < 0) {
    return
  }
  setLastFocusedWindowId(windowId)
}

chrome.runtime.onMessage.addListener((...args) => {
  onMessage(...args)
  return true
})

chrome.windows.onFocusChanged.addListener(onFocusChanged)
chrome.runtime.onInstalled.addListener((details) => {
  registerAllUserScripts()
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    if (tabs.length <= 0) {
      return
    }
    const { windowId } = tabs[0]
    setLastFocusedWindowId(windowId)
  })
})

chrome.runtime.onStartup.addListener(registerAllUserScripts)

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'sync') {
    registerAllUserScripts()
  }
})

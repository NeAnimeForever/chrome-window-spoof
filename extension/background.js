const SCRIPT_ID = "cws-js-spoof";
const DEFAULTS = {
  mode: "off",
  defaultMode: "off",
  autoApplyNewTabs: true,
  reloadOnModeChange: true,
  restoreOnStartup: true,
  showBadge: true,
  nativeAutoReapply: true
};

let stateCache;
let nativeTabIds = new Set();
let nativeReady = Promise.resolve();
let nativeSaveQueue = Promise.resolve();

const PAGE_SCHEMES = /^(https?|file):/i;
const BLOCKED_SCHEMES = /^(chrome|edge|about|devtools|chrome-extension|view-source|brave):/i;

async function getSettings() {
  if (!stateCache) {
    const stored = await chrome.storage.local.get(DEFAULTS);
    stateCache = { ...DEFAULTS, ...stored };
  }
  return stateCache;
}

async function saveSettings(patch) {
  stateCache = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set(patch);
  return stateCache;
}

async function loadNativeTabs() {
  const { nativeTabIds: stored = [] } = await chrome.storage.session.get({ nativeTabIds: [] });
  nativeTabIds = new Set(stored.filter(Number.isInteger));
}

function saveNativeTabs() {
  const snapshot = [...nativeTabIds];
  nativeSaveQueue = nativeSaveQueue.then(() => chrome.storage.session.set({ nativeTabIds: snapshot })).catch(() => {});
  return nativeSaveQueue;
}

async function jsRegistered() {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  return scripts.some(s => s.id === SCRIPT_ID);
}

async function ensureJsScript(enabled) {
  const exists = await jsRegistered();
  if (enabled && !exists) {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: ["<all_urls>"],
      excludeMatches: ["*://chrome.google.com/*"],
      js: ["js-spoof.js"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true
    }]);
  } else if (!enabled && exists) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
}

function supportedTab(tab) {
  if (!tab?.id || !PAGE_SCHEMES.test(tab.url || "")) return false;
  return !BLOCKED_SCHEMES.test(tab.url || "");
}

async function attachNative(tabId) {
  const target = { tabId };
  try {
    await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: true });
    nativeTabIds.add(tabId);
    await saveNativeTabs();
    return { ok: true };
  } catch {
    // 
  }

  try {
    await chrome.debugger.attach(target, "1.3");
    await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: true });
    nativeTabIds.add(tabId);
    await saveNativeTabs();
    return { ok: true };
  } catch (error) {
    nativeTabIds.delete(tabId);
    await saveNativeTabs();
    return { ok: false, error: String(error?.message || error) };
  }
}

async function detachNative(tabId) {
  const target = { tabId };
  try { await chrome.debugger.sendCommand(target, "Emulation.setFocusEmulationEnabled", { enabled: false }); } catch {}
  try { await chrome.debugger.detach(target); } catch {}
  nativeTabIds.delete(tabId);
  await saveNativeTabs();
}

async function getTabs() { return chrome.tabs.query({}); }

async function reloadSupported(tabs) {
  await Promise.all(tabs.filter(supportedTab).map(tab => chrome.tabs.reload(tab.id).catch(() => {})));
}

async function applyMode(mode, options = {}) {
  await nativeReady;
  if (!new Set(["off", "js", "native"]).has(mode)) throw new Error("Unknown mode");

  const settings = await getSettings();
  const previous = settings.mode;
  await saveSettings({ mode });
  const tabs = await getTabs();

  if (mode === "js") {
    await ensureJsScript(true);
    await Promise.all(tabs.filter(supportedTab).map(tab => detachNative(tab.id)));
  } else if (mode === "native") {
    await ensureJsScript(false);
    const results = await Promise.all(tabs.filter(supportedTab).map(tab => attachNative(tab.id)));
    const failed = results.find(r => !r.ok);
    if (failed) throw new Error(failed.error || "Failed to attach Native Blink");
  } else {
    await ensureJsScript(false);
    await Promise.all([...nativeTabIds].map(tabId => detachNative(tabId)));
  }

  const reload = options.reload ?? settings.reloadOnModeChange;
  if (reload && previous !== mode) await reloadSupported(tabs);
  await updateBadge();
  return getStatus();
}

async function getStatus() {
  await nativeReady;
  const settings = await getSettings();
  const targets = await chrome.debugger.getTargets().catch(() => []);
  const attached = new Set(targets.filter(t => t.attached && t.tabId != null).map(t => t.tabId));
  const cleaned = [...nativeTabIds].filter(id => attached.has(id));
  if (cleaned.length !== nativeTabIds.size) {
    nativeTabIds = new Set(cleaned);
    await saveNativeTabs();
  }
  return {
    ...settings,
    jsRegistered: await jsRegistered(),
    nativeTabCount: nativeTabIds.size,
    nativeTabs: [...nativeTabIds]
  };
}

async function updateBadge() {
  const { mode, showBadge } = await getSettings();
  if (!showBadge) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  await chrome.action.setBadgeText({ text: mode === "js" ? "JS" : mode === "native" ? "N" : "" });
  await chrome.action.setTitle({ title: `Chrome Window Spoof — ${mode.toUpperCase()}` });
}

async function applyStartup() {
  await nativeReady;
  const settings = await getSettings();
  if (!settings.restoreOnStartup) {
    await saveSettings({ mode: "off" });
    await ensureJsScript(false);
    await Promise.all([...nativeTabIds].map(tabId => detachNative(tabId)));
    await updateBadge();
    return;
  }
  await applyMode(settings.defaultMode, { reload: false });
}

chrome.runtime.onInstalled.addListener(() => applyStartup().catch(() => {}));
chrome.runtime.onStartup.addListener(() => applyStartup().catch(() => {}));

chrome.tabs.onRemoved.addListener(tabId => {
  if (nativeTabIds.delete(tabId)) saveNativeTabs().catch(() => {});
});

chrome.debugger.onDetach.addListener(source => {
  if (source?.tabId != null && nativeTabIds.delete(source.tabId)) saveNativeTabs().catch(() => {});
});

chrome.tabs.onCreated.addListener(async tab => {
  const settings = await getSettings();
  if (!settings.autoApplyNewTabs || !supportedTab(tab)) return;
  if (settings.mode === "native") setTimeout(() => attachNative(tab.id).catch(() => {}), 300);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !supportedTab(tab)) return;
  const settings = await getSettings();
  if (settings.mode === "native" && settings.nativeAutoReapply && nativeTabIds.has(tabId)) await attachNative(tabId).catch(() => {});
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  stateCache = null;
  if (changes.showBadge || changes.mode) await updateBadge();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "get-state") return sendResponse({ ok: true, ...(await getStatus()) });
      if (message?.type === "set-mode") return sendResponse({ ok: true, ...(await applyMode(message.mode, { reload: message.reload })) });
      if (message?.type === "set-setting") return sendResponse({ ok: true, ...(await saveSettings({ [message.key]: message.value })) });
      if (message?.type === "reset-settings") {
        await applyMode("off", { reload: true });
        await chrome.storage.local.clear();
        stateCache = { ...DEFAULTS };
        await chrome.storage.local.set(DEFAULTS);
        return sendResponse({ ok: true, ...(await getStatus()) });
      }
      if (message?.type === "reapply") {
        const settings = await getSettings();
        if (settings.mode === "native") {
          const results = await Promise.all((await getTabs()).filter(supportedTab).map(tab => attachNative(tab.id)));
          const failed = results.find(r => !r.ok);
          if (failed) throw new Error(failed.error || "Failed to re-apply Native Blink");
        } else if (settings.mode === "js") {
          await ensureJsScript(true);
        }
        await updateBadge();
        return sendResponse({ ok: true, ...(await getStatus()) });
      }
      if (message?.type === "emergency-off") return sendResponse({ ok: true, ...(await applyMode("off", { reload: true })) });
      sendResponse({ ok: false, error: "Unknown message" });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});

nativeReady = loadNativeTabs().catch(() => {});

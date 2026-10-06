const $ = id => document.getElementById(id);
let state;

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function localize() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

async function msg(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

async function refresh() {
  const [nextState, tab] = await Promise.all([msg("get-state"), activeTab()]);
  if (!nextState?.ok) return toast(t("failedReadState"));
  state = nextState;
  $("tabTitle").textContent = tab?.title || t("noActiveTab");
  $("tabUrl").textContent = tab?.url || "";
  $("modePill").textContent = state.mode.toUpperCase();
  document.querySelectorAll(".mode").forEach(button => button.classList.toggle("active", button.dataset.mode === state.mode));
  $("attached").textContent = `${state.nativeTabCount} ${t("nativeTabs")}`;
  $("nativeNotice").style.display = state.mode === "native" ? "block" : "none";
  $("dot").className = `dot ${state.mode === "off" ? "" : "on"}`;
  $("statusText").textContent = state.mode === "off"
    ? t("normalFocusBehavior")
    : state.mode === "js"
      ? t("jsRegisteredStatus")
      : t("nativeAttachedStatus", [String(state.nativeTabCount)]);
}

async function setMode(mode) {
  if (!state) return;
  if (mode === state.mode) return;
  if (mode === "native" && !confirm(t("nativeConfirm"))) return;
  const buttons = [...document.querySelectorAll(".mode")];
  buttons.forEach(b => b.disabled = true);
  try {
    const result = await msg("set-mode", { mode, reload: state.reloadOnModeChange });
    if (!result?.ok) { toast(result?.error || t("failedChangeMode")); return; }
    toast(t("modeChanged", [mode.toUpperCase()]));
    await refresh();
  } finally { buttons.forEach(b => b.disabled = false); }
}

document.querySelectorAll(".mode").forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
$("reapply").addEventListener("click", async () => { const r = await msg("reapply"); toast(r?.ok ? t("modeReapplied") : (r?.error || t("failedReapply"))); await refresh(); });
$("offNow").addEventListener("click", async () => { const r = await msg("emergency-off"); toast(r?.ok ? t("disabled") : (r?.error || t("failed"))); await refresh(); });
$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

localize();
refresh();

const $ = id => document.getElementById(id);
let state;

const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions) || key;

function localize() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
}

async function msg(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function render() {
  if (!state?.ok) return;
  $("startupMode").value = state.defaultMode || "off";
  $("autoApplyNewTabs").checked = !!state.autoApplyNewTabs;
  $("reloadOnModeChange").checked = !!state.reloadOnModeChange;
  $("restoreOnStartup").checked = !!state.restoreOnStartup;
  $("showBadge").checked = !!state.showBadge;
  $("nativeAutoReapply").checked = !!state.nativeAutoReapply;
  $("dMode").textContent = state.mode.toUpperCase();
  $("dDefault").textContent = (state.defaultMode || "off").toUpperCase();
  $("dJs").textContent = state.jsRegistered ? "YES" : "NO";
  $("dNative").textContent = String(state.nativeTabCount);
}

async function load() {
  const result = await msg("get-state");
  if (!result?.ok) return toast(t("failedReadState"));
  state = result;
  render();
}

async function save(key, value) {
  const result = await msg("set-setting", { key, value });
  if (!result?.ok) toast(result?.error || t("failedSave"));
  await load();
}

$("startupMode").addEventListener("change", e => save("defaultMode", e.target.value));
$("autoApplyNewTabs").addEventListener("change", e => save("autoApplyNewTabs", e.target.checked));
$("reloadOnModeChange").addEventListener("change", e => save("reloadOnModeChange", e.target.checked));
$("restoreOnStartup").addEventListener("change", e => save("restoreOnStartup", e.target.checked));
$("showBadge").addEventListener("change", e => save("showBadge", e.target.checked));
$("nativeAutoReapply").addEventListener("change", e => save("nativeAutoReapply", e.target.checked));

$("disable").addEventListener("click", async () => { const r = await msg("emergency-off"); toast(r?.ok ? t("disabled") : (r?.error || t("failed"))); await load(); });
$("refresh").addEventListener("click", load);
$("reapply").addEventListener("click", async () => { const r = await msg("reapply"); toast(r?.ok ? t("modeReapplied") : (r?.error || t("failedReapply"))); await load(); });
$("reset").addEventListener("click", async () => { if (!confirm(t("confirmReset"))) return; const r = await msg("reset-settings"); toast(r?.ok ? t("disabled") : (r?.error || t("failed"))); await load(); });

localize();
load();

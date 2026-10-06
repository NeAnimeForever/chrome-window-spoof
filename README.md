# Chrome Window Spoof

Chrome extension for experimenting with focused-page behavior. It has three mutually exclusive modes:

- **Off** — no focus spoofing, no registered JS compatibility script, no debugger attachment.
- **JS Compatibility** — page-level JavaScript compatibility spoof. It is registered only while JS mode is active.
- **Native Blink** — uses Chrome DevTools Protocol through `chrome.debugger` and `Emulation.setFocusEmulationEnabled`.

## Installation (unpacked)

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `extension/` directory.
4. The extension has broad host access because JS mode must register a document-start main-world script on supported pages.

## Mode switching

Mode changes are global for supported tabs. Reload-on-change is enabled by default because unregistering a dynamic content script does not remove code already injected into a loaded document.

Native Blink requires the `debugger` permission. Chrome may display a debugger warning while a tab is attached. Chrome internal pages, extension pages, DevTools and unsupported schemes are excluded from automatic attachment.

## License

MIT. See [LICENSE](LICENSE).

Made by NeAnimeForever.

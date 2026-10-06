# Privacy

Chrome Window Spoof does not send browsing data to a remote server and contains no telemetry or analytics code.

Extension settings are stored with Chrome's local extension storage. Native Blink mode uses the `chrome.debugger` API only to attach to supported tabs and send `Emulation.setFocusEmulationEnabled` commands.

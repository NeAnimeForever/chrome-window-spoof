(() => {
    const nativeHasFocus = Document.prototype.hasFocus;
    const nativeToString = Function.prototype.toString;
    const spoofedFunctions = new WeakMap();
    const BLOCKED_EVENTS = new Set(["blur", "focus", "visibilitychange"]);

    const nativeSource = (name) => `function ${name}() { [native code] }`;

    function makeProxy(target, name, apply) {
        const proxy = new Proxy(target, { apply });
        spoofedFunctions.set(proxy, nativeSource(name));
        return proxy;
    }

    function patchToString() {
        const original = Function.prototype.toString;
        if (spoofedFunctions.has(original)) return;

        const wrapped = makeProxy(original, "toString", (fn, thisArg, args) => {
            if (args?.length) {
                const spoofed = spoofedFunctions.get(args[0]);
                if (spoofed) return spoofed;
            }
            return Reflect.apply(fn, thisArg, args);
        });

        try {
            Object.defineProperty(Function.prototype, "toString", {
                value: wrapped,
                writable: true,
                enumerable: false,
                configurable: true
            });
        } catch {}
    }

    function patchHasFocus() {
        if (window.top !== window) return;
        const replacement = makeProxy(nativeHasFocus, "hasFocus", () => true);
        try {
            Object.defineProperty(Document.prototype, "hasFocus", {
                value: replacement,
                writable: true,
                enumerable: true,
                configurable: true
            });
        } catch {}
    }

    function suppressFocusEvents() {
        const stop = event => {
            if (BLOCKED_EVENTS.has(event.type)) event.stopImmediatePropagation();
        };
        try {
            window.addEventListener("blur", stop, true);
            window.addEventListener("focus", stop, true);
            document.addEventListener("visibilitychange", stop, true);
        } catch {}
    }

    patchHasFocus();
    patchToString();
    suppressFocusEvents();
})();

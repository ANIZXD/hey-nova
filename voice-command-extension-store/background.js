// Hey Nova (owl) - background service worker.
// Keeps an always-on offscreen audio listener running so the wake word
// is heard even while the user is focused on another tab. When "Nova"
// is heard, it brings the voice page into focus for the full command.

const OFFSCREEN_URL = "offscreen/offscreen.html";

// UI feedback for the popup (hearts the icon when listening for wake).
let wakeEnabled = true;

async function ensureOffscreen() {
    const has = await chrome.offscreen.hasDocument().catch(() => false);
    if (has) {
        return;
    }
    try {
        await chrome.offscreen.createDocument({
            url: OFFSCREEN_URL,
            reasons: ["USER_MEDIA"],
            justification:
                "Always-on microphone wake-word detection so Hey Nova " +
                "hears 'Nova' even while you use other tabs."
        });
    } catch (e) {
        console.log("[Nova bg] offscreen create failed: " + e.message);
    }
}

// Bring the voice page into focus and ask it to listen.
async function handleWake() {
    const url = chrome.runtime.getURL("voice/voice.html");
    const tabs = await chrome.tabs.query({}).catch(() => []);
    let voice = (tabs || []).find(
        (t) => t.url && t.url.startsWith(url)
    );

    if (!voice) {
        voice = await chrome.tabs.create({ url, active: true }).catch(() => null);
    } else {
        await chrome.tabs.update(voice.id, { active: true }).catch(() => {});
    }

    // Broadcast to all extension pages (incl. the voice page, which is
    // not a content script) so it starts listening immediately.
    try {
        chrome.runtime.sendMessage({ type: "nova-wake-now" });
    } catch (e) {
        console.log("[Nova bg] broadcast failed: " + e.message);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    ensureOffscreen();
});
chrome.runtime.onStartup.addListener(() => {
    ensureOffscreen();
});

// Wake-word / control messages come from the offscreen document.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) {
        return;
    }
    if (msg.type === "nova-wake" && wakeEnabled) {
        handleWake();
        sendResponse && sendResponse({ ok: true });
        return;
    }
    if (msg.type === "offscreen-ready") {
        // Offscreen doc is up. Nothing else needed;
        // it already posts nova-wake on its own.
        sendResponse && sendResponse({ ok: true });
        return;
    }
    if (msg.type === "nova-wake-disable") {
        wakeEnabled = false;
        sendResponse && sendResponse({ ok: true });
        return;
    }
    if (msg.type === "nova-wake-enable") {
        wakeEnabled = true;
        ensureOffscreen();
        sendResponse && sendResponse({ ok: true });
        return;
    }
});

// If the popup is opened, make sure the wake listener is alive.
chrome.action.onClicked.addListener(() => {
    ensureOffscreen();
});

// Recreate offscreen if it goes away (e.g. the browser drops it).
setInterval(() => {
    if (wakeEnabled) {
        ensureOffscreen();
    }
}, 60000);

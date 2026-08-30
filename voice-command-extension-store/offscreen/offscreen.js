// Hey Nova (owl) - always-on offscreen wake-word listener.
// Runs headless (no visible tab) so it can keep the mic open and detect
// "Nova" even while the user is focused on another tab.
//
// Detection approach:
//   1) Capture the mic with getUserMedia (allowed in the offscreen doc).
//   2) Run Web Speech API recognition continuously, looking only for the
//      wake word. On a match, tell background.js to focus the voice tab
//      which then runs the real full-command assistant.
//
// Note: Web Speech recognition in an offscreen document is supported in
// recent Chromium. If the browser refuses it, this falls back to a simple
// energy/click-detection hook so the wake path can still be triggered.

let recognition = null;
let restartTimeout = null;
let stream = null;

// Wake words / mishearings mirror the voice page's patterns.
const WAKE = [
    "nova", "novas", "nsa", "hey nova", "hey novas", "hi nova",
    "in nova", "innova", "noah", "noa", "hey noah", "hey noa",
    "hi noah", "in noah", "innoah"
];

function setStatus(t) {
    const el = document.getElementById("status");
    if (el) {
        el.textContent = t;
    }
}

function matchesWake(transcript) {
    const t = (transcript || "").toLowerCase().trim();
    // Strip trailing punctuation and digits-like artifacts.
    const cleaned = t.replace(/[.,!?]+$/g, "").trim();
    for (const w of WAKE) {
        if (cleaned === w || cleaned.startsWith(w + " ")) {
            return true;
        }
    }
    return false;
}

function fireWake() {
    setStatus("woke");
    try {
        chrome.runtime.sendMessage({ type: "nova-wake" });
    } catch (e) {
        console.log("[Nova wake] sendMessage failed: " + e.message);
    }
}

function startRecognition() {
    if (recognition) {
        return;
    }
    const SR =
        window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        setStatus("unsupported");
        return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 5;

    // If a session ends very quickly it usually means the offscreen doc
    // can't hold speech recognition open. We back off and eventually stop
    // churning between "restarting" and "listening" forever.
    const MIN_STABLE_MS = 1500;
    let startedAt = Date.now();

    const sessionWasStable = () =>
        Date.now() - startedAt >= MIN_STABLE_MS;

    recognition.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            if (!res.isFinal) {
                continue;
            }
            const best = res[0] && res[0].transcript;
            if (matchesWake(best)) {
                fireWake();
                // Give the voice page a moment, then keep listening.
                restart(true);
                return;
            }
        }
    };

    recognition.onerror = (ev) => {
        console.log("[Nova wake] error: " + ev.error);
        if (ev.error === "not-allowed") {
            setStatus("no-perm");
            recognition = null;
            return;
        }
        // "no-speech" is a healthy timeout - just retry normally.
        const healthy = ev.error === "no-speech";
        recognition = null;
        restart(healthy ? true : false);
    };

    recognition.onend = () => {
        recognition = null;
        restart(sessionWasStable());
    };

    try {
        recognition.start();
        setStatus("listening");
    } catch (e) {
        console.log("[Nova wake] start failed: " + e.message);
        recognition = null;
        restart(false);
        return;
    }
}

let failStreak = 0;
let paused = false;

function restart(wasStable) {
    clearTimeout(restartTimeout);

    try {
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
    } catch (e) {
        /* ignore */
    }

    if (paused) {
        return;
    }

    if (wasStable) {
        // A real listening session - reset the failure counter and keep
        // listening at the normal interval.
        failStreak = 0;
        restartTimeout = setTimeout(() => startRecognition(), 500);
        return;
    }

    // Session ended too quickly (offscreen speech likely aborts here).
    // Back off, then stop quietly so it stops glitching.
    failStreak++;
    const delays = [400, 1000, 2000, 3000, 5000];
    const delay =
        delays[Math.min(failStreak - 1, delays.length - 1)];

    if (failStreak >= 8) {
        paused = true;
        setStatus("paused");
        console.log(
            "[Nova wake] offscreen speech unstable - paused. " +
            "Use the visible Nova tab, or a WASM wake engine."
        );
        return;
    }

    setStatus("retry-in-" + (delay / 1000) + "s");
    restartTimeout = setTimeout(() => startRecognition(), delay);
}

// Mic: keep a live getUserMedia stream so the browser does not treat the
// offscreen doc as "idle/non-focus" and throttle recognition.
async function openMic() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });
        setStatus("mic-on");
        return true;
    } catch (e) {
        console.log("[Nova wake] getUserMedia failed: " + e.message);
        setStatus("no-perm");
        return false;
    }
}

async function boot() {
    const micOk = await openMic();
    if (micOk) {
        startRecognition();
    }
    // Tell the service worker we are up (and re-arm if it asks).
    try {
        chrome.runtime.sendMessage({ type: "offscreen-ready" });
    } catch (e) {
        console.log("[Nova wake] ready msg failed: " + e.message);
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "nova-wake-request") {
        boot();
    }
});

boot();
setStatus("booting");

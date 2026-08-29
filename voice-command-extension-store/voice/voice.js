const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

const status = document.getElementById("status");
const text = document.getElementById("text");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");

// Wake word - just say "Nova" (or "Noah") at the start of the
// command. Also still accepts "hey nova", "innova", "in nova",
// "hey noah", etc. so common mishearings keep working.
const WAKE_PATTERNS = [
    /^nova\b/i,
    /^novas\b/i,
    /^nsa\b/i,
    /^hey\s*nova\b/i,
    /^hey\s*novas\b/i,
    /^hi\s*nova\b/i,
    /^in\s*nova\b/i,
    /^innova\b/i,
    /^ay\s*nova\b/i,
    /^a\s*nova\b/i,
    /^eh\s*nova\b/i,

    // Noah (common mishearing of Nova)
    /^noah\b/i,
    /^noa\b/i,
    /^hey\s*noah\b/i,
    /^hey\s*noa\b/i,
    /^hi\s*noah\b/i,
    /^in\s*noah\b/i,
    /^innoah\b/i,
    /^eh\s*noah\b/i
];

// Follow-up ("chain") mode window: for SESSION_MS after a
// wake-word command, bare commands work WITHOUT repeating the
// wake word ("next", "mute bairan", "pause", ...).
const SESSION_MS = 15000;

// Only commands starting with these are accepted during follow-up
// mode, so idle chit-chat (or Nova's own voice) never triggers an
// action. Covers every action the resolver understands.
const SESSION_STARTERS = [
    /^next\b/i, /^previous\b/i, /^prev\b/i, /^skip\b/i,
    /^pause\b/i, /^play\b/i, /^resume\b/i, /^stop\b/i,
    /^mute\b/i, /^unmute\b/i, /^volume\b/i, /^louder\b/i, /^quieter\b/i,
    /^turn\b/i, /^scroll\b/i, /^reload\b/i, /^refresh\b/i,
    /^close\b/i, /^open\b/i, /^go\b/i, /^search\b/i, /^look\s+up\b/i,
    /^find\b/i, /^watch\b/i, /^new\s+tab\b/i, /^back\b/i
];

let assistantRunning = false;
let recognitionRunning = false;
let restartTimer = null;
let lastGreetTime = 0;
let lastSpokenText = "";
let cancelled = false;
let sessionEndAt = 0;

const recognition = new SpeechRecognition();

recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = "en-US";
recognition.maxAlternatives = 5;


// ======================================
// START BUTTON
// ======================================

startBtn.addEventListener("click", () => {

    if (assistantRunning) {
        return;
    }

    assistantRunning = true;
    cancelled = false;

    status.textContent =
        "🟢 Listening for Hey Nova...";

    startRecognition();
});


// ======================================
// STOP BUTTON
// ======================================

stopBtn.addEventListener("click", () => {

    stopAssistant();

});


// ======================================
// START RECOGNITION
// ======================================

function startRecognition() {

    if (!assistantRunning) {
        return;
    }

    if (recognitionRunning) {
        return;
    }

    try {

        recognition.start();

        recognitionRunning = true;

        status.textContent =
            "🟢 Listening for Hey Nova...";

        console.log("🎙️ Recognition started");

    } catch (error) {

        console.log(
            "Recognition start:",
            error
        );

        recognitionRunning = false;
    }
}


// ======================================
// AUTO-RESTART
// ======================================

// Chrome's speech engine drops the mic on its own
// (after ~30-60s, when the tab is backgrounded, or on
// silent/aborted events). This reconnects it quickly
// so the assistant keeps hearing you in other tabs.

function scheduleRestart() {

    if (!assistantRunning) {
        return;
    }

    clearTimeout(restartTimer);

    restartTimer = setTimeout(() => {

        if (assistantRunning) {

            // Clear any leftover speech so the mic is ready.
            try {
                speechSynthesis.cancel();
            } catch (e) {
                console.log(e);
            }

            startRecognition();
        }

    }, 120);
}


// ======================================
// SPEECH RESULT
// ======================================

recognition.onresult = (event) => {

    let spokenText = "";
    let hasFinal = false;

    for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
    ) {

        // Pick the LONGEST candidate transcription - the mic
        // sometimes drops the wake word, so using the most
        // complete alternative helps catch "nova open amazon"
        // instead of just "open amazon".
        const candidates = event.results[i];

        let best = "";

        for (const alt of candidates) {
            if (alt.transcript.length > best.length) {
                best = alt.transcript;
            }
        }

        spokenText += best + " ";

        if (candidates.isFinal) {
            hasFinal = true;
        }
    }


    spokenText =
        spokenText
            .toLowerCase()
            .trim();


    // ECHO SUPPRESSION: the mic often picks up Nova's own voice
    // and hears her last reply as a brand-new user command. So
    // if the recognized words are really just her last reply
    // (significant word overlap) WITHOUT a wake word, ignore it
    // completely - no cancel, no display, no action. This stops
    // her reply from sitting in "You said" or making her repeat.
    function isEcho(spoken) {
        if (!lastSpokenText) {
            return false;
        }
        // Common, tiny, or feedback-only words that should NOT count
        // as a real overlap.
        const ignored = new Set([
            "up", "down", "here", "this", "tab", "yes", "sir",
            "stopped", "the", "for", "and", "you", "nova"
        ]);
        const replyWords = lastSpokenText
            .split(/\s+/)
            .filter(w => w.length >= 4 && !ignored.has(w.toLowerCase()));
        if (!replyWords.length) {
            return false;
        }
        // How much of Nova's last reply did the mic actually catch?
        const matched = replyWords.filter((w) =>
            spoken.includes(w)
        ).length;
        // Only treat it as an echo when the mic basically copied her
        // whole sentence (2+ real words). A single shared action word
        // like "next" is the USER genuinely repeating the command,
        // e.g. saying "next" again after she said "Next short".
        if (matched >= 2) {
            return true;
        }
        // Single-word replies ("Muted", "Done") - a one-word echo
        // is indistinguishable, so only suppress an exact match.
        if (replyWords.length === 1 && matched === 1) {
            const spokenWords =
                spoken.split(/\s+/).filter((w) => w.length >= 2);
            return spokenWords.length === 1 &&
                spokenWords[0] === replyWords[0];
        }
        return false;
    }

    const hasWakeWord =
        /nova|noah|innova/.test(spokenText);

    if (!hasWakeWord && isEcho(spokenText)) {
        return;
    }


    // BARGE-IN but only on REAL speech. Background noise and
    // tiny sounds also fire interim results, so we only cut
    // Nova off when there are a couple of real words - not on
    // noise, one stray word, or Nova's own voice.
    const wordCount = spokenText ? spokenText.split(/\s+/).length : 0;

    if (wordCount >= 2 && speechSynthesis.speaking) {
        try {
            speechSynthesis.cancel();
        } catch (e) {
            console.log(e);
        }
    }


    console.log(
        "Heard:",
        spokenText
    );


    // Live "You said" box. Use the FULL current utterance
    // (built from resultIndex) so speed issues don't replace
    // "nova" with its tail - e.g. "nova open youtube" appears
    // whole instead of "nova" being swapped for "open".
    if (spokenText) {
        text.textContent = spokenText;
    }


    // ==================================
    // NORMALIZE SPEECH
    // ==================================

    // Converts:
    // "hey, nova, stop"
    //
    // into:
    // "hey nova stop"
    //
    // and spoken URLs like "discord dot gg" into "discord.gg"
    // (the word "dot" becomes a real "." with no spaces).

    const normalizedText =
        spokenText
            .replace(/[,!?]/g, " ")
            .replace(/\bdot\b/g, ".")
            .replace(/\s*\.\s*/g, ".")
            .replace(/\s+/g, " ")
            .trim();


    console.log(
        "Normalized:",
        normalizedText
    );


    // ==================================
    // WAKE WORD (fuzzy)
    // ==================================

    // Matches "nova", "noah", "hey nova", "innova", etc.
    // at the START of the sentence and returns the
    // length of the matched wake words, or 0 if not found.

    function wakeLength(text) {

        for (const re of WAKE_PATTERNS) {

            const m = text.match(re);

            if (m && m.index === 0) {
                return m[0].length;
            }
        }

        return 0;
    }

    let command = normalizedText;
    let cut = wakeLength(command);

    // Follow-up ("chain") mode: after a wake-word command, bare
    // commands work for a short window without repeating it.
    const inSession = Date.now() < sessionEndAt;

    if (!cut && !inSession) {
        return;
    }

    if (cut) {

        // Strip any repeated wake words at the front
        // (e.g. "nova nova open youtube").
        while (cut > 0) {
            command = command.slice(cut).replace(/^\s+/, "");
            cut = wakeLength(command);
        }

        // If only the wake word was heard, do nothing.
        if (!command) {
            return;
        }

        // A wake-word command opens/extends the follow-up window.
        sessionEndAt = Date.now() + SESSION_MS;

    } else {

        // Follow-up mode - no wake word this time. Only accept real
        // action words so idle chit-chat never triggers Nova.
        if (!SESSION_STARTERS.some((r) => r.test(command))) {
            return;
        }

        sessionEndAt = Date.now() + SESSION_MS;
    }


    // ==================================
    // GREETING / STATUS CHECK
    // ==================================
    // Responds instantly - even on "live" results - so it
    // feels fast and doesn't wait for the phrase to finish.

    if (
        /^(are you awake|are you there|hello|hi|hey|yo)\b/i.test(command) ||
        /^(is|are) you (awake|there|here|on|up)\b/i.test(command)
    ) {

        // Only reply once per phrase - interim ("live") results
        // fire many times, so this stops Nova repeating itself.
        const now = Date.now();

        if (now - lastGreetTime < 1500) {
            return;
        }

        lastGreetTime = now;

        const reply = "Yes sir";

        result.textContent = reply;

        speak(reply);

        text.textContent = command;

        return;
    }


    // ==================================
    // STOP COMMAND
    // ==================================
    // Responds instantly so "nova stop" always works.

    if (
        /^stop(\s|$)/i.test(command) ||
        /^stop\s+(listening|assistant)(\s|$)/i.test(command)
    ) {

        console.log(
            "🛑 STOP COMMAND DETECTED"
        );

        // Speak the confirmation BEFORE stopping, so the
        // assistant's shutdown doesn't cancel it.
        speak("Stopped");

        text.textContent = command;

        result.textContent = "Stopped";

        sessionEndAt = 0;

        stopAssistant(true);

        return;
    }


    // ==================================
    // NORMAL COMMANDS
    // ==================================
    // Regular commands wait for the finished phrase so we
    // don't execute on a half-spoken word. ("Live" interim
    // results above are still handled instantly.)

    if (!hasFinal) {
        return;
    }


    text.textContent = command;

    executeCommand(command);
};


// ======================================
// RECOGNITION ENDED
// ======================================

recognition.onend = () => {

    console.log(
        "Recognition ended"
    );


    recognitionRunning = false;


    // VERY IMPORTANT:
    // If stopped, NEVER restart.

    if (!assistantRunning) {

        status.textContent =
            "🔴 Assistant stopped";

        return;
    }


    status.textContent =
        "🟡 Restarting...";


    scheduleRestart();
};


// ======================================
// SPEECH ERROR
// ======================================

recognition.onerror = (event) => {

    console.log(
        "Speech error:",
        event.error
    );


    recognitionRunning = false;


    if (!assistantRunning) {
        return;
    }


    if (
        event.error === "no-speech" ||
        event.error === "aborted" ||
        event.error === "network" ||
        event.error === "audio-capture"
    ) {

        // Transient errors - reconnect the mic so the
        // assistant keeps listening in other tabs.
        status.textContent =
            "🟡 Reconnecting...";

        scheduleRestart();

        return;
    }


    status.textContent =
        "Error: " + event.error;

    // Hard errors (not-allowed, service-not-allowed) -
    // keep trying after a short pause.
    scheduleRestart();
};


// ======================================
// STOP ASSISTANT
// ======================================

function stopAssistant(skipSpeechCancel) {

    console.log(
        "🛑 STOPPING ASSISTANT"
    );


    // Cancel any in-flight command so it won't keep running
    // or speak "sorry, couldn't do that" after we stopped.
    // (skipSpeechCancel is only used by the "stop" voice
    // command, so the "Stopped" confirmation gets to play.)

    cancelled = true;

    sessionEndAt = 0;

    if (!skipSpeechCancel) {
        try {
            speechSynthesis.cancel();
        } catch (e) {
            console.log(e);
        }
    }


    // FIRST disable automatic restart

    assistantRunning = false;


    // Cancel pending restart

    clearTimeout(restartTimer);

    restartTimer = null;


    // Mark recognition as stopped

    recognitionRunning = false;


    try {

        recognition.abort();

    } catch (error) {

        console.log(error);

    }


    status.textContent =
        "🔴 Assistant stopped";

    text.textContent =
        "Assistant stopped";


    console.log(
        "🛑 Assistant completely stopped"
    );
}


// ======================================
// COMMAND EXECUTOR
// ======================================

const BACKEND_URL =
    "http://localhost:3000";

const result = document.getElementById("result");

// ======================================
// LOCAL AI BACKEND DETECTION
// ======================================
// The extension works 100% offline with the built-in command resolver.
// If the user also runs our local AI server (http://localhost:3000),
// it auto-DETECTS the API and switches over so natural-language
// commands use AI. Server starts later? The checker keeps probing
// every few seconds and quietly moves the extension to AI the moment
// it comes online.

let aiOnline = false;
let aiProbeTimer = null;

async function probeBackend() {

    try {

        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            3000
        );

        const response = await fetch(
            BACKEND_URL + "/",
            { signal: controller.signal }
        );

        clearTimeout(timer);

        const data = await response.json().catch(() => ({}));

        aiOnline = Boolean(
            response.ok &&
            data &&
            data.success
        );

    } catch (error) {

        aiOnline = false;
    }

    updateAiStatus();

    return aiOnline;
}

function updateAiStatus() {

    const el = document.getElementById("aiStatus");

    if (!el) {
        return;
    }

    el.textContent =
        aiOnline
            ? "AI online"
            : "AI offline · built-in commands";

    el.className =
        "ai-chip " +
        (aiOnline ? "ai-on" : "ai-off");
}

// Check once when the page loads, then quietly re-probe while the
// server is offline so turning the AI on mid-session is picked up.
probeBackend();

aiProbeTimer = setInterval(() => {

    if (!aiOnline) {
        probeBackend();
    }

}, 15000);


// Sends the command to the AI backend, then
// executes whatever action the AI returns.

async function executeCommand(command) {

    console.log(
        "Executing:",
        command
    );

    // STEP 0 - split compound commands
    // ("open yt and search carryminate" -> two actions)
    // and run them one after another.

    const subCommands = splitCommands(command);

    let allFailed = true;
    const messages = [];

    for (const sub of subCommands) {

        const outcome = await executeSingle(sub);

        if (outcome.ok) {
            allFailed = false;
            messages.push(outcome.message);
        }
    }

    // If a "stop" happened mid-command, don't speak any
    // feedback (including "couldn't do that") - user wants
    // silence and no leftover task continuing.
    if (cancelled) {
        return;
    }

    if (allFailed) {
        speak("Sorry, I couldn't do that");
        result.textContent = "Couldn't do that";
        return;
    }

    const message = messages.join(". ");

    // Nothing was actually said or done (silent-ignore case) - stay
    // quiet and keep the mic listening so the user can say something
    // else right away.
    if (!message || !message.trim()) {
        return;
    }

    result.textContent = message;

    speak(message);
}

// Turns "open yt and search carryminate" into
// ["open yt", "search carryminate"].
// Only splits where the following part actually starts
// with a command word, so normal sentences stay whole.

const ACTION_STARTERS = [
    /^open\b/i, /^go\s+to\b/i, /^go\s+back\b/i, /^go\s+forward\b/i,
    /^take\s+me\s+to\b/i, /^visit\b/i, /^launch\b/i, /^start\b/i,
    /^search\b/i, /^look\s+up\b/i, /^find\b/i, /^play\b/i, /^watch\b/i,
    /^close\b/i, /^scroll\b/i, /^reload\b/i, /^refresh\b/i,
    /^new\s+tab\b/i, /^navigate\s+to\b/i, /^open\s+up\b/i
];

function splitCommands(command) {

    const raw = String(command).trim();

    const rawParts = raw
        .split(/\s+(?:and|then)\s+|\s*,\s*/i)
        .map((s) => s.trim())
        .filter(Boolean);

    if (rawParts.length < 2) {
        return [raw];
    }

    const result = [rawParts[0]];

    for (let i = 1; i < rawParts.length; i++) {

        const cur = rawParts[i];
        const prevIdx = result.length - 1;

        if (ACTION_STARTERS.some((r) => r.test(cur))) {

            result.push(cur);

        } else {

            // Not a command start - merge back into the
            // previous part so we don't break the sentence.
            result[prevIdx] = result[prevIdx] + " " + cur;
        }
    }

    return result.filter(Boolean);
}

// Runs ONE command: local resolution, then the AI backend.
// Returns { ok, message }.

async function executeSingle(command) {

    // If we stopped, don't run anything (no searching, no
    // opening tabs, no backend calls).
    if (cancelled) {
        return { ok: false, message: "Cancelled" };
    }

    // STEP 1 - fast local resolution.
    // Most commands are "open X", "search X", "go back", etc.
    // and can be answered instantly with zero network round-trip.

    const localAction = resolveLocally(command);

    if (localAction) {

        if (cancelled) {
            return { ok: false, message: "Cancelled" };
        }

        const executed =
            runAction(localAction);

        if (executed) {
            return {
                ok: true,
                message: describeAction(localAction)
            };
        }

        return { ok: false, message: "Unsupported action" };
    }

    // STEP 1.5 - If the local resolver didn't understand the command
    // AND there's no search intent, do NOT involve the backend and do
    // NOT speak any feedback. Stay silent and keep listening so the
    // user can just say something again. (A misheard "cale marco"
    // shouldn't get searched, and the mic shouldn't get stuck while
    // the backend tries to figure it out.)
    if (!hasSearchIntent(command)) {
        return { ok: true, message: "" };
    }

    // STEP 2 - AI backend, but ONLY when the AI server is actually
    // running. If it's offline we never wait for a dead localhost —
    // the built-in resolver handles the command instead, so nothing
    // gets stuck or talks to a missing server.

    if (!aiOnline) {
        localFallback(command);
        return { ok: true, message: "Command received" };
    }

    try {

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            8000
        );

        const response = await fetch(
            BACKEND_URL + "/command",

            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },

                signal: controller.signal,

                body: JSON.stringify({
                    command: command
                })
            }
        );

        clearTimeout(timeout);

        if (!response.ok) {

            throw new Error(
                "Backend error " + response.status
            );
        }

        const data = await response.json();

        if (
            !data.success ||
            !data.actions
        ) {

            throw new Error(
                data.error ||
                "Failed to parse the command"
            );
        }

        const actions = Array.isArray(data.actions)
            ? data.actions
            : [data.actions];

        const parts = [];

        for (const action of actions) {

            if (cancelled) {
                return { ok: false, message: "Cancelled" };
            }

            const executed =
                runAction(action);

            if (executed) {
                parts.push(describeAction(action));
            }
        }

        if (parts.length) {
            return { ok: true, message: parts.join(". ") };
        }

        return { ok: false, message: "Unsupported action" };

    } catch (error) {

        console.log(
            "Backend error:",
            error.message
        );

        if (cancelled) {
            return { ok: false, message: "Cancelled" };
        }

        // Works offline too - handles common commands locally
        localFallback(command);

        return { ok: true, message: "Command received" };
    }
}

// ======================================
// LOCAL RESOLVER
// ======================================

// Fast, offline resolver for the most common commands.
// Returns an action object, or null if it needs the AI.

// Big map of site aliases (nicknames, shorthands, number shortcuts).
// Every key maps to the URL to open. "open 1", "open yt", "open tube",
// "open face" etc. all resolve instantly - no AI needed.

const SITE_ALIASES = {
    // Numbers: quick shortcuts
    "1": "https://www.youtube.com",
    one: "https://www.youtube.com",
    "2": "https://www.google.com",
    two: "https://www.google.com",
    "3": "https://mail.google.com",
    three: "https://mail.google.com",
    "4": "https://chatgpt.com",
    four: "https://chatgpt.com",
    "5": "https://github.com",
    five: "https://github.com",
    "6": "https://www.facebook.com",
    six: "https://www.facebook.com",
    "7": "https://www.instagram.com",
    seven: "https://www.instagram.com",
    "8": "https://www.amazon.com",
    eight: "https://www.amazon.com",
    "9": "https://www.netflix.com",
    nine: "https://www.netflix.com",
    "10": "https://web.whatsapp.com",
    ten: "https://web.whatsapp.com",

    // YouTube
    youtube: "https://www.youtube.com",
    ytube: "https://www.youtube.com",
    yt: "https://www.youtube.com",
    tube: "https://www.youtube.com",

    // Google
    google: "https://www.google.com",
    ggl: "https://www.google.com",
    goggle: "https://www.google.com",

    // ChatGPT / OpenAI
    chatgpt: "https://chatgpt.com",
    gpt: "https://chatgpt.com",
    chadgpt: "https://chatgpt.com",
    openai: "https://openai.com",
    ai: "https://chatgpt.com",

    // Gmail
    gmail: "https://mail.google.com",
    mail: "https://mail.google.com",
    mailbox: "https://mail.google.com",

    // GitHub
    github: "https://github.com",
    git: "https://github.com",
    "git hub": "https://github.com",
    gh: "https://github.com",

    // Facebook
    facebook: "https://www.facebook.com",
    fb: "https://www.facebook.com",
    face: "https://www.facebook.com",
    meta: "https://www.facebook.com",

    // Instagram
    instagram: "https://www.instagram.com",
    insta: "https://www.instagram.com",
    ig: "https://www.instagram.com",
    gram: "https://www.instagram.com",

    // Amazon
    amazon: "https://www.amazon.com",
    amz: "https://www.amazon.com",

    // Netflix
    netflix: "https://www.netflix.com",
    nflx: "https://www.netflix.com",

    // Spotify
    spotify: "https://open.spotify.com",
    spot: "https://open.spotify.com",
    spoty: "https://open.spotify.com",

    // WhatsApp
    whatsapp: "https://web.whatsapp.com",
    whats: "https://web.whatsapp.com",
    wa: "https://web.whatsapp.com",

    // Twitter / X
    twitter: "https://twitter.com",
    tweet: "https://twitter.com",
    x: "https://x.com",

    // LinkedIn
    linkedin: "https://www.linkedin.com",
    linkin: "https://www.linkedin.com",
    linked: "https://www.linkedin.com",

    // Reddit
    reddit: "https://www.reddit.com",
    red: "https://www.reddit.com",

    // Wikipedia
    wikipedia: "https://www.wikipedia.org",
    wiki: "https://www.wikipedia.org",
    wikipidea: "https://www.wikipedia.org",

    // Stack Overflow
    stackoverflow: "https://stackoverflow.com",
    "stack overflow": "https://stackoverflow.com",
    stack: "https://stackoverflow.com",
    so: "https://stackoverflow.com",

    // Discord
    discord: "https://discord.com/channels/@me",
    dc: "https://discord.com/channels/@me",

    // TikTok
    tiktok: "https://www.tiktok.com",
    tt: "https://www.tiktok.com",

    // Instagram Reels
    reels: "https://www.instagram.com/reels/",
    reel: "https://www.instagram.com/reels/",

    // Twitch
    twitch: "https://www.twitch.tv",
    tw: "https://www.twitch.tv",

    // Pinterest
    pinterest: "https://www.pinterest.com",
    pin: "https://www.pinterest.com",

    // Maps / Drive / Docs
    "google maps": "https://maps.google.com",
    maps: "https://maps.google.com",
    map: "https://maps.google.com",
    "google drive": "https://drive.google.com",
    drive: "https://drive.google.com",
    "google docs": "https://docs.google.com/document",
    docs: "https://docs.google.com/document",

    // Misc popular
    gmailcom: "https://mail.google.com",
    "w3 schools": "https://www.w3schools.com",
    w3schools: "https://www.w3schools.com",
    claude: "https://claude.ai",
    gemini: "https://gemini.google.com",
    gmaildotcom: "https://mail.google.com"
};

// People you're in a DM with -> their Discord User ID.
// "nova call <nickname>" opens your DM with them and clicks
// the Voice Call button. Add nicknames + IDs here:
//   bestie: "123456789012345678"
// Get a User ID: Discord Settings > Advanced > Developer Mode,
// then right-click their name -> "Copy User ID".
const VOICE_TARGETS = {
    gay: "1454130615057256488",
    gayy: "1454130615057256488",
    morco: "1454130615057256488",
    marco: "1454130615057256488",
    morko: "1454130615057256488",
    marko: "1454130615057256488"
};

// Instagram @username for each of the same aliases, used by the
// "message <alias> ..." command to DM on Instagram instead of Discord.
// Fill these in and "message marco ..." will DM marco on Instagram.
const INSTA_TARGETS = {
    // morco: "your_insta_username",
    // marco: "...",
    // morko: "...",
    // marko: "...",
    // gay: "...",
    // gayy: "..."
};

const OPEN_PREFIXES = ["open ", "go to ", "take me to ", "visit ", "launch ", "start ", "navigate to ", "open up ", "pull up "];
const SEARCH_PREFIXES = ["search ", "look up ", "find "];
// Question starters -> run an instant web search instead of the slow AI.
const QUESTION_STARTERS = [
    /^(what|what's|whats|who|who's|whos|when|where|why|how|is|are|can|does|do|did|tell me about|give me|latest|news on|explain|define|meaning of)\b/i
];

// ======================================
// SEARCH TARGETS (engines + sites)
// ======================================
// Nova can search on any engine or site you name. Templates use
// {q} for the encoded query. Two groups:
//   SEARCH_ENGINES -> general-purpose search engines (google, bing, ...)
//   SEARCH_SITES   -> sites you can search inside (insta, reddit, github, ...)
// Recognized by the words people actually say ("google", "insta",
// "on youtube", "use duckduckgo", ...). If no target is given,
// searches default to Google.

const SEARCH_ENGINES = {
    google: { url: "https://www.google.com/search?q={q}", label: "Google" },
    bing: { url: "https://www.bing.com/search?q={q}", label: "Bing" },
    duckduckgo: { url: "https://duckduckgo.com/?q={q}", label: "DuckDuckGo" },
    ddg: { url: "https://duckduckgo.com/?q={q}", label: "DuckDuckGo" },
    yahoo: { url: "https://search.yahoo.com/search?p={q}", label: "Yahoo" },
    brave: { url: "https://search.brave.com/search?q={q}", label: "Brave" },
    "startpage": { url: "https://www.startpage.com/sp/search?query={q}", label: "Startpage" },
    ecosia: { url: "https://www.ecosia.org/search?q={q}", label: "Ecosia" },
    ask: { url: "https://www.ask.com/web?q={q}", label: "Ask" }
};

const SEARCH_SITES = {
    // The key is what the user says; {q} is the search term.
    youtube: { url: "https://www.youtube.com/results?search_query={q}", label: "YouTube" },
    yt: { url: "https://www.youtube.com/results?search_query={q}", label: "YouTube" },
    instagram: { url: "https://www.instagram.com/explore/search/keyword/?q={q}", label: "Instagram" },
    insta: { url: "https://www.instagram.com/explore/search/keyword/?q={q}", label: "Instagram" },
    ig: { url: "https://www.instagram.com/explore/search/keyword/?q={q}", label: "Instagram" },
    twitter: { url: "https://twitter.com/search?q={q}", label: "Twitter" },
    x: { url: "https://twitter.com/search?q={q}", label: "Twitter" },
    reddit: { url: "https://www.reddit.com/search/?q={q}", label: "Reddit" },
    amazon: { url: "https://www.amazon.com/s?k={q}", label: "Amazon" },
    github: { url: "https://github.com/search?q={q}", label: "GitHub" },
    wikipedia: { url: "https://en.wikipedia.org/w/index.php?search={q}", label: "Wikipedia" },
    wiki: { url: "https://en.wikipedia.org/w/index.php?search={q}", label: "Wikipedia" },
    stackoverflow: { url: "https://stackoverflow.com/search?q={q}", label: "Stack Overflow" },
    "stack overflow": { url: "https://stackoverflow.com/search?q={q}", label: "Stack Overflow" },
    so: { url: "https://stackoverflow.com/search?q={q}", label: "Stack Overflow" },
    spotify: { url: "https://open.spotify.com/search/{q}", label: "Spotify" },
    pinterest: { url: "https://www.pinterest.com/search/pins/?q={q}", label: "Pinterest" },
    tiktok: { url: "https://www.tiktok.com/search?q={q}", label: "TikTok" },
    netflix: { url: "https://www.netflix.com/search?q={q}", label: "Netflix" },
    gmail: { url: "https://mail.google.com/mail/u/0/#search/{q}", label: "Gmail" },
    mail: { url: "https://mail.google.com/mail/u/0/#search/{q}", label: "Gmail" },
    linkedin: { url: "https://www.linkedin.com/search/results/all/?keywords={q}", label: "LinkedIn" },
    maps: { url: "https://www.google.com/maps/search/{q}", label: "Google Maps" },
    "google maps": { url: "https://www.google.com/maps/search/{q}", label: "Google Maps" },
    map: { url: "https://www.google.com/maps/search/{q}", label: "Google Maps" },
    w3schools: { url: "https://www.w3schools.com/?search={q}", label: "W3Schools" },
    "w3 schools": { url: "https://www.w3schools.com/?search={q}", label: "W3Schools" }
};

// Aliases that resolve to a canonical site target.
const SEARCH_SITE_ALIASES = {
    meta: "instagram",
    fb: "facebook",
    facebook: "facebook",
    twitter: "twitter",
    x: "twitter",
    "youtube": "youtube",
    insta: "instagram",
    instagram: "instagram",
    "amazon": "amazon",
    reddit: "reddit",
    github: "github",
    wiki: "wikipedia",
    wikipedia: "wikipedia",
    stack: "stackoverflow"
};


// ======================================
// PARSE SEARCH TARGET
// ======================================
// Reads a search command and pulls out (a) the query and (b) the
// target to search on. Understands:
//   "search cats"                    -> query "cats", target null (Google)
//   "search cats on google"          -> query "cats", target google
//   "search on insta"                -> query "insta", target instagram
//   "search cats on instagram"       -> query "cats", target instagram
//   "search youtube for cats"        -> query "cats", target youtube
//   "look up cats using bing"        -> query "cats", target bing
//   "google cats"                    -> query "cats", target google
//   "use duckduckgo for cats"        -> query "cats", target duckduckgo
// Returns { query, target } (target is undefined when not given).

function parseSearchTarget(input) {

    let text = String(input || "").toLowerCase().trim();

    // Drop a leading connector ("on", "in", "using", "via"): the
    // user often says "search on insta cats" / "look up in google x".
    const hadConnector = /^(?:on|in|using|via|from|within)\s+/i.test(text);
    text = text.replace(/^(?:on|in|using|via|from|within)\s+/i, "");

    // Track every word that belongs to the target so we can strip
    // them out of the query afterwards.
    const consumed = [];
    let target = undefined;

    const isTargetWord = (word) => {
        const w = word.replace(/[^a-z\s]/g, "");
        return Boolean(
            SEARCH_ENGINES[w] ||
            SEARCH_SITES[w] ||
            SEARCH_SITE_ALIASES[w]
        );
    };

    const targetNameFor = (word) => {
        const w = word.replace(/[^a-z\s]/g, "");
        if (SEARCH_ENGINES[w]) return w;
        if (SEARCH_SITES[w]) return w;
        if (SEARCH_SITE_ALIASES[w]) return SEARCH_SITE_ALIASES[w];
        return undefined;
    };

    // Multi-word site names ("stack overflow", "w3 schools").
    const MULTI_WORD = Object.keys(SEARCH_SITES)
        .concat(Object.keys(SEARCH_ENGINES))
        .filter((k) => k.includes(" "));

    const stripTargetAt = (words, idx) => {
        // Try to consume a multi-word target ("stack overflow") first.
        for (const mw of MULTI_WORD) {
            const parts = mw.split(" ");
            if (
                idx + parts.length <= words.length &&
                words.slice(idx, idx + parts.length).join(" ") === mw
            ) {
                for (let i = 0; i < parts.length; i++) {
                    consumed.push(words[idx + i]);
                }
                return targetNameFor(mw);
            }
        }
        if (isTargetWord(words[idx])) {
            consumed.push(words[idx]);
            return targetNameFor(words[idx]);
        }
        return undefined;
    };

    // 1) "use <engine>" — the engine is stated up front.
    let m = text.match(/^(?:use|using|with)\s+(.+?)\s+(?:to |for |and |then |on )?(.+)$/);
    if (m) {
        const engineWords = m[1]
            .split(/\s+/)
            .filter((w) => isTargetWord(w))
            .join(" ");
        if (engineWords) {
            const first = engineWords.split(" ")[0];
            const name = targetNameFor(first);
            if (name) {
                target = name;
                consumed.push(first);
                text = m[2];
            }
        }
    }

    // 2) "search X on <target>" / "...on <target>" (mid/end target)
    //    Also "via <target>" and "using <target>".
    m = text.match(/^(.*?)\s+(?:on|via|using|through)\s+([a-z0-9\s]+?)\s*$/);
    if (m && m[1] && m[2]) {
        const t = targetNameFor(m[2].trim());
        if (t) {
            target = t;
            text = m[1].trim();
        }
    }

    // 3) "search <target> for <query>" -> query is after "for <target>".
    m = text.match(/^(.+?)\s+(?:youtube|google|bing|instagram|insta|ig|reddit|twitter|x|amazon|github|wikipedia|wiki|spotify|pinterest|tiktok|netflix|stackoverflow|stack overflow|maps)\s+for\s+(.+)$/i);
    if (m && m[2]) {
        const t = targetNameFor(m[1].trim());
        if (t) {
            target = t;
            text = m[2].trim();
        }
    }

    // 4) Leading target word that acts like a search verb:
    //    "google cats", "youtube for songs", "wiki dogs".
    //    Allow a leading "x" only when a connector was present
    //    ("on x elon"), since a bare "x ..." is usually the query.
    m = text.match(/^([a-z0-9]+)\s+(?:for\s+|up\s+)?(.+)$/);
    if (m) {
        const t = targetNameFor(m[1]);
        if (t && (m[1] !== "x" || hadConnector)) {
            target = t;
            consumed.push(m[1]);
            text = m[2].trim();
        }
    }

    // Clean any leftover target words out of the query.
    const cleaned = text
        .split(/\s+/)
        .filter((w) => !consumed.includes(w))
        .join(" ")
        .replace(/^(?:on|in|via|using|through|for|of|about)\s+/i, "")
        .replace(/\s+(on|via|using|through|for)\s+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return {
        query: cleaned,
        target: target
    };
}


// Returns true when the command clearly asks to search the web:
// a question word (what / when / how / who / whose / where / why)
// or an explicit search verb ("search / look up / find / google /
// use / using"). Used to decide whether an unrecognized command is
// worth sending to the backend at all.
function hasSearchIntent(command) {

    const trimmed = String(command).trim().toLowerCase();

    return (
        QUESTION_STARTERS.some((re) => re.test(trimmed)) ||
        SEARCH_PREFIXES.some((p) => trimmed.startsWith(p)) ||
        /^google\s+/i.test(trimmed) ||
        /^(use|using)\s+/i.test(trimmed)
    );
}


function resolveLocally(command) {

    const lower = " " + String(command).toLowerCase().trim() + " ";
    const trimmed = String(command).trim().toLowerCase();

    // Navigation / tab actions
    if (/\bnew tab\b/.test(lower)) return { action: "NEW_TAB" };

    // CLOSE - "close the tab" closes the CURRENT tab; "close all
    // youtube" closes every YouTube tab; "close bairan" closes that
    // song's tab by name. Generic, works for any site or app.
    if (/\bclose\b/.test(lower)) {

        // "close the browser" / "close edge" / "close everything" ->
        // shut the whole browser down (all windows).
        if (/\b(browser|edge|chrome|window|everything|all tabs)\b/.test(lower)) {
            return { action: "CLOSE_BROWSER" };
        }

        // "close the tab" / "close this" / "close current tab" ->
        // the tab you are looking at right now.
        if (
            /\bclose (the|this|that|current|active|open)?\s*tab\b/.test(lower) ||
            /\bclose (this|the|current|active)\b/.test(lower) ||
            trimmed === "close"
        ) {
            return { action: "CLOSE_TAB", active: true };
        }

        const allFlag =
            /\bclose all\b/.test(lower) ||
            /\bclose every\b/.test(lower) ||
            /\ball the\b/.test(lower);

        const closeName = trimmed
            .replace(/^close\b/, "")
            .replace(/^all\b/, "")
            .replace(/^every\b/, "")
            .replace(/^(the|that|this|my)\s+/i, "")
            .trim();

        if (closeName) {

            // Match a known site name / alias, e.g. "close youtube".
            for (const name in SITE_ALIASES) {
                if (/^\d+$/.test(name)) continue;
                if (
                    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(" " + closeName + " ")
                ) {
                    return { action: "CLOSE_TAB", target: name, all: allFlag };
                }
            }

            // Match a spoken domain, e.g. "close discord.gg".
            const dom = closeName.match(
                /^([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/
            );

            if (dom) {
                return {
                    action: "CLOSE_TAB",
                    url: "https://" + dom[1].toLowerCase(),
                    all: allFlag
                };
            }

            // Anything else is the name of the thing playing in that
            // tab, e.g. "close bairan".
            return {
                action: "CLOSE_TAB",
                title: closeName,
                all: allFlag
            };
        }
    }
    if (/\bgo back\b/.test(lower) || /\bback(page|wards)?\b/.test(lower)) return { action: "GO_BACK" };
    if (/\bgo forward\b/.test(lower) || /\bforward\b/.test(lower)) return { action: "GO_FORWARD" };
    if (/\breload\b/.test(lower) || /\brefresh\b/.test(lower)) return { action: "RELOAD" };
    if (/\bscroll\b/.test(lower)) {
        return { action: "SCROLL", direction: /\bup\b/.test(lower) ? "up" : "down" };
    }

    // VOLUME - control the video/audio playing on the current tab.
    // "volume up", "increase volume by half", "set volume to half",
    // "max the volume", "volume 30 percent", "mute", "unmute".
    if (
        /\bvolume\b/.test(lower) ||
        /\b(louder|quieter)\b/.test(lower) ||
        /\bmute\b/.test(lower) ||
        /\bunmute\b/.test(lower)
    ) {

        // "mute bairan" / "unmute bairan" -> target that specific
        // tab by name instead of the current one.
        const muteNameMatch = trimmed.match(
            /^(?:mute|unmute)\s+(?:the\s+)?(.+)$/i
        );

        const tabName = muteNameMatch
            ? muteNameMatch[1]
                .replace(/\b(video|song|audio|music|track|sound|now|please|this|that|tab)\b/gi, " ")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase()
            : "";

        if (/\bmute\b/.test(lower) && !/\bunmute\b/.test(lower)) {
            return tabName
                ? { action: "VOLUME", mode: "mute", tab: tabName }
                : { action: "VOLUME", mode: "mute" };
        }

        if (/\bunmute\b/.test(lower)) {
            return tabName
                ? { action: "VOLUME", mode: "unmute", tab: tabName }
                : { action: "VOLUME", mode: "unmute" };
        }

        const up =
            /\b(up|increase|raise|louder|higher|boost)\b/.test(lower);

        const down =
            /\b(down|decrease|reduce|lower|quieter|hush)\b/.test(lower);

        const step =
            /\bby (half|50)\b/.test(lower) ? 0.5 : 0.1;

        const pct =
            lower.match(/(\d{1,3})\s*(?:%|percent)/) ||
            lower.match(/\bvolume\s+(?:to |at )?(\d{1,3})\b/);

        if (pct) {
            return {
                action: "VOLUME",
                mode: "set",
                value: Math.max(0, Math.min(1, Number(pct[1]) / 100))
            };
        }

        if (/\b(max|maximum|full)\b/.test(lower)) {
            return { action: "VOLUME", mode: "set", value: 1 };
        }

        if (/\bhalf\b/.test(lower) && !/\bby half\b/.test(lower)) {
            return { action: "VOLUME", mode: "set", value: 0.5 };
        }

        if (up) {
            return { action: "VOLUME", mode: "up", step };
        }

        if (down) {
            return { action: "VOLUME", mode: "down", step };
        }

        return { action: "VOLUME", mode: "up", step: 0.1 };
    }

    // NEXT / PREVIOUS - keyboard navigation (ArrowDown = next,
    // ArrowUp = previous) works on any app that supports it:
    // YouTube Shorts, Instagram Reels, TikTok, Facebook Reels,
    // Stories, etc. "skip" counts as "next".
    if (
        (/\bnext\b/.test(lower) || /\bskip\b/.test(lower)) &&
        !(/\bnext song\b/.test(lower) && /\bplay\b/.test(lower))
    ) {
        return { action: "NEXT_SHORT" };
    }
    if (
        /\bprevious\b/.test(lower) ||
        /\bprev\b/.test(lower) ||
        /\bgo back a (short|video|reel|story)\b/.test(lower)
    ) {
        return { action: "PREV_SHORT" };
    }

    // SHORTS - "nova watch shorts" / "go to shorts" -> open the
    // YouTube Shorts feed. Scroll down/up with full-viewport
    // jumps to move between shorts.
    if (
        /\bshorts\b/.test(lower) ||
        /\b(?:watch|go to|open|browse|see)\s+shorts?\b/.test(lower) ||
        /\b(?:youtube|yt)\s+shorts?\b/.test(lower)
    ) {
        return {
            action: "OPEN_URL",
            url: "https://www.youtube.com/shorts"
        };
    }

    // REELS - "open reels" / "watch reels" -> Instagram Reels feed.
    // (Saying "next"/"previous" there navigates the reels.)
    if (/\breels?\b/.test(lower)) {
        return {
            action: "OPEN_URL",
            url: "https://www.instagram.com/reels/"
        };
    }

    // CALL - "nova call gooner" (or "call my friend") -> open
    // the DM with that person and start a voice call.
    // The regex also accepts common mishearings of "call" (cale,
    // kall, kale, coal, caul) so a misheard command still calls.
    const callMatch = trimmed.match(
        /^(?:call|cale|kall|kale|coal|caul|voice call|call up|voice cale|cale up)\s+(.+)$/i
    );

    if (callMatch) {

        const who = callMatch[1]
            .replace(/\b(?:my friend|friend|my)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        // Default to the first/only target, or match by name.
        let userId = null;
        let displayName = who || "your friend";

        if (who) {
            for (const name in VOICE_TARGETS) {
                if (
                    who === name ||
                    who.includes(name) ||
                    name.includes(who)
                ) {
                    userId = VOICE_TARGETS[name];
                    displayName = name;
                    break;
                }
            }
        }

        // No name given -> use the only entry.
        if (!userId && !who) {
            const keys = Object.keys(VOICE_TARGETS);
            if (keys.length === 1) {
                userId = VOICE_TARGETS[keys[0]];
                displayName = keys[0];
            }
        }

        if (userId) {
            return {
                action: "CALL_DM",
                userId,
                name: displayName
            };
        }

        return null;
    }

    // CALL CONTROLS - "pick up / answer / cut / mute / deafen the
    // call" act on the Discord call that's currently in progress (or
    // ringing). Scoped to "call" so they never clash with media volume
    // mute etc.
    if (/\b(pick up|pick up the call|answer|answer the call|accept the call)\b/.test(lower)) {
        return { action: "DISCORD_CALL_CONTROL", control: "pick" };
    }
    if (
        /\b(cut|end|hang up|end call|hang up the call|end the call|disconnect)\b/.test(lower) &&
        /\bcall\b|\bhang up\b/.test(lower)
    ) {
        return { action: "DISCORD_CALL_CONTROL", control: "end" };
    }
    if (
        /\bmute\b/.test(lower) && /\bcall\b/.test(lower)
    ) {
        return { action: "DISCORD_CALL_CONTROL", control: "mute" };
    }
    if (
        /\bunmute\b/.test(lower) && /\bcall\b/.test(lower)
    ) {
        return { action: "DISCORD_CALL_CONTROL", control: "unmute" };
    }
    if (
        /\bdeafen\b/.test(lower) && /\bcall\b/.test(lower)
    ) {
        return { action: "DISCORD_CALL_CONTROL", control: "deafen" };
    }
    if (
        /\bundeafen\b/.test(lower) && /\bcall\b/.test(lower)
    ) {
        return { action: "DISCORD_CALL_CONTROL", control: "undeafen" };
    }

    // DM / MESSAGE - "dm marco hey" sends a Discord DM to that person;
    // "message marco hey" sends it on Instagram (once the person's IG
    // @username is added to INSTA_TARGETS below; until then it falls
    // back to Discord so it still works).
    {
        const dmMatch = trimmed.match(/^(?:dm|direct message|msg)\s+(.+)$/i);
        const msgMatch = trimmed.match(/^(?:message|messenger)\s+(.+)$/i);

        for (const [m, platform] of [
            [dmMatch, "discord"],
            [msgMatch, "instagram"]
        ]) {
            if (m && m[1]) {
                const rest = m[1].trim();
                const parsed = rest.match(/^(\S+)(?:\s+([\s\S]+))?$/);
                if (parsed) {
                    const aliasKey = parsed[1].toLowerCase();
                    for (const name in VOICE_TARGETS) {
                        if (aliasKey === name) {
                            const text = (parsed[2] || "").trim();

                            // "message" = Instagram. If no IG handle is
                            // configured yet, fall back to Discord.
                            let usePlatform = platform;
                            let username = null;
                            if (platform === "instagram") {
                                if (INSTA_TARGETS[name]) {
                                    username = INSTA_TARGETS[name];
                                } else {
                                    usePlatform = "discord";
                                }
                            }

                            return {
                                action: "SEND_DM",
                                platform: usePlatform,
                                userId: usePlatform === "discord"
                                    ? VOICE_TARGETS[name]
                                    : null,
                                username,
                                name,
                                message: text
                            };
                        }
                    }
                }
            }
        }
    }

    // PLAY/PAUSE - control the video playing in the current tab.
    // "pause", "pause the video", "resume", "play the video", or a
    // bare "play" (with no song name) resumes it.
    if (/\b(pause|freeze|hold)\b/.test(lower)) {
        return { action: "PLAY_PAUSE", mode: "pause" };
    }

    if (
        /\b(resume|unpause|continue playing|keep playing)\b/.test(lower) ||
        /\bplay the (video|song|audio|music)\b/.test(lower)
    ) {
        return { action: "PLAY_PAUSE", mode: "play" };
    }

    if (
        /(^|\b)play(\s|$)/i.test(trimmed) &&
        !/\s+play\s+(\S)/.test(lower)
    ) {
        return { action: "PLAY_PAUSE", mode: "play" };
    }

    // PLAY - "nova play barsaat" -> search on YouTube and open
    // the most relevant (top) video, auto-playing it. Adding
    // "here" / "in this tab" reuses the current tab instead of
    // opening a new one.
    const playHere =
        /\b(?:here|in this tab|this tab)\b/.test(lower);

    const playMatch = trimmed
        .replace(/\b(?:here|in this tab|this tab)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .match(
            /^(?:play|watch|play the song)\s+(.+)$/i
        );

    if (playMatch) {
        const q = playMatch[1].trim();
        return { action: "PLAY", query: q, here: playHere };
    }

    // YouTube - search on YouTube
    if (/\bon youtube\b/.test(lower) || /\b(?:youtube|yt|tube)\b/.test(lower)) {
        if (/\bopen\b/.test(lower) && !/\bplay\b/.test(lower) && !/\bsearch\b/.test(lower)) {
            return { action: "OPEN_URL", url: SITE_ALIASES.youtube };
        }
        const ytText = String(command)
            .replace(/\b(hey nova)\b/gi, " ")
            .replace(/^\s*(?:search|look up|find)\s+/i, "")
            .replace(/\s+/g, " ")
            .trim();
        const parsed = parseSearchTarget(ytText);
        const q = parsed.query || "youtube";
        return { action: "SEARCH", query: q, engine: parsed.target || "youtube" };
    }

    // Alias / keyword -> OPEN_URL (when there's an open intent)
    for (const name in SITE_ALIASES) {
        if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) {
            if (/\b(open|go to|take me to|visit|launch|start|navigate to|open up|pull up|show me)\b/.test(lower)) {
                return { action: "OPEN_URL", url: SITE_ALIASES[name] };
            }
        }
    }

    // Spoken URL -> OPEN_URL
    // e.g. "open discord.gg", "go to google.com"
    const domainMatch = trimmed.match(
        /^(?:open|go to|take me to|visit|launch|start|navigate to|open up|pull up)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)\s*$/
    );

    if (domainMatch) {
        let url = domainMatch[1].toLowerCase();
        if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
        }
        return { action: "OPEN_URL", url };
    }

    // Question -> instant SEARCH (avoids the slow Ollama call)
    if (QUESTION_STARTERS.some((re) => re.test(trimmed))) {
        const pq = parseSearchTarget(trimmed);
        return {
            action: "SEARCH",
            query: pq.query || trimmed,
            engine: pq.target
        };
    }

    // Explicit search prefixes
    for (const p of SEARCH_PREFIXES) {
        if (trimmed.startsWith(p)) {
            const pq = parseSearchTarget(
                trimmed.replace(p, "").trim()
            );
            return {
                action: "SEARCH",
                query: pq.query || trimmed.replace(p, "").trim(),
                engine: pq.target
            };
        }
    }

    // "use <engine> ..." / "using <engine> ..." -> search with that engine.
    // e.g. "use bing for news", "using duckduckgo search cats".
    const useMatch = trimmed.match(
        /^(?:use|using)\s+(.+)$/
    );
    if (useMatch) {
        const pu = parseSearchTarget(useMatch[1]);
        if (pu.target && pu.query) {
            return {
                action: "SEARCH",
                query: pu.query,
                engine: pu.target
            };
        }
    }

    return null;
}


// ======================================
// RUN ACTION
// ======================================

function runAction(action) {

    switch (action.action) {

        case "OPEN_URL":

            if (action.url) {

                chrome.tabs.create({
                    url: action.url
                });

                return true;
            }

            break;


        case "ALERT":

            // "Didn't understand" - just speak the message,
            // no browser action. Return true so the message
            // is reported and spoken as feedback.
            return true;


        case "CALL_DM":

            callOnDiscord(action.userId, action.name);

            return true;


        case "DISCORD_CALL_CONTROL":

            controlDiscordCall(action.control);

            return true;


        case "SEND_DM":

            sendDm(action);

            return true;


        case "SEARCH":

            searchWeb(
                action.query,
                action.engine
            );

            return true;


        case "PLAY":

            playOnYouTube(action.query, action.here);

            return true;


        case "NEW_TAB":

            chrome.tabs.create({});

            return true;


        case "CLOSE_TAB":

            closeMatchingTabs(action);

            return true;


        case "CLOSE_BROWSER":

            // Speak the confirmation first, then shut Edge down.
            setTimeout(() => {
                chrome.tabs.query({}, (tabs) => {
                    chrome.tabs.remove(
                        (tabs || [])
                            .filter((t) => t.id != null)
                            .map((t) => t.id)
                    );
                });
            }, 1200);

            return true;


        case "GO_BACK":

            runOnTargetTab(
                (tab) =>
                    chrome.tabs.goBack(tab.id)
            );

            return true;


        case "GO_FORWARD":

            runOnTargetTab(
                (tab) =>
                    chrome.tabs.goForward(tab.id)
            );

            return true;


        case "RELOAD":

            runOnTargetTab(
                (tab) =>
                    chrome.tabs.reload(tab.id)
            );

            return true;


        case "PREV_SHORT":

            runOnTargetTab(
                (tab) =>
                    pressKey(tab.id, "ArrowUp")
            );

            return true;


        case "NEXT_SHORT":

            runOnTargetTab(
                (tab) =>
                    pressKey(tab.id, "ArrowDown")
            );

            return true;


        case "SCROLL":

            runOnTargetTab(
                (tab) => {

                    const direction =
                        action.direction === "up" ? -1 : 1;

                    chrome.scripting.executeScript({

                        target: {
                            tabId: tab.id
                        },

                        func: (dir) => {

                            // Full viewport scroll so it changes
                            // YouTube Shorts in one go (700px was
                            // not enough).
                            const amount =
                                Math.max(
                                    window.innerHeight,
                                    800
                                );

                            window.scrollBy({
                                top: dir * amount,
                                behavior: "smooth"
                            });
                        },

                        args: [direction]

                    }).catch(() => {
                        console.log("Cannot scroll this page");
                    });
                }
            );

            return true;


        case "VOLUME":

            adjustTabVolume(action);

            return true;


        case "PLAY_PAUSE":

            toggleMediaPlayback(action.mode);

            return true;

    }

    return false;
}


// Adjust the volume of the video/audio playing on the active tab,
// or on a specific tab by name ("mute bairan").
// mode: up / down / set / mute / unmute.
// step: 0.1 = "by 1" (10%), 0.5 = "by half".
function adjustTabVolume(action) {

    const extensionUrl = chrome.runtime.getURL("");

    const findTabs = (done) => {

        if (!action.tab) {

            chrome.tabs.query(
                { active: true, currentWindow: true },
                (tabs) => done(tabs && tabs[0] ? [tabs[0]] : [])
            );

            return;
        }

        const name = action.tab.toLowerCase();

        chrome.tabs.query({}, (tabs) => {

            done((tabs || []).filter((t) =>
                t.id != null &&
                t.url &&
                !t.url.startsWith(extensionUrl) &&
                !t.url.startsWith("chrome://") &&
                !t.url.startsWith("chrome-extension://") &&
                !t.url.startsWith("edge://") &&
                (
                    (t.title || "").toLowerCase().includes(name) ||
                    t.url.toLowerCase().includes(name)
                )
            ));
        });
    };

    findTabs((tabs) => {

        (tabs || []).forEach((tab) => {

            const tabId = tab.id;

            if (tabId == null) {
                return;
            }

            chrome.scripting.executeScript(
                {
                    target: { tabId },

                    func: (mode, value, step) => {

                        const all =
                            Array.from(
                                document.querySelectorAll("video, audio")
                            );

                        if (!all.length) {
                            return { found: false };
                        }

                        // Only media actually in the viewport - Shorts /
                        // Reels preload the next clip off-screen, and
                        // without this check we'd change THAT one.
                        const inView = all.filter((el) => {
                            const r = el.getBoundingClientRect();
                            return (
                                r.width > 0 && r.height > 0 &&
                                r.right > 0 && r.bottom > 0 &&
                                r.left < window.innerWidth &&
                                r.top < window.innerHeight
                            );
                        });

                        const pool = inView.length ? inView : all;

                        // Pick the biggest PLAYING element - the one
                        // you're actually watching/listening to.
                        const target =
                            pool.sort((a, b) => {
                                const wa = a.offsetWidth * a.offsetHeight;
                                const wb = b.offsetWidth * b.offsetHeight;
                                if (a.paused !== b.paused) {
                                    return a.paused ? 1 : -1;
                                }
                                return wb - wa;
                            })[0];

                        let volume = target.volume;

                        if (mode === "mute") {
                            volume = 0;
                            target.muted = true;
                        } else if (mode === "unmute") {
                            volume = Math.max(volume, 0.7);
                            target.muted = false;
                        } else if (mode === "up") {
                            volume = Math.min(1, volume + step);
                            target.muted = false;
                        } else if (mode === "down") {
                            volume = Math.max(0, volume - step);
                            target.muted = false;
                        } else if (mode === "set") {
                            volume = Math.max(0, Math.min(1, value));
                            target.muted = false;
                        }

                        target.volume = volume;

                        return {
                            found: true,
                            volume: Math.round(volume * 100)
                        };
                    },

                    args: [
                        action.mode,
                        action.value == null ? 0 : action.value,
                        action.step == null ? 0.1 : action.step
                    ]

                }
            ).catch(() => {
                console.log("Cannot adjust volume on this page");
            });
        });
    });
}


// Pause or play the video/audio actually playing on the active tab.
function toggleMediaPlayback(mode) {

    chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs) => {

            const tabId = tabs && tabs[0] && tabs[0].id;

            if (tabId == null) {
                return;
            }

            chrome.scripting.executeScript(
                {
                    target: { tabId },

                    func: (m) => {

                        const all =
                            Array.from(
                                document.querySelectorAll("video, audio")
                            );

                        if (!all.length) {
                            return { found: false };
                        }

                        // Only media actually in the viewport - Shorts /
                        // Reels preload the next clip off-screen, and
                        // without this check we'd pause/resume THAT one.
                        const inView = all.filter((el) => {
                            const r = el.getBoundingClientRect();
                            return (
                                r.width > 0 && r.height > 0 &&
                                r.right > 0 && r.bottom > 0 &&
                                r.left < window.innerWidth &&
                                r.top < window.innerHeight
                            );
                        });

                        const pool = inView.length ? inView : all;

                        // Pause everything visible (the player may keep
                        // several clips buffered).
                        if (m === "pause") {
                            pool.forEach((el) => {
                                try {
                                    el.pause();
                                } catch (e) {}
                            });
                            return { found: true };
                        }

                        // Resume the biggest PAUSED element - the clip
                        // you are actually looking at, not the off-screen
                        // preloaded next one.
                        const target =
                            pool.sort((a, b) => {
                                const wa = a.offsetWidth * a.offsetHeight;
                                const wb = b.offsetWidth * b.offsetHeight;
                                if (a.paused !== b.paused) {
                                    return a.paused ? -1 : 1;
                                }
                                return wb - wa;
                            })[0];

                        try {
                            const p = target.play();
                            if (p && p.catch) p.catch(() => {});
                        } catch (e) {}

                        return { found: true };
                    },

                    args: [mode]

                }
            ).catch(() => {
                console.log("Cannot control media on this page");
            });
        }
    );
}


// Dispatch a real keyboard event to the page so Shorts and
// media players respond to navigation (ArrowDown = next short,
// ArrowUp = previous short, etc.).
function pressKey(tabId, key) {

    chrome.scripting.executeScript(
        {
            target: { tabId },
            func: (k) => {

                const opts = {
                    key: k,
                    code: k,
                    keyCode: k === "ArrowDown" ? 40
                        : k === "ArrowUp" ? 38 : 0,
                    which: k === "ArrowDown" ? 40
                        : k === "ArrowUp" ? 38 : 0,
                    bubbles: true
                };

                const node =
                    document.activeElement ||
                    document.body ||
                    document.documentElement;

                node.dispatchEvent(
                    new KeyboardEvent("keydown", opts)
                );
                node.dispatchEvent(
                    new KeyboardEvent("keyup", opts)
                );
            },
            args: [key]
        }
    ).catch(() => {
        console.log("Cannot send key to this page");
    });
}


// ======================================
// SEARCH WEB
// ======================================

// Build the search URL for a named target (engine or site).
// Falls back to Google when the target is unknown or missing.
function searchTargetUrl(target, query) {

    const q = encodeURIComponent(
        String(query || "").trim()
    );

    if (!q) {
        return null;
    }

    const name = String(target || "").toLowerCase().trim();

    let spec = SEARCH_ENGINES[name] || SEARCH_SITES[name];

    // "search on meta" -> Instagram, "fb" -> Facebook, etc.
    if (!spec && SEARCH_SITE_ALIASES[name]) {
        spec = SEARCH_SITES[SEARCH_SITE_ALIASES[name]];
    }

    // No target / unknown target -> Google (the generic default).
    if (!spec) {
        spec = SEARCH_ENGINES.bing;
    }

    return {
        url: String(spec.url).replace("{q}", q),
        label: spec.label
    };
}

function searchWeb(query, target) {

    const built = searchTargetUrl(target, query);

    if (!built) {
        return;
    }

    chrome.tabs.create({
        url: built.url
    });
}

// Friendly name for a search target, used in spoken feedback.
function searchTargetLabel(target) {

    const name = String(target || "").toLowerCase().trim();

    if (!name) {
        return "Bing";
    }

    if (SEARCH_ENGINES[name]) {
        return SEARCH_ENGINES[name].label;
    }

    if (SEARCH_SITES[name]) {
        return SEARCH_SITES[name].label;
    }

    if (SEARCH_SITE_ALIASES[name] && SEARCH_SITES[SEARCH_SITE_ALIASES[name]]) {
        return SEARCH_SITES[SEARCH_SITE_ALIASES[name]].label;
    }

    return "Bing";
}

// "nova call gooner" - open your DM with that person
// (discord.com/channels/@me/<userId>) then, once Discord
// loads, click the Voice Call button to ring them.
function callOnDiscord(userId, name) {

    const dmUrl =
        "https://discord.com/channels/@me/" +
        userId;

    // The DM may already be open in a tab - reuse it instead of
    // always opening a duplicate.
    chrome.tabs.query({ url: "https://discord.com/*" }, (existing) => {

        let tabToUse = null;

        for (const t of existing) {
            if (t.id != null) {
                tabToUse = t;
                break;
            }
        }

        if (tabToUse) {
            chrome.tabs.update(tabToUse.id, { url: dmUrl, active: true });
            pollForCallButton(tabToUse.id);
        } else {
            chrome.tabs.create({ url: dmUrl }, (tab) => {
                if (tab && tab.id != null) {
                    pollForCallButton(tab.id);
                }
            });
        }
    });

    console.log(
        "Calling " + (name || userId) + " on Discord"
    );
}

// "nova mute the call" / "pick up" / "cut the call" / "deafen the
// call" - act on the Discord call that's currently ringing or in
// progress. Runs an in-page script that finds the matching control
// button and triggers it via React's real onClick (fiber click).
function controlDiscordCall(control) {

    const mapping = {
        pick: ["accept", "answer", "pick up", "accept call"],
        end: ["disconnect", "hang up", "end call", "decline", "ignore"],
        mute: ["mute"],
        unmute: ["unmute", "mute"],
        deafen: ["deafen"],
        undeafen: ["undeafen", "deafen"]
    };

    const keywords = mapping[control] || [];

    // Runs inside the Discord page with (control, keywords) injected.
    // Finds the matching call-control button and triggers it via
    // React's real onClick (fiber click). Returns true if done.
    const controlFunc = (ctrl, kws) => {

        const fireClick = (node) => {
            if (!node) return false;
            const key = Object.keys(node).find(
                (k) => k.startsWith("__reactFiber$")
            );
            if (key) {
                let fiber = node[key];
                const seen = new Set();
                let handler = null;
                while (fiber && !seen.has(fiber)) {
                    seen.add(fiber);
                    const p = fiber.memoizedProps || {};
                    if (typeof p.onClick === "function") {
                        handler = p.onClick;
                        break;
                    }
                    if (typeof p.onMouseDown === "function") {
                        handler = p.onMouseDown;
                        break;
                    }
                    fiber = fiber.return;
                }
                if (handler) {
                    try {
                        handler({
                            target: node,
                            currentTarget: node,
                            preventDefault() {},
                            stopPropagation() {},
                            nativeEvent: { isTrusted: true },
                            isTrusted: true,
                            button: 0,
                            detail: 1,
                            clientX: 0,
                            clientY: 0
                        });
                        return true;
                    } catch (e) {
                        // fall through
                    }
                }
            }
            try {
                node.click();
                return true;
            } catch (e) {
                return false;
            }
        };

        // Mute/deafen/end controls appear in the active call
        // container; pick/decline appear in the incoming ring UI.
        const root = document.querySelector(
            '[class*="callContainer"], [class*="callStatus"], ' +
            '[class*="voiceCall"], [class*="ringing"], ' +
            '[class*="incomingCall"], [role="dialog"]'
        );
        const scope = root && root.querySelectorAll ? root : document;

        const els = scope.querySelectorAll('button, [role="button"]');

        for (const el of els) {
            const label = String(
                (el.getAttribute("aria-label") || "") +
                " " +
                (el.getAttribute("title") || "") +
                " " +
                (el.textContent || "")
            ).toLowerCase();
            for (const kw of kws) {
                if (label.indexOf(kw) !== -1) {
                    // mute/unmute + deafen/undeafen are toggles on the
                    // same button - match the desired state via
                    // aria-pressed so we don't fight the current one.
                    const pressed = el.getAttribute("aria-pressed");
                    if (
                        (ctrl === "unmute" || ctrl === "undeafen") &&
                        pressed === "true"
                    ) {
                        continue;
                    }
                    if (
                        (ctrl === "mute" || ctrl === "deafen") &&
                        pressed === "true"
                    ) {
                        // Already muted/deafened - consider it done.
                        return true;
                    }
                    if (fireClick(el)) {
                        return true;
                    }
                }
            }
        }

        return false;
    };

    chrome.tabs.query({ url: "https://discord.com/*" }, (tabs) => {
        const tab = (tabs || []).find((t) => t.id != null);
        if (!tab || !tab.id) {
            return;
        }
        chrome.scripting.executeScript(
            {
                target: { tabId: tab.id },
                func: controlFunc,
                args: [control, keywords]
            },
            (res) => {
                const ok =
                    res && res[0] && res[0].result === true;
                // Feedback is provided via describeAction (consistent
                // with CALL_DM). Just log the outcome here.
                console.log(
                    "[nova call] " + control + ": " + (ok ? "ok" : "not found")
                );
            }
        );
    });
}

// Friendly spoken label for each call control.
function labelFor(control) {
    switch (control) {
        case "pick": return "Picking up the call";
        case "end": return "Ending the call";
        case "mute": return "Muting the call";
        case "unmute": return "Unmuting the call";
        case "deafen": return "Deafening the call";
        case "undeafen": return "Undeafening the call";
        default: return "Okay";
    }
}

// "nova dm marco hey there" (Discord) or "nova message marco hey"
// (Instagram) - open that person's DM thread, type the message into
// the box and hit send automatically.
function sendDm(action) {

    const isDiscord = action.platform !== "instagram";

    const dmUrl = isDiscord
        ? "https://discord.com/channels/@me/" + action.userId
        : "https://www.instagram.com/direct/new/?username=" +
          encodeURIComponent(action.username || "");

    const message = action.message || "";

    // Runs inside the page. Types `text` into the message box (ONLY
    // on the first call, when shouldType is true) and sends it using
    // Discord's REAL React handlers. On retries (shouldType=false) it
    // never re-types - it just tries again to send what's already in
    // the box, so we never get a duplicated "hello hello hello".
    const sendFunc = (text, shouldType) => {

        const setNative = (el, value) => {
            const proto =
                el instanceof HTMLTextAreaElement
                    ? HTMLTextAreaElement.prototype
                    : el instanceof HTMLInputElement
                        ? HTMLInputElement.prototype
                        : null;
            if (proto) {
                const setter = Object.getOwnPropertyDescriptor(
                    proto, "value"
                ).set;
                setter.call(el, value);
            } else {
                el.textContent = value;
            }
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        // Walk React's fiber tree from `node` and invoke the FIRST real
        // handler matching any name in `wanted` (e.g. ["onClick"] or
        // ["onKeyDown"]). React ignores synthetic (untrusted) events,
        // so we call the actual registered handler directly. Returns
        // true if a handler was found and invoked.
        const fireReact = (node, wanted) => {
            if (!node) {
                return false;
            }
            const key = Object.keys(node).find(
                (k) => k.startsWith("__reactFiber$")
            );
            if (!key) {
                return false;
            }
            let fiber = node[key];
            const seen = new Set();
            while (fiber && !seen.has(fiber)) {
                seen.add(fiber);
                const p = fiber.memoizedProps || {};
                for (const name of wanted) {
                    if (typeof p[name] === "function") {
                        try {
                            p[name]({
                                key: "Enter",
                                keyCode: 13,
                                which: 13,
                                code: "Enter",
                                shiftKey: false,
                                ctrlKey: false,
                                altKey: false,
                                metaKey: false,
                                isComposing: false,
                                preventDefault() {},
                                stopPropagation() {},
                                target: node,
                                currentTarget: node,
                                button: 0,
                                detail: 1,
                                clientX: 0,
                                clientY: 0,
                                nativeEvent: { isTrusted: true },
                                isTrusted: true
                            });
                            return true;
                        } catch (e) { /* keep walking */ }
                    }
                }
                fiber = fiber.return;
            }
            return false;
        };

        // Find the message input (Discord: div[role=textbox];
        // Instagram: div[role=textbox] inside the composer).
        const findBox = () =>
            document.querySelector(
                'div[role="textbox"][contenteditable="true"], ' +
                'div[role="textbox"], ' +
                'textarea'
            );

        const box = findBox();
        if (!box) {
            console.log("[Nova send] no message box found");
            return "no-box";
        }
        console.log("[Nova send] box found (shouldType=" + shouldType + "), text=" + JSON.stringify(text));

        // Only type on the very first attempt. On retries the text is
        // already in the box - re-typing would duplicate it into
        // "hello hello hello" and can't be easily undone.
        let committed = false;
        if (shouldType) {

            box.focus();

            // Properly insert the text so Discord's editor STATE updates -
            // not just the visible text. Directly setting .textContent /
            // .value leaves the app model (Slate) unaware, so the Send
            // button stays disabled and Enter has nothing to send.
            // document.execCommand("insertText") commits to the model.
            try {
                document.execCommand("insertText", false, text);
                box.dispatchEvent(
                    new InputEvent("input", {
                        bubbles: true,
                        inputType: "insertText",
                        data: text
                    })
                );
                committed = true;
                console.log("[Nova send] text inserted via execCommand");
            } catch (e) {
                setNative(box, text);
                console.log("[Nova send] execCommand failed, used setNative: " + e.message);
            }
        } else {
            console.log("[Nova send] skipping type (already typed)");
        }

        // Find Discord's Send button. Modern Discord has NO aria-label
        // on it (the icon SVG is aria-hidden), so scan the composer for
        // the active submit-capable button: visible, enabled, with a
        // real React onClick. Anchoring on the textbox avoids clicking
        // unrelated toolbar buttons.
        const findSendButton = () => {
            const boxAncestors = [];
            let cur = box.parentElement;
            for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
                boxAncestors.push(cur);
            }
            const scope = boxAncestors[boxAncestors.length - 1] || document;

            const candidates = [
                ...scope.querySelectorAll("button[type='submit']"),
                ...scope.querySelectorAll(
                    'button[aria-label="Send message"], ' +
                    'button[aria-label*="send"], ' +
                    'button[data-testid*="send"]'
                )
            ];

            for (const b of candidates) {
                if (typeof b.disabled === "boolean" && b.disabled) continue;
                const r = b.getBoundingClientRect();
                if (!r || r.width === 0 || r.height === 0) continue;
                if (rangeOverlaps(box, b)) {
                    console.log("[Nova send] chose candidate button", describeBtn(b));
                    return b;
                }
            }

            // Fallback: Discord's send button is the RIGHTMOST button
            // in the composer, to the right of the textbox (the emoji /
            // attachment buttons are to the LEFT/above the box, so they
            // won't match). Pick the rightmost enabled React button.
            const all = scope.querySelectorAll("button");
            let best = null;
            for (const b of all) {
                if (typeof b.disabled === "boolean" && b.disabled) continue;
                if (b === box) continue;
                if (!Object.keys(b).some((k) => k.startsWith("__reactFiber$"))) continue;
                const r = b.getBoundingClientRect();
                if (!r || r.width === 0 || r.height === 0) continue;
                if (r.left < boxRect(box).left - 5) continue; // must be right of the box
                if (!best || r.left > best.left) best = b;
            }
            if (best) {
                console.log("[Nova send] chose rightmost button", describeBtn(best));
            } else {
                console.log("[Nova send] NO send button found in composer");
            }
            return best;
        };

        // Returns the bounding rect of the message box (so findSendButton
        // can tell the send button apart from left-side emoji/attach).
        const boxRect = (node) => {
            const r = node.getBoundingClientRect();
            return {
                left: r ? r.left : 0,
                right: r ? r.right : 0
            };
        };

        // Short, readable description of a button for the console logs.
        const describeBtn = (b) => {
            return {
                tag: b.tagName,
                type: b.getAttribute("type"),
                disabled: b.disabled,
                label: b.getAttribute("aria-label") || b.getAttribute("title") || "",
                cls: String(b.className || "").slice(0, 40)
            };
        };

        // True when element `a` and `b` are close together on screen
        // (the send button sits inside the composer right by the box).
        const rangeOverlaps = (a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            if (!ra || !rb) return true;
            return !(
                ra.right < rb.left - 10 ||
                rb.right < ra.left - 10 ||
                ra.bottom < rb.top - 10 ||
                rb.bottom < ra.top - 10
            );
        };

        // 1) Press Enter through the box's REAL onKeyDown handler.
        //    Discord's editor commits + sends on Enter, and this is the
        //    most reliable send path. Always try it (box already has
        //    text in the send phase, and having typed text here too).
        if (fireReact(box, ["onKeyDown"])) {
            console.log("[Nova send] fired box onKeyDown Enter -> SENT");
            return "sent";
        }

        // 2) Click the real Send button via its real onClick (the
        //    button enables once the model has text).
        const sendBtn = findSendButton();
        if (sendBtn && fireReact(sendBtn, ["onClick", "onMouseDown"])) {
            console.log("[Nova send] fired send button onClick -> SENT");
            return "sent";
        }
        console.log(
            "[Nova send] send button " +
            (sendBtn ? "found but onClick not invoked" : "not found") +
            "; committed=" + committed
        );

        // 3) Last resort: dispatch a synthetic Enter keydown. (React
        //    usually ignores this, but a contenteditable still shows
        //    the text and some builds pick it up.)
        box.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            })
        );

        console.log("[Nova send] typed only (no send fired)");
        return "typed";
    };

    // Tries to send. `typed` is false until the message has been
    // entered once - after that we NEVER re-type, we only re-attempt
    // the send. Stops after a few quiet retries so it never spams
    // "hello hello hello" and never loops forever.
    // Sends the DM. Two phases, so a slow-loading Discord DM page
    // never races the send:
    //   find -> look for the text box (long wait allowed); once found,
    //           type ONCE and move on.
    //   send -> click the real Send button a few quiet times. NEVER
    //           re-types, so it can't stack "hello hello hello".
    const sendMessage = (tabId) => {
        if (tabId == null) {
            console.log("[Nova send] no tab id");
            return;
        }
        let phase = "find";
        let typedOnce = false;
        let findTries = 0;
        let sendTries = 0;
        const MAX_FIND = 20;  // ~20s to wait for the DM page to load
        const MAX_SEND = 6;   // a few extra send clicks after typing

        const step = () => {
            chrome.scripting.executeScript(
                {
                    target: { tabId },
                    func: sendFunc,
                    args: [message, !typedOnce]
                },
                (res) => {
                    const r =
                        res && res[0] && res[0].result
                            ? res[0].result
                            : "no-box";
                    console.log("[Nova send] phase=" + phase +
                        " typedOnce=" + typedOnce + " result=" + r);
                    if (r === "sent") {
                        return;
                    }
                    if (phase === "find") {
                        if (r !== "no-box") {
                            typedOnce = true;
                            phase = "send";
                            sendTries = 0;
                        } else {
                            findTries++;
                            if (findTries > MAX_FIND) {
                                console.log("[Nova send] GAVE UP - box never appeared");
                                return;
                            }
                            setTimeout(step, 1000);
                            return;
                        }
                    }
                    // phase === "send": text is in the box. Just re-click
                    // the send button - never re-type.
                    if (phase === "send") {
                        sendTries++;
                        if (sendTries > MAX_SEND) {
                            console.log("[Nova send] GAVE UP - typed but not sent");
                            return;
                        }
                        setTimeout(step, 700);
                        return;
                    }
                }
            );
        };
        step();
    };

    // Open (or reuse) the Discord/Instagram DM thread, then send.
    const hostPattern = isDiscord
        ? "https://discord.com/*"
        : "https://www.instagram.com/*";

    chrome.tabs.query({ url: hostPattern }, (existing) => {
        const tabToUse =
            (existing || []).find((t) => t.id != null) || null;

        const go = (tab) => {
            if (!tab || tab.id == null) {
                return;
            }
            chrome.tabs.update(tab.id, { url: dmUrl, active: true }, () => {
                // Wait for the DM and message box to load.
                setTimeout(() => sendMessage(tab.id), 2500);
            });
        };

        if (tabToUse) {
            go(tabToUse);
        } else {
            chrome.tabs.create({ url: dmUrl }, (tab) => {
                setTimeout(() => sendMessage((tab && tab.id) || null), 3000);
            });
        }
    });
}

function pollForCallButton(tabId) {

    // Wait for Discord to fully render the DM header, then trigger the
    // Voice Call button to give the "user just pressed call" illusion.
    // Keeps trying for ~20s.
    //
    // Discord is a React app: JS-dispatched clicks (dispatchEvent /
    // node.click) are untrusted, so React silently ignores them. The
    // store build cannot use the "debugger" permission (Web Store
    // rejects it), so instead we walk React's fiber tree and invoke the
    // button's REAL onClick handler directly - that always works and
    // needs no extra permissions.
    const maxTries = 30;
    let tries = 0;
    let finished = false;

    const finish = () => {
        if (!finished) {
            finished = true;
            clearInterval(poll);
        }
    };

    // Runs inside the Discord page. Find the real call control and
    // trigger it via its React onClick handler. Returns a status:
    //   "called"     -> the voice call button was triggered
    //   "confirm"    -> a call confirmation dialog was accepted
    //   "started"    -> call UI already exists (call underway)
    //   "" (empty)   -> nothing found yet (keep polling)
    const targetFunc = () => {

        // Invoke React's real onClick on a node via its fiber tree.
        // Falls back to a synthetic click chain if no fiber handler is
        // reachable (some nodes keep the listener higher up).
        function fireClick(node) {
            if (!node) {
                return false;
            }

            // 1) Prefer the fiber onClick handler (React-proof).
            const key = Object.keys(node).find(
                (k) => k.startsWith("__reactFiber$")
            );
            if (key) {
                let fiber = node[key];
                const seen = new Set();
                let handler = null;
                while (fiber && !seen.has(fiber)) {
                    seen.add(fiber);
                    const p = fiber.memoizedProps || {};
                    if (typeof p.onClick === "function") {
                        handler = p.onClick;
                        break;
                    }
                    if (typeof p.onMouseDown === "function") {
                        handler = p.onMouseDown;
                        break;
                    }
                    fiber = fiber.return;
                }
                if (handler) {
                    try {
                        handler({
                            target: node,
                            currentTarget: node,
                            preventDefault() {},
                            stopPropagation() {},
                            nativeEvent: { isTrusted: true },
                            isTrusted: true,
                            button: 0,
                            detail: 1,
                            clientX: 0,
                            clientY: 0
                        });
                        return true;
                    } catch (e) {
                        // fall through to synthetic click
                    }
                }
            }

            // 2) Backup: full synthetic event chain.
            try {
                const rect = node.getBoundingClientRect();
                const opts = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2,
                    button: 0,
                    view: window
                };
                node.dispatchEvent(new PointerEvent("pointerdown", opts));
                node.dispatchEvent(new MouseEvent("mousedown", opts));
                node.dispatchEvent(new PointerEvent("pointerup", opts));
                node.dispatchEvent(new MouseEvent("mouseup", opts));
                node.dispatchEvent(new MouseEvent("click", opts));
                if (typeof node.click === "function") {
                    node.click();
                }
                return true;
            } catch (e) {
                return false;
            }
        }

        const matchesLabel = (el) => {
            const label = String(
                el.getAttribute("aria-label") ||
                el.getAttribute("title") ||
                el.getAttribute("data-tooltip") ||
                ""
            ).toLowerCase();
            return (
                label === "call" ||
                label.startsWith("call ") ||
                label.includes("start voice call") ||
                label.includes("voice call") ||
                label.includes("voice call with")
            );
        };

        // DOM introspection so we can see what Discord exposes for the
        // call button (logged back in the extension console).
        const debugCandidates = () => {
            const out = [];
            const els = document.querySelectorAll(
                'button[aria-label], [role="button"][aria-label], [aria-label], ' +
                'button[title], [role="button"][title]'
            );
            for (const el of els) {
                if (out.length >= 15) break;
                const r = el.getBoundingClientRect();
                if (!r || r.width === 0 || r.height === 0) continue;
                out.push({
                    tag: el.tagName,
                    role: el.getAttribute("role") || "",
                    label: el.getAttribute("aria-label") || "",
                    title: el.getAttribute("title") || "",
                    cls: (el.className && String(el.className).slice(0, 50)) || ""
                });
            }
            return out;
        };

        // 0) Already in a call with someone in this DM -> done.
        const callUi = document.querySelector(
            '.callContainer, [class*="callContainer"], [class*="voiceCall"], ' +
            '[class*="callStatus"], [aria-label*="call in progress"]'
        );
        if (callUi) {
            return "started";
        }

        // 1) The DM header voice-call phone button. Discord marks the
        // header control with a phone icon and an aria-label like
        // "Call (Name)" / "Voice Call".
        const buttons = document.querySelectorAll(
            'button[aria-label], [role="button"][aria-label], ' +
            'button[data-testid*="call"], [data-testid*="callbutton"]'
        );

        for (const b of buttons) {
            if (matchesLabel(b)) {
                if (fireClick(b)) {
                    return "called";
                }
            }
        }

        // 2) Camera / video call control (also fine to ring).
        const videoButtons = document.querySelectorAll(
            'button[aria-label*="video"], [aria-label*="start video call"]'
        );
        for (const b of videoButtons) {
            if (fireClick(b)) {
                return "called";
            }
        }

        // 3) Fallback: the phone/call icon button, matched by its
        // title attribute or tooltip.
        const titled = document.querySelectorAll('[title], [data-tooltip]');
        for (const t of titled) {
            if (matchesLabel(t)) {
                if (fireClick(t)) {
                    return "called";
                }
            }
        }

        // 4) Discord sometimes shows a confirmation dialog before
        // connecting ("This call is currently with Mr. Jim Beam...").
        // Accept it so the ring actually goes through.
        const confirm = document.querySelector(
            '.modal [class*="confirm"], [role="dialog"] video + div button, ' +
            '[class*="callAfterGlow"], button[class*="colorBrand"]'
        );
        const confirmBtns = document.querySelectorAll(
            '[role="dialog"] button, [class*="modal"] button'
        );
        for (const b of confirmBtns) {
            const txt = String(b.textContent || "").toLowerCase();
            // Only accept buttons that clearly confirm a call/action.
            if (/\b(call|ring|accept|yes|start|connect|join)\b/.test(txt)) {
                if (fireClick(b)) {
                    return "confirm";
                }
            }
        }
        if (confirm) {
            if (fireClick(confirm)) {
                return "confirm";
            }
        }

        // Nothing matched this pass. Include DOM introspection so we can
        // see what Discord exposes (parsed in the poll callback).
        return "__NONE__" + JSON.stringify(debugCandidates());
    };

    const poll = setInterval(() => {

        tries++;

        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: targetFunc
            },
            (res) => {

                const status =
                    res && res[0] && typeof res[0].result === "string"
                        ? res[0].result
                        : "";

                // Log DOM introspection once so we can see what Discord
                // actually exposes for the call button.
                if (status.indexOf("__NONE__") === 0) {
                    if (tries === 1) {
                        try {
                            const debug = JSON.parse(status.slice(8));
                            console.log("[nova call] candidates:", debug);
                        } catch (e) {
                            console.log("[nova call] none; raw:", status);
                        }
                    }
                }

                const cleanStatus =
                    status.indexOf("__NONE__") === 0
                        ? "none"
                        : status;

                if (cleanStatus === "started") {
                    // Call UI already present - nothing to press.
                    finish();
                    return;
                }

                if (cleanStatus === "called" || cleanStatus === "confirm") {
                    // Give the call a beat to boot, then stop.
                    setTimeout(finish, 600);
                    return;
                }

                if (tries >= maxTries) {
                    finish();
                }
            }
        );
    }, 700);
}

// "nova play barsaat" - fetch YouTube search results, grab the
// most relevant (first) video id, and open it as an autoplaying
// video. Falls back to the search page if it can't find one.
// When useSameTab is true the video opens in the CURRENT tab
// instead of a new one.
async function playOnYouTube(query, useSameTab) {

    const q = encodeURIComponent(
        String(query || "").trim()
    );

    const searchUrl =
        "https://www.youtube.com/results?search_query=" +
        q;

    const openTab = (url) => {

        if (useSameTab) {

            chrome.tabs.query(
                { active: true, currentWindow: true },
                (tabs) => {

                    if (tabs && tabs[0] && tabs[0].id) {
                        chrome.tabs.update(tabs[0].id, { url });
                        return;
                    }

                    chrome.tabs.create({ url });
                }
            );

            return;
        }

        chrome.tabs.create({ url });
    };

    try {

        const response =
            await fetch(searchUrl);

        const html =
            await response.text();

        // YouTube embeds the results as JSON containing
        // "videoId":"XXXX" for each video.
        const match =
            html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);

        if (match && match[1]) {

            openTab(
                "https://www.youtube.com/watch?v=" +
                match[1]
            );

            return;
        }

    } catch (e) {
        console.log("Play fetch failed:", e);
    }

    // Fallback - just open the search results.
    openTab(searchUrl);
}


// ======================================
// TARGET TAB
// ======================================

// The voice page runs in its own tab, so we
// must act on the last real website tab instead.

function runOnTargetTab(callback) {

    const extensionUrl =
        chrome.runtime.getURL("");

    chrome.tabs.query({}, (tabs) => {

        const isAllowed = (t) => {
            if (t.id == null || !t.url) {
                return false;
            }
            return (
                !t.url.startsWith(extensionUrl) &&
                !t.url.startsWith("chrome-extension://") &&
                !t.url.startsWith("http://localhost:3000")
            );
        };

        const candidates = tabs.filter(isAllowed);

        const target =
            candidates.find((t) => t.active) ||
            candidates[candidates.length - 1] ||
            (tabs.find((t) => t.active) || null);

        if (target) {

            callback(target);

        } else {

            const message =
                "No website tab to act on";

            result.textContent = message;

            speak(message);
        }
    });
}


// Close the tab(s) for a named site, song, or the current tab.
// action.target = SITE_ALIASES key, action.url = domain,
// action.title = song/app name found in a tab title/URL,
// action.active = the tab you are looking at.
// action.all closes every match; without it, the most relevant one
// (the active tab is preferred when it matches).
function closeMatchingTabs(action) {

    const extensionUrl = chrome.runtime.getURL("");

    // "Real tab" = anything we can close/act on, INCLUDING a blank
    // new-tab page (edge://newtab) that the user just opened. Only the
    // extension's own pages and the local backend are excluded.
    const isRealTab = (t) =>
        t.id != null &&
        t.url &&
        !t.url.startsWith(extensionUrl) &&
        !t.url.startsWith("chrome-extension://") &&
        !t.url.startsWith("http://localhost:3000");

    const matches = (t) => {

        if (action.active) {
            return t.active;
        }

        if (action.url || action.target) {

            const url =
                action.url ||
                (action.target && SITE_ALIASES[action.target]
                    ? SITE_ALIASES[action.target]
                    : "");

            const key = String(url)
                .replace(/^https?:\/\//i, "")
                .replace(/\/.*$/, "");

            return Boolean(t.url) && t.url.includes(key);
        }

        if (action.title) {

            const name = action.title.toLowerCase();

            return (
                (t.title || "").toLowerCase().includes(name) ||
                (t.url || "").toLowerCase().includes(name)
            );
        }

        return false;
    };

    // No selector at all (e.g. the AI said "close the tab"): fall
    // back to the last real website tab.
    if (!action.active && !action.url && !action.target && !action.title) {
        runOnTargetTab(
            (tab) => chrome.tabs.remove(tab.id)
        );
        return;
    }

    if (action.active) {

        chrome.tabs.query(
            { active: true, currentWindow: true },
            (tabs) => {

                const t = tabs && tabs[0];

                if (t && isRealTab(t)) {

                    chrome.tabs.remove(t.id);

                } else {

                    runOnTargetTab(
                        (tab) => chrome.tabs.remove(tab.id)
                    );
                }
            }
        );

        return;
    }

    chrome.tabs.query({}, (tabs) => {

        const found = (tabs || []).filter(isRealTab).filter(matches);

        if (!found.length) {

            const what = action.title
                ? action.title
                : action.url
                    ? siteName(action.url)
                    : action.target
                        ? siteName(SITE_ALIASES[action.target])
                        : "tab";

            const message = "No " + what + " tab open";

            result.textContent = message;

            speak(message);

            return;
        }

        const closing =
            action.all
                ? found
                : [
                    found.find((t) => t.active) ||
                    found[0]
                  ];

        chrome.tabs.remove(closing.map((t) => t.id));
    });
}


// ======================================
// LOCAL FALLBACK
// ======================================

// Used when the AI backend is not running,
// so common commands still work.

function localFallback(command) {

    const lower =
        command.toLowerCase();

    const commonSites = {
        youtube: "https://www.youtube.com",
        google: "https://www.google.com",
        chatgpt: "https://chatgpt.com",
        gmail: "https://mail.google.com",
        github: "https://github.com",
        facebook: "https://www.facebook.com",
        instagram: "https://www.instagram.com",
        amazon: "https://www.amazon.com",
        netflix: "https://www.netflix.com",
        spotify: "https://open.spotify.com",
        whatsapp: "https://web.whatsapp.com"
    };

    for (const name in commonSites) {

        if (lower.includes(name)) {

            chrome.tabs.create({
                url: commonSites[name]
            });

            return;
        }
    }

    let searchText = command;

    const prefixes =
        ["search ", "google ", "look up ", "find "];

    let target;
    let usedPrefix = false;

    for (const p of prefixes) {
        if (lower.startsWith(p)) {
            const rest = lower.replace(p, "").trim();
            const parsed = parseSearchTarget(rest);
            searchText = parsed.query || rest;
            target = parsed.target;
            if (p !== "google ") {
                usedPrefix = true;
            }
            break;
        }
    }

    // If no search prefix was present but the text names a target
    // ("use duckduckgo for cats"), parse that too.
    if (!target && !usedPrefix) {
        const parsed = parseSearchTarget(searchText);
        if (parsed.target && parsed.query) {
            target = parsed.target;
            searchText = parsed.query;
        }
    }

    // Only search for a real search intent: an explicit
    // "search / look up / find / google" prefix, or a natural
    // question word (what / when / how / who / whose / where / why).
    // Anything else is not understood - never default to a search
    // (a misheard "cale marco" should NOT become a web search).
    const isSearchIntent =
        usedPrefix ||
        /^google\s+/i.test(lower.trim()) ||
        QUESTION_STARTERS.some((re) => re.test(lower.trim()));

    if (!isSearchIntent) {
        // Stay silent and just keep listening so the user can speak
        // again - no feedback, no backend, no search.
        return;
    }

    searchWeb(searchText, target);
}


// ======================================
// FEEDBACK
// ======================================

// Turns a URL into a friendly spoken site name,
// e.g. "https://www.youtube.com" -> "YouTube",
// "https://mail.google.com" -> "Google".
function siteName(url) {

    try {

        let host = String(url)
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .split("/")[0];

        const parts = host.split(".");

        // "mail.google.com" -> "google", "youtube.com" -> "youtube"
        if (parts.length >= 3 && !/^\d+$/.test(parts[0])) {
            host = parts[parts.length - 2];
        }

        return host || "that site";

    } catch (e) {
        return "that site";
    }
}

function describeAction(action) {

    switch (action.action) {

        case "OPEN_URL":

            return "Opening " + siteName(action.url);

        case "SEARCH":

            {
                const name = searchTargetLabel(action.engine);
                return (
                    "Searching " +
                    (name ? name : "Bing") +
                    " for " + action.query
                );
            }

        case "ALERT":

            return action.message || "Didn't understand";

        case "CALL_DM":

            return "Calling " + (action.name || "your friend");

        case "DISCORD_CALL_CONTROL":

            return labelFor(action.control);

        case "SEND_DM":

            return (
                "Sending " +
                (action.platform === "instagram" ? "Instagram" : "Discord") +
                " message to " +
                (action.name || "your friend")
            );

        case "PLAY":

            return "Playing " + action.query;

        case "NEW_TAB":
            return "Opening a new tab";

        case "CLOSE_TAB":
            if (action.title) {
                return "Closing " +
                    String(action.title).replace(/\b\w/g, (c) => c.toUpperCase());
            }
            if (action.active) {
                return "Closing this tab";
            }
            if (action.target && SITE_ALIASES[action.target]) {
                return "Closing " +
                    siteName(SITE_ALIASES[action.target]);
            }
            if (action.url) {
                return "Closing " + siteName(action.url);
            }
            return "Closing the current tab";

        case "CLOSE_BROWSER":
            return "Closing the browser";

        case "PLAY_PAUSE":
            return action.mode === "pause"
                ? "Pausing the video"
                : "Playing the video";

        case "GO_BACK":
            return "Going back";

        case "GO_FORWARD":
            return "Going forward";

        case "RELOAD":
            return "Reloading the page";

        case "SCROLL":
            return "Scrolling " +
                (action.direction === "up" ? "up" : "down");

        case "VOLUME":
            if (action.mode === "mute") return "Muted";
            if (action.mode === "unmute") return "Volume on";
            if (action.mode === "up") return "Volume up";
            if (action.mode === "down") return "Volume down";
            if (action.value == null) return "Setting volume";
            return "Setting volume to " +
                Math.round(action.value * 100) + "%";

        case "NEXT_SHORT":
            return "Next short";

        case "PREV_SHORT":
            return "Previous short";

        default:
            return "Command received";
    }
}

function speak(message) {

    try {

        const utterance =
            new SpeechSynthesisUtterance(message);

        // Remember what Nova said so the echo-suppression in
        // onresult can ignore her own voice if it's picked up.
        lastSpokenText = message.toLowerCase().trim();

        utterance.lang = "en-US";
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        speechSynthesis.cancel();

        speechSynthesis.speak(utterance);

    } catch (error) {
        console.log(error);
    }
}
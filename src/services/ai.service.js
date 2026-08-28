const config = require("../config/env");

const SYSTEM_INSTRUCTIONS = `
You are Hey Nova, a browser voice assistant.
The user speaks a command and you convert it into a JSON
ARRAY of browser actions the extension can execute, in order.

ALWAYS return a JSON array, even for a single action:
[{"action":"..."}]

Supported actions - use exactly these:

1. {"action":"OPEN_URL","url":"https://..."}
   Opens a website. Use the official URL for the site
   the user mentions. Always start with https:// and
   never include spaces.

2. {"action":"SEARCH","query":"...","engine":"bing"}
   Searches the web with Microsoft Edge (Bing).
   Use "engine":"youtube" to search YouTube instead.
   Use this for any question, lookup, "play X on
   youtube", "find", "google", animations, videos, etc.
   When the user says "on youtube", "on yt", or "yt",
   use "engine":"youtube".

3. {"action":"NEW_TAB"}
   Opens a new blank tab.

4. {"action":"CLOSE_TAB","target":"youtube"}
   Closes the tab for a named site. target is the site name
   ("youtube", "google", "chatgpt", ...). Without target, closes
   the current tab.

5. {"action":"GO_BACK"}
   Goes back one page in the current tab.

6. {"action":"GO_FORWARD"}
   Goes forward one page in the current tab.

7. {"action":"RELOAD"}
   Refreshes the current page.

8. {"action":"SCROLL","direction":"down"}
   Scrolls the current page. direction is "up" or "down".
   "down" is the default.

9. {"action":"VOLUME","mode":"up"}
   Controls the video/audio playing in the current tab
   (YouTube, Spotify web, etc.).
   mode is one of: "up", "down", "set", "mute", "unmute".
   For "set", include "value" between 0 and 1
   ("half" -> 0.5, "max"/"full" -> 1, "30 percent" -> 0.3).
   For "up"/"down", "step" is optional (0.1 default;
   0.5 for "by half").

10. {"action":"PLAY_PAUSE","mode":"pause"}
    Controls the video/audio playing in the current tab.
    mode is "pause" or "play". A bare "play" (no song name)
    means "play".

11. {"action":"CLOSE_BROWSER"}
    Closes the whole browser (all windows).
    Only for "close the browser" / "close edge" / "close everything".

Rules:
- Return ONLY the raw JSON array. No markdown, no code
  fences, no explanations, no extra words.
- If the user names a website, use OPEN_URL.
- If the user asks a question or wants to find/play/learn
  something, use SEARCH with that thing as the query.
- If the user gives a multi-step command, break it into
  MULTIPLE actions in order. Example: "open youtube and
  search cats" is TWO actions.
- If the command is unclear, use SEARCH with the whole
  command as the query so the user still gets results.
- Never invent actions outside the list above.

Examples:
"open youtube" -> [{"action":"OPEN_URL","url":"https://www.youtube.com"}]
"open gmail" -> [{"action":"OPEN_URL","url":"https://mail.google.com"}]
"play shape of you on youtube" -> [{"action":"SEARCH","query":"shape of you","engine":"youtube"}]
"search java tutorials" -> [{"action":"SEARCH","query":"java tutorials"}]
"what is the weather in london" -> [{"action":"SEARCH","query":"what is the weather in london"}]
"google hello world html" -> [{"action":"SEARCH","query":"hello world html"}]
"open youtube and search cats" -> [{"action":"OPEN_URL","url":"https://www.youtube.com"},{"action":"SEARCH","query":"cats","engine":"youtube"}]
"go back" -> [{"action":"GO_BACK"}]
"go forward" -> [{"action":"GO_FORWARD"}]
"reload the page" -> [{"action":"RELOAD"}]
"scroll down" -> [{"action":"SCROLL","direction":"down"}]
"volume up" -> [{"action":"VOLUME","mode":"up"}]
"decrease volume by half" -> [{"action":"VOLUME","mode":"down","step":0.5}]
"set volume to 30 percent" -> [{"action":"VOLUME","mode":"set","value":0.3}]
"maximize the volume" -> [{"action":"VOLUME","mode":"set","value":1}]
"mute the tab" -> [{"action":"VOLUME","mode":"mute"}]
"pause the video" -> [{"action":"PLAY_PAUSE","mode":"pause"}]
"resume the video" -> [{"action":"PLAY_PAUSE","mode":"play"}]
"play" -> [{"action":"PLAY_PAUSE","mode":"play"}]
"close youtube" -> [{"action":"CLOSE_TAB","target":"youtube"}]
"close the tab" -> [{"action":"CLOSE_TAB"}]
"close the browser" -> [{"action":"CLOSE_BROWSER"}]
"new tab" -> [{"action":"NEW_TAB"}]
`;

// Common sites with their official URLs, checked before Ollama
// so the most frequent commands never make a slow AI request.
// Includes a big map of aliases / shorthands / number shortcuts.
const COMMON_SITES = {
    // Numbers
    "1": "https://www.youtube.com",
    "2": "https://www.google.com",
    "3": "https://mail.google.com",
    "4": "https://chatgpt.com",
    "5": "https://github.com",
    "6": "https://www.facebook.com",
    "7": "https://www.instagram.com",
    "8": "https://www.amazon.com",
    "9": "https://www.netflix.com",
    "10": "https://web.whatsapp.com",

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
    gemini: "https://gemini.google.com"
};

const OPEN_PREFIXES = ["open ", "go to ", "take me to ", "visit ", "launch ", "start ", "navigate to ", "open up ", "pull up "];
const SEARCH_PREFIXES = ["search ", "google ", "look up ", "find "];
const QUESTION_STARTERS = [
    /^(what|what's|whats|who|who's|whos|when|where|why|how|is|are|can|does|do|did|tell me about|give me|latest|news on|explain|define|meaning of)\b/i
];

function toUrl(name) {
    return COMMON_SITES[name];
}

/**
 * Matches ONE command segment to an action, or null.
 */
function matchSingle(command) {
    const lower = " " + String(command).toLowerCase().trim() + " ";
    const trimmed = String(command).trim().toLowerCase();

    // Navigation / tab actions
    if (/\bnew tab\b/.test(lower)) return { action: "NEW_TAB" };

    // CLOSE - "close the tab" closes the last real tab; naming a
    // site ("close youtube") closes that site's tab(s).
    if (/\bclose\b/.test(lower)) {

        // "close the browser" / "close edge" / "close everything"
        if (/\b(browser|edge|chrome|window|everything|all tabs)\b/.test(lower)) {
            return { action: "CLOSE_BROWSER" };
        }

        if (/\bclose (the|this|that|current|open)?\s*tab\b/.test(lower)) {
            return { action: "CLOSE_TAB" };
        }

        const closeName = trimmed
            .replace(/^close\b/, "")
            .replace(/^(the|that|this|my)\s+/i, "")
            .trim();

        if (closeName) {
            for (const name in COMMON_SITES) {
                if (/^\d+$/.test(name)) continue;
                if (
                    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
                        .test(" " + closeName + " ")
                ) {
                    return { action: "CLOSE_TAB", target: name };
                }
            }
            const dom = closeName.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
            if (dom) {
                return { action: "CLOSE_TAB", url: "https://" + dom[1].toLowerCase() };
            }
        }
    }

    // PLAY/PAUSE - control the video playing in the current tab
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
    if (/\bgo back\b/.test(lower) || /\bback(page|wards)?\b/.test(lower)) return { action: "GO_BACK" };
    if (/\bgo forward\b/.test(lower) || /\bforward\b/.test(lower)) return { action: "GO_FORWARD" };
    if (/\breload\b/.test(lower) || /\brefresh\b/.test(lower)) return { action: "RELOAD" };
    if (/\bscroll\b/.test(lower)) {
        const direction = /\bup\b/.test(lower) ? "up" : "down";
        return { action: "SCROLL", direction };
    }

    // VOLUME - control the video/audio playing in the current tab
    if (
        /\bvolume\b/.test(lower) ||
        /\b(louder|quieter)\b/.test(lower) ||
        /\bmute\b/.test(lower) ||
        /\bunmute\b/.test(lower)
    ) {

        if (/\bmute\b/.test(lower) && !/\bunmute\b/.test(lower)) {
            return { action: "VOLUME", mode: "mute" };
        }

        if (/\bunmute\b/.test(lower)) {
            return { action: "VOLUME", mode: "unmute" };
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
                action: "VOLUME", mode: "set",
                value: Math.max(0, Math.min(1, Number(pct[1]) / 100))
            };
        }

        if (/\b(max|maximum|full)\b/.test(lower)) {
            return { action: "VOLUME", mode: "set", value: 1 };
        }

        if (/\bhalf\b/.test(lower) && !/\bby half\b/.test(lower)) {
            return { action: "VOLUME", mode: "set", value: 0.5 };
        }

        if (up) return { action: "VOLUME", mode: "up", step };

        if (down) return { action: "VOLUME", mode: "down", step };

        return { action: "VOLUME", mode: "up", step: 0.1 };
    }

    // YouTube first (play/playlist/watch on youtube)
    if (/\bon youtube\b/.test(lower) || /\b(?:youtube|yt)\b/.test(lower)) {
        if (/\bopen\b/.test(lower) && !/\bplay\b/.test(lower) && !/\bsearch\b/.test(lower)) {
            return { action: "OPEN_URL", url: COMMON_SITES.youtube };
        }
        const q = String(command)
            .replace(/\b(hey nova|on youtube|on yt|youtube|yt|play|watch|search)\b/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
        return { action: "SEARCH", query: q || "youtube", engine: "youtube" };
    }

    // Known site -> OPEN_URL (only when there's an open/visit intent)
    for (const name in COMMON_SITES) {
        const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`\\b${esc}\\b`).test(lower)) {
            const opened = OPEN_PREFIXES.some((p) => lower.includes(p));
            if (opened || /\b(open|go|open up)\b/.test(lower)) {
                return { action: "OPEN_URL", url: toUrl(name) };
            }
        }
    }

    // Spoken URL -> OPEN_URL
    // e.g. "open discord.gg", "go to google.com"
    const domainMatch = trimmed.match(
        /^(?:open|go to|take me to|visit|launch|start|navigate to|open up)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)\s*$/
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
        return { action: "SEARCH", query: trimmed };
    }

    // Search intent
    for (const p of SEARCH_PREFIXES) {
        if (trimmed.startsWith(p)) {
            return { action: "SEARCH", query: trimmed.replace(p, "").trim() };
        }
    }

    return null;
}

// Only split a compound command here if the part that follows
// actually starts with a command word.
const SPLIT_STARTERS = [
    /^open\b/i, /^go\s+to\b/i, /^go\s+back\b/i, /^go\s+forward\b/i,
    /^take\s+me\s+to\b/i, /^visit\b/i, /^launch\b/i, /^start\b/i,
    /^search\b/i, /^look\s+up\b/i, /^find\b/i, /^play\b/i, /^what\s+is\b/i,
    /^close\b/i, /^scroll\b/i, /^reload\b/i, /^refresh\b/i,
    /^new\s+tab\b/i, /^navigate\s+to\b/i, /^open\s+up\b/i, /^google\b/i
];

function splitForMatching(command) {
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

        if (SPLIT_STARTERS.some((r) => r.test(cur))) {
            result.push(cur);
        } else {
            result[prevIdx] = result[prevIdx] + " " + cur;
        }
    }

    return result.filter(Boolean);
}

/**
 * Tries to resolve a command locally without any AI call.
 * Returns an array of actions, or null if it needs the AI.
 */
function matchLocally(command) {

    const parts = splitForMatching(command);

    const actions = [];

    for (const part of parts) {

        const match = matchSingle(part);

        if (!match) {
            // Part fell through - let the AI handle the whole thing
            return null;
        }

        actions.push(match);
    }

    return actions.length ? actions : null;
}

/**
 * Strips markdown fences / extra text and returns an ARRAY of actions.
 * Accepts either a JSON array or a single JSON object.
 */
function cleanJson(text) {

    let cleaned = String(text).trim();

    // Remove markdown code fences if the model adds them
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);

    if (fence) {
        cleaned = fence[1].trim();
    }

    // Fall back to the first { ... } block in the text
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.slice(start, end + 1);
    }

    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
        // Normalize each entry to have an action (fall back to SEARCH)
        return parsed
            .filter((a) => a && typeof a === "object" && a.action)
            .map((a) => (a.action ? a : { action: "SEARCH", query: String(a.query || "search") }));
    }

    if (parsed && typeof parsed === "object" && parsed.action) {
        return [parsed];
    }

    // Shouldn't happen - fall back to searching the raw command
    return [{ action: "SEARCH", query: String(text).trim() || "search" }];
}

/**
 * Turns a spoken command into a list of browser actions.
 * Fast local matching first, then local Ollama.
 * Always returns an array of action objects.
 */
async function parseCommand(command) {

    const local = matchLocally(command);

    if (local) {
        return Array.isArray(local) ? local : [local];
    }

    return parseWithOllama(command);
}

async function parseWithOllama(command) {

    const response = await fetch(

        `${config.ollamaUrl}/api/chat`,

        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                model: config.ollamaModel,
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_INSTRUCTIONS
                    },
                    {
                        role: "user",
                        content: command
                    }
                ],
                stream: false,
                options: {
                    temperature: 0
                }
            })
        }
    );

    if (!response.ok) {

        throw new Error(
            `Ollama error ${response.status}: ${await response.text()}`
        );
    }

    const data = await response.json();

    const text = data.message && data.message.content;

    if (!text) {
        throw new Error("Ollama returned an empty response.");
    }

    return cleanJson(text);
}

module.exports = {
    parseCommand
};

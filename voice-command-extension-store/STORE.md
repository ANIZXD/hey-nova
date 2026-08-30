# Hey Nova — Store listing pack

Everything you paste into the Chrome Web Store / Edge Add-ons dashboard.
Upload the zipped `eagle` folder; this folder is
the "publish build" — your personal dev copy in
`../owl` is intentionally untouched.

Current published build: **v2.2.0**

## 1. Store summary (20–60 chars)

> Hands-free voice control for your browser

## 2. Full description

> **Hey Nova turns your microphone into a browser remote control.**
>
> Say **"Hey Nova, open YouTube"** and YouTube opens. Say
> **"Hey Nova, search java tutorials"**, **"play shape of you"**,
> **"close the tab"**, **"scroll down"**, **"go back"**, or even
> **"nova call <friend>"** for a Discord voice call — Nova hears the
> wake word and does it.
>
> **New in v2.2.0:**
> - **Always-on wake word in the background** — say "Hey Nova" even
>   when the assistant tab isn't open and Nova wakes up and listens.
> - **Save sites by voice** — "save this site as school" then
>   "open school" anytime.
> - **Discord contacts** — add multiple contacts with a Discord ID
>   ("save jane as my discord id 123..."), DM or call any of them,
>   and pick a default.
> - **Window control** — "minimize", "maximize", "fullscreen",
>   "snap left / right", and "previous tab".
>
> **Works instantly, no accounts, no cloud.** Every common command is
> resolved 100% locally inside the extension — your audio and your
> commands never leave your browser. Great for speed and for privacy.
>
> **Optional AI for power users.** Install Ollama (free at ollama.com)
> plus the Hey Nova local server, and the moment they're running Nova
> detects them (the popup chip turns green) and understands
> natural-language commands — "what's the weather in London?" becomes a
> search, "new tab and search pandas" becomes two actions.
>
> ### Try saying
> - "Hey Nova, open youtube"
> - "Hey Nova, search java tutorials"
> - "Hey Nova, play barsaat"
> - "Hey Nova, open discord.gg"
> - "Hey Nova, close the tab"
> - "Hey Nova, close youtube"
> - "Hey Nova, close the browser"
> - "Hey Nova, pause the video"
> - "Hey Nova, scroll down"
> - "Hey Nova, volume up"
> - "Hey Nova, set volume to half"
> - "Hey Nova, go back"
> - "Hey Nova, previous tab"
> - "Hey Nova, new tab"
> - "Hey Nova, minimize the browser"
> - "Hey Nova, open in fullscreen"
> - "Hey Nova, save this site as school"
> - "Hey Nova, open school"
> - "Hey Nova, save jane as my discord id 555123456"
> - "Hey Nova, dm jane hey whats up"
> - "Hey Nova, call jane"
> - "Hey Nova, what is the weather in London" (with AI)
> - "Hey Nova, call gooner" (with AI targets configured)

## 3. Single purpose (for the review questionnaire)

> Voice control of the browser: converting spoken commands into browser
> actions (opening sites, searching, and tab controls).

## 4. Permission justification (paste where asked)

| Permission                             | Why it's needed                                            |
| -------------------------------------- | ---------------------------------------------------------- |
| `tabs`                                 | Open / close / navigate / act on the user's tabs on command |
| `scripting`                            | Scroll the page and send navigation keys (YouTube Shorts)  |
| `windows`                              | Minimize / maximize / fullscreen / snap window on command  |
| `offscreen`                            | Run the always-on background wake-word listener            |
| `storage`                              | Save the user's sites and Discord contacts by voice        |
| `<all_urls>` (host)                    | Run those actions on whichever site the user is viewing    |
| `http://localhost:3000/*` (host)       | Only if the user runs the optional local AI server         |

Audio is captured **only** while the user presses Start Listening and is
processed by the browser's built-in speech engine — it is never sent to
any server by the extension itself.

## 5. Local AI setup guide (for another user)

Copy-paste to anyone running the extension who wants the AI upgrade.

> ### Turn on Nova's AI (takes ~5 minutes, free)
>
> Everything works without this, but with the AI on, Nova understands
> natural language — "what's the weather in London?" becomes a search,
> "new tab and search pandas" becomes two actions.
>
> **1. (Easiest) Double-click the setup file** — Windows:
> - Open the `server` folder and double-click **`run-nova-ai.bat`**.
> - It installs Node.js and Ollama for you (click Yes if Windows asks),
>   downloads the AI model, then starts the server. Done.
> - Mac/Linux: open a terminal in the `server` folder and run
>   `chmod +x run-nova-ai.sh && ./run-nova-ai.sh`
>
> **Or set it up manually (same result, 4 steps):**
>
> **1. Install the two free tools** (both one-click installers):
> - Node.js → https://nodejs.org (pick the LTS version)
> - Ollama → https://ollama.com
>
> **2. Start the Hey Nova server**
> - Open the `server` folder from this project (look for the file
>   `package.json` inside it).
> - Open a terminal / CMD in that folder and run:
> - `npm install` (once, downloads dependencies)
> - `npm start`
> - You should see something like "listening on http://localhost:3000".
> - Leave that terminal window open in the background.
>
> **3. Pull the small AI model (once, ~500 MB)**
> - In another terminal run: `ollama pull qwen3:0.6b`
>
> **4. Back in the extension**
> - Open the popup (click the Nova icon) — the AI chip turns green
>   within ~15 seconds and commands auto-switch to AI.
> - No restart needed. The extension re-checks every 15 seconds, so if
>   you close and reopen the server later it automatically recovers.
>
> **Troubleshooting**
> - Server won't start: make sure Node.js is installed, then run
>   `npm install` again in the server folder.
> - Chip stays amber: confirm `localhost:3000` opens in your browser,
>   and that you started the server *after* opening the extension.
> - Windows firewall prompt: choose "Allow".

## 6. Privacy policy (paste or host)

> **Hey Nova does not collect personal data.**
>
> - Voice is captured by your browser's built-in speech recognition and
>   remains on your device.
> - The extension never sends audio anywhere.
> - With the optional local AI setup, only the text of a command may be
>   sent to an AI server that **you** run on your own machine.
> - No analytics, no tracking, no account, no network requests except
>   the actions you ask for (opening sites / searches) and the optional
>   local AI check.
>
> Contact: [your email / your site]

## 7. Screenshots (see `screenshots/` after running the generator)

- `voice-1280.png` — the assistant page (main screenshot, 1280×800)
- `popup-640.png` — the popup with the AI status chip (640×400)

## 8. Upload checklist

- [ ] Zip `eagle` → upload to
      Chrome Web Store (one-time $5) and/or Edge Add-ons (free)
- [ ] Paste summary / description / permissions (above)
- [ ] Screenshots from `screenshots/`
- [ ] Icon 128px included in the manifest
- [ ] Keep the free version fully offline-first
# Hey Nova — Voice Command Browser Assistant

Say any command, Hey Nova understands it with AI and controls your browser.

## Quick start (Windows — easiest)

1. Install **Node.js** from https://nodejs.org (first time only).
2. Double-click **`run-nova-ai.bat`** in this folder.
   It installs what's missing, downloads the AI model, and starts the
   server at **http://localhost:3000**.
3. Open the Hey Nova extension — the popup AI chip turns green within
   ~15 seconds and commands auto-switch to AI.

**Mac / Linux:** open a terminal in this folder and run
`chmod +x run-nova-ai.sh && ./run-nova-ai.sh`

## Parts

```
hey-nova/
├── server/                       Backend (AI command parser)
│   ├── .env                      Your API keys (never commit this)
│   ├── src/
│   │   ├── server.js             Entry point — starts the API
│   │   ├── app.js                Express app + middleware
│   │   ├── config/env.js         Reads .env, validates config
│   │   ├── routes/               API routes (/command)
│   │   ├── controllers/          Request handlers
│   │   └── services/ai.service.js  Turns speech into a browser action
│   └── package.json
│
└── voice-command-extension/      Chrome / Edge extension
    ├── manifest.json
    ├── popup.html / popup.js     Extension popup
    └── voice/
        ├── voice.html            Voice listening page
        ├── voice.js              Speech → backend → executes action
        └── voice.css
```

## 1. Start the backend

```bash
cd server
npm install
npm start          # runs on http://localhost:3000
```

Requires Node.js 22+. Create `.env` from `.env.example` and set your settings.

### AI provider (choose how commands are understood)

| `AI_PROVIDER` | What it does                                          |
| ------------- | ----------------------------------------------------- |
| `auto`        | Tries OpenAI, falls back to local Ollama if the key fails (default) |
| `openai`      | Uses OpenAI only (`OPENAI_API_KEY` + `OPENAI_MODEL`)  |
| `ollama`      | Uses free local AI only - no API key needed           |

For Ollama (free, runs offline):

```bash
# install Ollama from https://ollama.com - it must be running
ollama pull qwen3:0.6b    # small model, ~500 MB
```

Then set `AI_PROVIDER=ollama` in `.env` (or keep `auto`). Change `OLLAMA_MODEL`
if you want a bigger/better model (e.g. `qwen3:4b`, `llama3.2`).

### Test it

```bash
curl -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"open youtube\"}"
```

Returns the browser action, for example:

```json
{
  "success": true,
  "command": "open youtube",
  "action": { "action": "OPEN_URL", "url": "https://www.youtube.com" }
}
```

## 2. Load the extension

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `voice-command-extension` folder.
4. Click the Hey Nova icon, then **Start Listening**.
5. Say **"Hey Nova, open youtube"** or **"Hey Nova, what is the weather in London"**.

## Supported actions

| Command you say                  | Action Hey Nova performs            |
| -------------------------------- | ----------------------------------- |
| "open youtube"                   | Opens https://www.youtube.com       |
| "search java tutorials"          | Google search                       |
| "play shape of you on youtube"   | YouTube search                      |
| "what is the weather in London"  | Google search                       |
| "go back" / "go forward"         | Previous / next page                |
| "reload the page"                | Refreshes the tab                   |
| "scroll down" / "scroll up"      | Scrolls the current page            |
| "close the tab"                  | Closes the current tab              |
| "new tab"                        | Opens a new blank tab               |
| anything else                    | Falls back to a Google search       |

If the backend is not running, the extension still handles common commands
(youtube, google, chatgpt, search, ...) locally.
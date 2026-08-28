# How to install Hey Nova (no store needed)

Hey Nova turns your microphone into a browser remote control.
Open YouTube, search, play songs, scroll, close tabs — all by voice.

## Install the extension (2 minutes)

1. Download the extension package:
   `extension/hey-nova-extension.zip`
2. **Unzip it** somewhere on your PC (right-click → Extract All).
   Keep the extracted folder — don't delete it.
3. Open Microsoft Edge → type `edge://extensions` in the address bar
   (for Chrome use `chrome://extensions`).
4. Turn **ON `Developer mode`** (toggle in the bottom-left / top-right corner).
5. Click **`Load unpacked`** and select the folder you extracted
   (the one that contains `manifest.json`).
6. Click the **Hey Nova** icon, click **Start Listening**, then say:
   > "Hey Nova, open youtube"

## Optional: turn on the AI (makes Nova understand natural language)

Without this, Nova still works — it understands commands like
"open youtube", "search cats", "play a song", "scroll down".

With AI, you can say things like "what is the weather in London" and
Nova figures it out:

1. Double-click **`run-nova-ai.bat`** (in the `server` folder).
   It installs what's needed and starts the server at `localhost:3000`
   (leave that black window open).
2. Open the Hey Nova popup → the **AI chip turns green** within ~15 seconds.
3. That's it — commands now understand natural language automatically.

## Troubleshooting

- **"This extension isn't working / mic not picking up"** → make sure you
  clicked the mic icon in the address bar and granted microphone permission.
- **Chip stays amber** → the AI window isn't running, or it needs a few
  seconds. Nova still works without AI.
- **Want it every time you open Edge?** On `edge://extensions`, toggle
  Developer mode OFF after loading if Edge warns you.

Questions? Open an issue at https://github.com/ANIZXD/hey-nova/issues
# Hey Nova — Privacy Policy

_Last updated: August 2026_

**Hey Nova does not collect personal data.**

## What happens to your voice

- Voice is captured by your browser's built-in speech recognition
  (Chrome/Edge) and **remains on your device**.
- The extension itself **never sends audio anywhere**.
- No recordings are stored by us, because there is nothing to store —
  there is no cloud, no account, and no server run by us.

## The optional local AI server

- This repository contains a small server you run **on your own machine**
  (`localhost:3000`).
- When it is running, the extension may send only the **text of a
  command** (for example "open youtube") to that server so it can decide
  what to do.
- The AI model runs locally on your machine (Ollama), or optionally via
  an OpenAI API key **you** choose to configure in a `.env` file. Any API
  key stays on your device and is never transmitted by us.
- If the server is not running, the extension works fully offline with
  built-in commands and **nothing is sent to any server**.

## No tracking, no analytics

- No cookies, no analytics, no advertising, no third-party network
  requests. The only network activity is (a) the websites you ask Nova to
  open or search, and (b) the optional local AI check on your own machine.

## Open-source & self-hosted

- All source code is public in this repository. You can inspect exactly
  what it does, or host everything yourself.

## Contact

- Owner: Mayank Yadav
- Questions about this policy: open an issue in this repository.
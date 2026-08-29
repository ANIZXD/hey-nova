const startBtn = document.getElementById("startBtn");
const aiStatus = document.getElementById("aiStatus");
const setupToggle = document.getElementById("setupToggle");
const setupBody = document.getElementById("setupBody");

// ======================================
// OPEN THE ASSISTANT
// ======================================

startBtn.addEventListener("click", () => {

    chrome.tabs.create({
        url: chrome.runtime.getURL("voice/voice.html")
    });

});

// ======================================
// OPTIONAL AI SETUP (accordion)
// ======================================

setupToggle.addEventListener("click", () => {

    const closed = setupBody.classList.toggle("open");

    setupToggle.classList.toggle("open", !closed);

});

// ======================================
// DETECT THE LOCAL AI SERVER
// =====================================
// Same probe the assistant uses: if the Hey Nova server is running on
// localhost:3000 the chip shows AI online. Keeps checking on each
// popup open so starting the server is picked up instantly.

const BACKEND_URL = "http://localhost:3000";

async function checkAi() {

    aiStatus.textContent = "Checking AI...";
    aiStatus.className = "ai-chip";

    try {

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(BACKEND_URL + "/", {
            signal: controller.signal
        });

        clearTimeout(timer);

        const data = await response.json().catch(() => ({}));

        const online = Boolean(response.ok && data && data.success);

        aiStatus.textContent =
            online
                ? "AI online — natural commands on"
                : "AI offline — built-in commands";

        aiStatus.className = "ai-chip " + (online ? "ai-on" : "ai-off");

        return online;

    } catch (error) {

        aiStatus.textContent = "AI offline — built-in commands";
        aiStatus.className = "ai-chip ai-off";

        return false;
    }
}

checkAi();
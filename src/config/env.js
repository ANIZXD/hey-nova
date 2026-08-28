const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env")
});

module.exports = {
    port: Number(process.env.PORT || 3000),
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "qwen3:0.6b"
};
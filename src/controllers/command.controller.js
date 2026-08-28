const { parseCommand } = require("../services/ai.service");

async function handleCommand(req, res) {

    const command = String(req.body && req.body.command || "").trim();

    if (!command) {

        return res.status(400).json({
            success: false,
            error: "No command provided"
        });
    }

    try {

        const actions = await parseCommand(command);

        return res.json({
            success: true,
            actions
        });

    } catch (error) {

        console.log(
            "Command error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            error: error.message || "Failed to parse the command"
        });
    }
}

module.exports = {
    handleCommand
};

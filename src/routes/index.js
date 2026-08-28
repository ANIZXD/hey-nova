const express = require("express");
const commandRoutes = require("./command.routes");

const router = express.Router();

router.get("/", (req, res) => {

    res.json({
        success: true,
        message: "Hey Nova backend is running"
    });

});

router.use("/command", commandRoutes);

module.exports = router;
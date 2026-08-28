const express = require("express");
const { handleCommand } = require("../controllers/command.controller");

const router = express.Router();

router.post("/", handleCommand);

module.exports = router;
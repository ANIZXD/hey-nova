const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", routes);

app.use((req, res) => {

    res.status(404).json({
        success: false,
        error: "Not found"
    });

});

module.exports = app;
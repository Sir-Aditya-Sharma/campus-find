const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const authRoutes = require("./routers/auth");
const itemRoutes = require("./routers/items");

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);

app.get("/api/health", (req, res) => {
    res.json({
        message: "CampusFind Backend is Running"
    });
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB Connected Successfully");
    })
    .catch((error) => {
        console.log("MongoDB Connection Error:");
        console.log(error);
    });

const PORT = 5000;

app.listen(PORT, () => {
    console.log("=================================");
    console.log("CampusFind Backend Started");
    console.log("Server: http://localhost:5000");
    console.log("=================================");
});
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import agentRouter from "./routes/agentsRoutes";
import { connectDB } from "./db";

const app = express();
app.use(express.json());

void connectDB();

app.use("/api/agent", agentRouter);

app.listen("8080", () => {
  console.log("server running on port 8080");
});

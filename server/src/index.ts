import dotenv from "dotenv";
dotenv.config();
import express from "express";
import agentRouter from "./routes/agentsRoutes";

const app = express();
app.use(express.json());

app.use("/api/agent", agentRouter);

app.listen("8080", () => {
  console.log("server running on port 8080");
});

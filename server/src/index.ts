import dotenv from "dotenv";
dotenv.config();
import express from "express";
import agentRouter from "./routes/agentsRoutes";
import { connectDB } from "./db";
import { initTelegramBot } from "./routes/telegram";
import { Telegraf } from "telegraf";

const app = express();
app.use(express.json());

void connectDB();

initTelegramBot();

let bot: Telegraf | null = null;

try {
  bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);
} catch (err: any) {}

app.use("/api/agent", agentRouter);

app.listen("8080", () => {
  console.log("server running on port 8080");
});

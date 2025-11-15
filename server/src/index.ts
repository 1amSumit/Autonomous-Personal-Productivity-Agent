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

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  if (
    error.message?.includes("ECONNRESET") ||
    error.message?.includes("ETIMEDOUT")
  ) {
    console.warn("⚠️ Network error caught, continuing...");
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason: any, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);

  if (
    reason?.message?.includes("ECONNRESET") ||
    reason?.message?.includes("ETIMEDOUT") ||
    reason?.code === "ECONNRESET"
  ) {
    console.warn("⚠️ Network error caught, continuing...");
  } else {
    process.exit(1);
  }
});

app.listen("8080", () => {
  console.log("server running on port 8080");
});

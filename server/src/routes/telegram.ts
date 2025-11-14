import TelegramBot from "node-telegram-bot-api";
import { planner } from "../services/planner";
import { createPlanRecord } from "../services/memoryStore";
import { executor } from "../services/executor";

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

  console.log("🚀 Telegram bot starting with polling...");

  const bot = new TelegramBot(token, { polling: true });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text?.trim();

    if (!userText) {
      bot.sendMessage(chatId, "Please send text only.");
      return;
    }

    bot.sendMessage(chatId, "🤖 Thinking… generating a plan...");

    try {
      const planJson = await planner(userText, { userId: chatId.toString() });

      const planRecord = await createPlanRecord(
        chatId.toString(),
        userText,
        planJson
      );

      bot.sendMessage(
        chatId,
        "📝 **Here is your plan:**\n\n" +
          "```\n" +
          JSON.stringify(planJson, null, 2) +
          "\n```",
        { parse_mode: "Markdown" }
      );

      bot.sendMessage(chatId, "⚙️ Starting execution…");

      await executor(planRecord, (event) => {
        if (event.type === "log") {
          bot.sendMessage(chatId, `📘 Log: ${event.message}`);
        }
        if (event.type === "retry") {
          bot.sendMessage(chatId, `🔁 Retrying: ${event.message}`);
        }
        if (event.type === "completed") {
          bot.sendMessage(chatId, "✅ Execution finished!");
        }
      });
    } catch (err: any) {
      console.error(err);
      bot.sendMessage(chatId, "❌ Error: " + err.message);
    }
  });
}

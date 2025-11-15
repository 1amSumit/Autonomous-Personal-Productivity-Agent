import TelegramBot from "node-telegram-bot-api";
import { planner } from "../services/planner";
import { createPlanRecord } from "../services/memoryStore";
import { executor } from "../services/executor";

import { UserModel } from "../models/User";
import { getTelegramUserInfo } from "../utils/telegramInfo";

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

  console.log("🚀 Telegram bot starting with polling...");

  const bot = new TelegramBot(token, { polling: true });

  // Track users waiting for email input
  const awaitingEmailInput = new Set<number>();

  // Middleware: Create/update user on every message
  bot.on("message", async (msg) => {
    if (msg.from) {
      try {
        await UserModel.findOneAndUpdate(
          { telegramId: msg.from.id },
          {
            $set: {
              telegramId: msg.from.id,
              firstName: msg.from.first_name,
              lastName: msg.from.last_name,
              username: msg.from.username,
            },
          },
          { upsert: true, new: true }
        );
      } catch (error) {
        console.error("Error creating/updating user:", error);
      }
    }
  });
  // Command: /start
  bot.onText(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userInfo = getTelegramUserInfo(msg);

    await bot.sendMessage(
      chatId,
      `👋 Welcome ${userInfo.name}!\n\n` +
        `I'm your AI Planning Assistant. I can help you:\n` +
        `• 📅 Plan your day\n` +
        `• 🔍 Research topics\n` +
        `• 📧 Send summary emails with detailed PDF reports\n\n` +
        `**Available Commands:**\n` +
        `/plan <your goal> - Create and execute a plan\n` +
        `/setemail - Set your email address\n` +
        `/myinfo - View your profile\n` +
        `/help - Show available commands\n\n` +
        `⚠️ First, set your email using /setemail`,
      { parse_mode: "Markdown" }
    );
  });

  // Command: /help
  bot.onText(/^\/help/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      `📚 **Available Commands:**\n\n` +
        `/start - Welcome message\n` +
        `/plan <goal> - Create a plan\n` +
        `   Example: /plan Research AI coding tools and email summary to manager\n\n` +
        `/setemail - Set your email address\n` +
        `/myinfo - View your profile information\n` +
        `/help - Show this help message\n\n` +
        `**How it works:**\n` +
        `1. Set your email with /setemail\n` +
        `2. Create a plan with /plan followed by your goal\n` +
        `3. I'll research, create calendar events, and email you a detailed PDF report!`,
      { parse_mode: "Markdown" }
    );
  });

  // Command: /setemail
  bot.onText(/^\/setemail/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      "📧 Please reply with your email address:\n\n" +
        "Example: user@example.com"
    );

    // Mark this user as awaiting email input
    awaitingEmailInput.add(msg.from?.id || 0);
  });

  // Command: /myinfo
  bot.onText(/^\/myinfo/, async (msg) => {
    const chatId = msg.chat.id;
    const userInfo = getTelegramUserInfo(msg);
    const user = await UserModel.findOne({ telegramId: userInfo.id });

    await bot.sendMessage(
      chatId,
      `👤 **Your Information:**\n\n` +
        `📛 Name: ${userInfo.name}\n` +
        `🆔 Telegram ID: ${userInfo.id}\n` +
        `👤 Username: ${
          userInfo.username ? `@${userInfo.username}` : "Not set"
        }\n` +
        `📧 Email: ${user?.email || "❌ Not set (use /setemail)"}\n\n` +
        `Use /setemail to update your email address.`,
      { parse_mode: "Markdown" }
    );
  });

  // Command: /plan
  bot.onText(/^\/plan(.+)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return bot.sendMessage(chatId, "❌ Could not identify user.");
    }

    // Check if user has email configured
    const user = await UserModel.findOne({ telegramId: userId });

    if (!user?.email) {
      return bot.sendMessage(
        chatId,
        "❌ Please set your email first using /setemail\n\n" +
          "This is required for sending summary emails with research reports."
      );
    }

    // Get the goal from the command
    const goal = match?.[1]?.trim();

    if (!goal) {
      return bot.sendMessage(
        chatId,
        "❓ Please provide a goal for your plan.\n\n" +
          "**Example:**\n" +
          "/plan Research AI coding tools and send summary to manager\n\n" +
          "/plan Plan a productive work day tomorrow with deep work session"
      );
    }

    await bot.sendMessage(chatId, "🤖 Thinking… generating a plan...");

    try {
      // Generate plan
      const planJson = await planner(goal, { userId: chatId.toString() });

      // Replace email placeholders with user's actual email
      planJson.steps.forEach((step) => {
        if (step.tool === "email") {
          if (
            step.args.to &&
            (step.args.to.includes("example.com") ||
              step.args.to.includes("gmail.com"))
          ) {
            step.args.to = user.email;
          }
        }
      });

      // Create plan record
      const planRecord = await createPlanRecord(
        chatId.toString(),
        goal,
        planJson
      );

      // Show plan to user
      let planText = "📋 **Plan Created!**\n\n";
      planText += `🎯 **Goal:** ${planJson.goal}\n\n`;
      planText += `📝 **Steps:**\n`;
      planJson.steps.forEach((step) => {
        const emoji =
          step.tool === "search"
            ? "🔍"
            : step.tool === "calendar"
            ? "📅"
            : "📧";
        planText += `${emoji} ${step.id}. ${step.action}\n`;
      });

      await bot.sendMessage(chatId, planText, { parse_mode: "Markdown" });

      await bot.sendMessage(chatId, "⚙️ Starting execution…");

      // Get user info for personalization
      const userInfo = getTelegramUserInfo(msg);

      // Execute plan with event callbacks
      await executor(
        planRecord,
        async (event) => {
          if (event.type === "log") {
            // Only send important updates
            if (
              event.message.includes("✅") ||
              event.message.includes("❌") ||
              event.message.includes("Starting step")
            ) {
              await bot.sendMessage(chatId, `${event.message}`);
            }
          }
          if (event.type === "retry") {
            await bot.sendMessage(chatId, `🔁 Retrying: ${event.message}`);
          }
          if (event.type === "completed") {
            await bot.sendMessage(
              chatId,
              `✅ **Execution finished!**\n\n` +
                `📧 Check your email (${user.email}) for the detailed report with PDF attachment.`,
              { parse_mode: "Markdown" }
            );
          }
        },
        userInfo.name
      );
    } catch (err: any) {
      console.error(err);
      await bot.sendMessage(
        chatId,
        `❌ **Error:** ${err.message}\n\n` +
          `Please try again or use /help for available commands.`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // Handle regular messages (non-commands)
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const userText = msg.text?.trim();

    // Skip if it's a command or no text
    if (!userText || userText.startsWith("/")) {
      return;
    }

    // Check if user is awaiting email input
    if (userId && awaitingEmailInput.has(userId)) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (emailRegex.test(userText)) {
        try {
          await UserModel.findOneAndUpdate(
            { telegramId: userId },
            { $set: { email: userText } },
            { upsert: true }
          );

          awaitingEmailInput.delete(userId);

          await bot.sendMessage(
            chatId,
            "✅ Email saved successfully!\n\n" +
              "You can now use /plan to create plans that will email you detailed reports."
          );
        } catch (error) {
          console.error("Error saving email:", error);
          await bot.sendMessage(
            chatId,
            "❌ Failed to save email. Please try again."
          );
        }
      } else {
        await bot.sendMessage(
          chatId,
          "❌ Invalid email format. Please enter a valid email address like:\n" +
            "user@example.com"
        );
      }
      return;
    }

    // Check if message looks like an email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailRegex.test(userText)) {
      // User sent an email without using /setemail
      try {
        await UserModel.findOneAndUpdate(
          { telegramId: userId },
          { $set: { email: userText } },
          { upsert: true }
        );

        await bot.sendMessage(
          chatId,
          "✅ Email saved successfully!\n\n" +
            "You can now use /plan to create plans."
        );
      } catch (error) {
        console.error("Error saving email:", error);
        await bot.sendMessage(
          chatId,
          "❌ Failed to save email. Please use /setemail"
        );
      }
      return;
    }

    // Otherwise, suggest using /plan
    await bot.sendMessage(
      chatId,
      "💡 Tip: Use /plan before your goal to create a plan.\n\n" +
        "Example: /plan Research AI tools and email summary\n\n" +
        "Or use /help to see all available commands."
    );
  });

  // Error handling
  bot.on("polling_error", (error) => {
    console.error("❌ Polling error:", error);
  });

  console.log("✅ Telegram bot handlers configured");
}

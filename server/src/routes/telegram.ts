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

  const awaitingEmailInput = new Set<number>();

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
        `⚠️ Set your email using /setemail (needed only if you want to send emails)`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/^\/help/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      `📚 **Available Commands:**\n\n` +
        `/start - Welcome message\n` +
        `/plan <goal> - Create a plan\n\n` +
        `**Examples:**\n` +
        `/plan Research AI coding tools\n` +
        `/plan Research AI tools and email summary to manager\n` +
        `/plan Find restaurants and send list to john@example.com\n\n` +
        `/setemail - Set your email address\n` +
        `/myinfo - View your profile information\n` +
        `/help - Show this help message\n\n` +
        `**How it works:**\n` +
        `1. Just use /plan for research and calendar tasks\n` +
        `2. Add "email to..." if you want to send results via email\n` +
        `3. I'll research, create calendar events, and optionally email reports!`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/^\/setemail/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      "📧 Please reply with your email address:\n\n" +
        "Example: user@example.com"
    );

    awaitingEmailInput.add(msg.from?.id || 0);
  });

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

  bot.onText(/^\/plan(.+)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) {
      return bot.sendMessage(chatId, "❌ Could not identify user.");
    }

    const goal = match?.[1]?.trim();

    if (!goal) {
      return bot.sendMessage(
        chatId,
        "❓ Please provide a goal for your plan.\n\n" +
          "**Examples:**\n" +
          "/plan Research AI coding tools\n" +
          "/plan Research AI tools and email summary to my manager\n" +
          "/plan Find restaurants and email list to john@example.com"
      );
    }

    const needsEmail = /\b(email|send|notify|share)\b/i.test(goal);

    if (needsEmail) {
      const user = await UserModel.findOne({ telegramId: userId });

      if (!user?.email) {
        return bot.sendMessage(
          chatId,
          "❌ Please set your email first using /setemail\n\n" +
            "This is required when your plan includes sending emails."
        );
      }
    }

    await bot.sendMessage(chatId, "🤖 Thinking… generating a plan...");

    try {
      const planJson = await planner(goal, { userId: chatId.toString() });

      const user = await UserModel.findOne({ telegramId: userId });

      const hasEmailSteps = planJson.steps.some((s) => s.tool === "email");

      if (hasEmailSteps) {
        planJson.steps.forEach((step) => {
          if (step.tool === "email") {
            const originalTo = step.args.to;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            const emailInGoal = goal.match(
              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
            );

            if (emailInGoal && emailInGoal[0]) {
              // User mentioned specific email in goal
              console.log(`📧 Using email from goal: ${emailInGoal[0]}`);
              step.args.to = emailInGoal[0];
            } else if (
              emailRegex.test(originalTo) &&
              !originalTo.includes("example.com") &&
              !originalTo.includes("company.com")
            ) {
              console.log(`📧 Using planner's email: ${originalTo}`);
            } else {
              console.log(
                `📧 No valid recipient, using user email: ${user?.email}`
              );
              step.args.to = user?.email || "user@example.com";
            }
          }
        });
      }

      const planRecord = await createPlanRecord(
        chatId.toString(),
        goal,
        planJson
      );

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
        planText += `${emoji} ${step.id}. ${step.action}`;

        // Show email recipient if it's an email step
        if (step.tool === "email" && step.args.to) {
          planText += ` → ${step.args.to}`;
        }
        planText += `\n`;
      });

      await bot.sendMessage(chatId, planText, { parse_mode: "Markdown" });

      await bot.sendMessage(chatId, "⚙️ Starting execution…");

      const userInfo = getTelegramUserInfo(msg);

      try {
        await executor(
          planRecord,
          async (event) => {
            try {
              if (event.type === "log") {
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
                let completionMsg = "✅ **Execution finished!**\n\n";

                if (hasEmailSteps) {
                  const emailStep = planJson.steps.find(
                    (s) => s.tool === "email"
                  );
                  if (emailStep) {
                    completionMsg += `📧 Email sent to: ${emailStep.args.to}\n`;
                    completionMsg += `Check the inbox for the detailed report with PDF attachment.`;
                  }
                } else {
                  completionMsg += "All tasks completed successfully!";
                }

                await bot.sendMessage(chatId, completionMsg, {
                  parse_mode: "Markdown",
                });
              }
            } catch (eventError) {
              console.error("Error in event handler:", eventError);
            }
          },
          userInfo.name
        );
      } catch (execError: any) {
        console.error("❌ Executor error:", execError);
        await bot.sendMessage(
          chatId,
          `❌ **Execution error:** ${execError.message}`,
          { parse_mode: "Markdown" }
        );
      }
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

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const userText = msg.text?.trim();

    if (!userText || userText.startsWith("/")) {
      return;
    }

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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emailRegex.test(userText)) {
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

    await bot.sendMessage(
      chatId,
      "💡 Tip: Use /plan before your goal to create a plan.\n\n" +
        "Example: /plan Research AI tools and email summary\n\n" +
        "Or use /help to see all available commands."
    );
  });

  bot.on("polling_error", (error) => {
    console.error("❌ Polling error:", error);
  });

  console.log("✅ Telegram bot handlers configured");
}

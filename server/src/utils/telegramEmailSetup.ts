import TelegramBot from "node-telegram-bot-api";
import { getUserEmail, saveUserEmail } from "./telegramInfo";

/**
 * Handle /setemail command
 */
export async function handleSetEmailCommand(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  userModel: any
): Promise<void> {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    "📧 Please reply with your email address:\n\n" + "Example: user@example.com"
  );
}

/**
 * Handle email input from user
 */
export async function handleEmailInput(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  userModel: any
): Promise<boolean> {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const email = msg.text?.trim();

  if (!userId || !email) {
    return false;
  }

  const success = await saveUserEmail(userId, email, userModel);

  if (success) {
    await bot.sendMessage(
      chatId,
      "✅ Email saved successfully!\n\n" +
        "You can now use /plan to create plans that will email you detailed reports."
    );
    return true;
  } else {
    await bot.sendMessage(
      chatId,
      "❌ Invalid email format. Please try again with a valid email address like:\n" +
        "user@example.com"
    );
    return false;
  }
}

/**
 * Check if user has email configured
 * Returns email if found, null otherwise
 */
export async function checkUserEmail(
  msg: TelegramBot.Message,
  userModel: any
): Promise<string | null> {
  const userId = msg.from?.id;

  if (!userId) {
    return null;
  }

  return await getUserEmail(userId, userModel);
}

/**
 * Request user email if not already stored
 */
export async function requestUserEmail(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  userModel: any
): Promise<string | null> {
  const userId = msg.from?.id;

  if (!userId) {
    await bot.sendMessage(msg.chat.id, "Could not identify user.");
    return null;
  }

  // Check if email already exists
  const existingEmail = await getUserEmail(userId, userModel);

  if (existingEmail) {
    return existingEmail;
  }

  // Ask for email
  await bot.sendMessage(
    msg.chat.id,
    "📧 I need your email address to send you reports.\n\n" +
      "Please use /setemail to set your email address."
  );

  return null;
}

import TelegramBot from "node-telegram-bot-api";

export function getTelegramUserInfo(msg: TelegramBot.Message) {
  const user = msg.from;

  if (!user) {
    return {
      id: null,
      name: "User",
      firstName: null,
      lastName: null,
      username: null,
      email: null,
    };
  }

  const fullName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "User";

  return {
    id: user.id,
    name: fullName,
    firstName: user.first_name || null,
    lastName: user.last_name || null,
    username: user.username || null,
    email: null, // Telegram API doesn't expose emails
  };
}

export async function getUserEmail(
  userId: number,
  userModel: any
): Promise<string | null> {
  try {
    const user = await userModel.findOne({ telegramId: userId });
    return user?.email || null;
  } catch (error) {
    console.error("Error fetching user email:", error);
    return null;
  }
}

export async function saveUserEmail(
  userId: number,
  email: string,
  userModel: any
): Promise<boolean> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }

    await userModel.findOneAndUpdate(
      { telegramId: userId },
      {
        $set: { email, updatedAt: new Date() },
      },
      { upsert: true }
    );

    return true;
  } catch (error) {
    console.error("Error saving user email:", error);
    return false;
  }
}

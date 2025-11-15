import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  telegramId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    username: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      default: null,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please provide a valid email"],
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.statics.findOrCreate = async function (telegramUser: any) {
  const user = await this.findOneAndUpdate(
    { telegramId: telegramUser.id },
    {
      $setOnInsert: {
        telegramId: telegramUser.id,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
      },
      $set: {
        // Update name fields if changed
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
      },
    },
    { upsert: true, new: true }
  );

  return user;
};

export const UserModel = mongoose.model<IUser>("User", UserSchema);

import mongoose from "mongoose";

const MemorySchema = new mongoose.Schema({
  userId: String,
  key: String,
  value: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.MemoryItem ||
  mongoose.model("MemoryItem", MemorySchema);

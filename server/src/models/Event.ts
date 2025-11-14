import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
  title: String,
  description: String,
  date: Date,
  durationMinutes: Number,
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Event || mongoose.model("Event", EventSchema);

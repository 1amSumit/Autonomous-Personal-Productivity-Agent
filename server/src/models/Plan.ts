import mongoose from "mongoose";

const StepSchema = new mongoose.Schema(
  {
    id: Number,
    action: String,
    tool: String,
    args: mongoose.Schema.Types.Mixed,
    status: { type: String, default: "pending" },
    result: mongoose.Schema.Types.Mixed,
    error: String,
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema({
  userId: { type: String, default: "demo" },
  goal: String,
  planJson: mongoose.Schema.Types.Mixed,
  steps: [StepSchema],
  logs: [{ time: Date, entry: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  finishedAt: Date,
});

export default mongoose.models.Plan || mongoose.model("Plan", PlanSchema);

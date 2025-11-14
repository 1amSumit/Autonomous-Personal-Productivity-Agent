import Plan from "../models/Plan";

export async function createPlanRecord(
  userId: String,
  goal: string,
  planJson: JSON
) {
  //@ts-ignore
  const steps = (planJson.steps || []).map((s) => ({
    ...s,
    status: "pending",
  }));
  const newPlan = new Plan({
    userId,
    goal,
    planJson,
    steps,
    logs: [],
  });

  await newPlan.save();
  return newPlan;
}

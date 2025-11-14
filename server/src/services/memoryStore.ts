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

//@ts-ignore
export async function appendLog(planId: Number, entry) {
  const existingPlan = await Plan.findById(planId);

  if (!existingPlan) {
    throw new Error("Plan does not exists");
  }

  existingPlan.push({ time: new Date(), entry });
  await existingPlan.save();
  return existingPlan;
}

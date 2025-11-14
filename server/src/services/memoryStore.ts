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

export async function appendLog(planId: String, entry: any) {
  const existingPlan = await Plan.findById(planId);

  if (!existingPlan) {
    throw new Error("Plan does not exists");
  }

  existingPlan.push({ time: new Date(), entry });
  await existingPlan.save();
  return existingPlan;
}

export async function updateSteps(planId: String, stepId: Number, patch: any) {
  const existingPlan = await Plan.findById(planId);
  if (!existingPlan) {
    throw new Error("Plan dones not exists");
  }
  const step = await existingPlan.steps.find((x: any) => x.id === stepId);
  if (!step) {
    throw new Error("Steps not found");
  }

  Object.assign(step, patch);
  await existingPlan.save();
  return existingPlan;
}

export async function finalizePlan(planId: string) {
  const existingPlan = await Plan.findById(planId);
  if (!existingPlan) {
    throw new Error("Plan not found");
  }

  existingPlan.finishedAt = new Date();
  await existingPlan.save();
  return existingPlan;
}

export async function getPlan(planId: String) {
  return Plan.findById(planId).lean();
}

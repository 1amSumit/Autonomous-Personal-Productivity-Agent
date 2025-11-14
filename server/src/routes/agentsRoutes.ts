import { Router } from "express";
import { planner } from "../services/planner";
import { createPlanRecord, getPlan } from "../services/memoryStore";
import { executor } from "../services/executor";

const router = Router();

router.post("/goal", async (req, res) => {
  try {
    const { userId = "demo", goal } = req.body;

    if (!goal)
      return res.status(400).json({
        error: "Goal required",
      });

    const planJson = await planner(goal, { userId });

    const planRecord = await createPlanRecord(userId, goal, planJson);

    await executor(planRecord);

    res.status(200).json({
      status: "success",
      planId: planRecord._id,
      plan: planRecord.planJson,
    });
  } catch (err: any) {
    res.status(501).json({
      status: "failed",
      message: err.message,
    });
  }
});

router.get("/plan/:id", async (req, res) => {
  const plan = await getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: "not found" });
  res.json(plan);
});

export default router;

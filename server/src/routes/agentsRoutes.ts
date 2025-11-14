import { Router } from "express";
import { planner } from "../services/planner";
import { createPlanRecord, getPlan } from "../services/memoryStore";

const router = Router();

router.post("/goal", async (req, res) => {
  try {
    const { userId = "demo", goal } = req.body;

    if (!goal)
      return res.status(400).json({
        error: "Goal required",
      });

    const planJson = await planner(goal, { userId });
    console.log(planJson);

    res.status(200).json({
      message: "done",
    });

    // const palnRecord = await createPlanRecord(userId, goal, planJson);
  } catch (err: any) {
    res.status(400).json({
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

import { Router } from "express";

const router = Router();

router.post("/goal", async (req, res) => {
  const { userId = "demo", goal } = req.body;

  if (!goal)
    return res.status(400).json({
      error: "Goal required",
    });
});

export default router;

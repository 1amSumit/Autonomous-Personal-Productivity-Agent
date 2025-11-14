import { calendarToolExecute } from "./calendarTool";
import { eamilToolExecute } from "./emailTool";
import { appendLog, finalizePlan, updateSteps } from "./memoryStore";
import { searchToolExecute } from "./searchTool";

const toolMap = {
  search: searchToolExecute,
  calendar: calendarToolExecute,
  email: eamilToolExecute,
};

export async function executor(planRecord: any) {
  const palnId = planRecord._id.toString();
  const steps = planRecord.planJson.steps;

  for (const step of steps) {
    await appendLog(palnId, { stepId: step.id, status: "starting", step });
    //@ts-ignore
    const toolFn = toolMap[step.tool];
    if (!toolFn) {
      await updateSteps(palnId, step.id, {
        status: "failed",
        error: "Unknown tool",
      });
      await appendLog(palnId, {
        stepId: step.id,
        status: "failed",
        error: "Unknown tool",
      });
      continue;
    }

    try {
      const result = await toolFn(step.args, { userId: planRecord.userId });
      await updateSteps(palnId, step.id, {
        status: "done",
        result,
      });
      await appendLog(palnId, {
        stepId: step.id,
        status: "done",
        result,
      });
    } catch (e: any) {
      await updateSteps(palnId, step.id, {
        status: "failed",
        error: e.message,
      });
      await appendLog(palnId, {
        stepId: step.id,
        status: "failed",
        error: e.message,
      });
    }
  }

  await finalizePlan(palnId);
}

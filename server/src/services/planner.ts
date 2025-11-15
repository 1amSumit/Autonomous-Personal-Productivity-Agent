import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { hashText } from "../utils/hashText";
import redisClient from "../redis/redisClient";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

export type PlannerStep = {
  id: number;
  action: string;
  tool: "search" | "calendar" | "email";
  args: Record<string, any>;
};

export type PlannerResult = {
  goal: string;
  steps: PlannerStep[];
};

export async function planner(goal: string, ctx = {}) {
  if (!goal || goal.trim().length === 0) {
    throw new Error("Goal is required");
  }

  const goalHashed = await hashText(goal);

  try {
    const cached = await redisClient.get(goalHashed);
    if (cached) {
      console.log("♻️ Using cached planner result from Redis");
      return parsePlanner(cached, goal);
    }
  } catch (cacheErr) {
    console.warn("Cache read failed:", cacheErr);
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  const prompt = `
You are an autonomous AI planner. You MUST return ONLY valid JSON with NO additional text.

CURRENT DATE & TIME: ${now.toISOString()}
TOMORROW: ${tomorrow.toISOString()}
TIMEZONE: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

AVAILABLE TOOLS:
1. "search" - Search for information
   Example: { "query": "best workout routines 2025" }

2. "calendar" - Create calendar events
   Example: { "title": "Morning Workout", "startTime": "2025-11-15T06:00:00.000Z", "endTime": "2025-11-15T07:00:00.000Z", "description": "30 min cardio workout" }

3. "email" - Send emails
   Example: { "to": "user@example.com", "subject": "Workout Plan", "body": "Here is your plan..." }

USER GOAL: """${goal}"""

CRITICAL JSON RULES:
1. Return ONLY the JSON object - no markdown, no commentary, no explanation
2. Do NOT wrap in \`\`\`json code blocks
3. Use double quotes for ALL strings (never single quotes)
4. ALL dates MUST be in ISO-8601 format: "YYYY-MM-DDTHH:MM:SS.000Z"
5. Ensure ALL brackets and braces are properly closed
6. Do NOT add trailing commas in arrays or objects
7. Escape special characters in strings (use \\" for quotes inside strings)

RESPONSE STRUCTURE:
{
  "goal": "the user goal here",
  "steps": [
    {
      "id": 1,
      "action": "short description",
      "tool": "search",
      "args": { "query": "search terms" }
    }
  ]
}

IMPORTANT: Return ONLY the JSON. Start with { and end with }. NO other text.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],

      config: {
        responseModalities: ["Text"],
        temperature: 0.2,
        maxOutputTokens: 4048,
      },
    });

    const resultText = extractText(response);

    await redisClient.set(goalHashed, resultText);

    if (!resultText) throw new Error("Gemini returned no text");

    let jsonText = extractJSON(resultText);

    let parsed: PlannerResult;
    parsed = JSON.parse(jsonText);
    validatePlan(parsed);
    parsed.goal = parsed.goal ?? goal;

    return parsed;
  } catch (err: any) {
    console.log(err);
    const cached = await redisClient.get(goalHashed);

    if (cached) {
      console.log("♻ Using cached planner result from Redis");
      return parsePlanner(cached, goal);
    }

    throw err;
  }
}

function extractText(resp: GenerateContentResponse): string {
  const parts = resp.candidates?.[0]?.content?.parts;
  if (!parts) return "";

  return parts
    .map((p) => ("text" in p ? p.text : ""))
    .join("")
    .trim();
}

function extractJSON(text: string): string {
  let t = text.trim();
  if (t.startsWith("{") && t.endsWith("}")) return t;

  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    return t.slice(first, last + 1);
  }
  throw new Error("Planner output did not include valid JSON object");
}

function validatePlan(p: any) {
  if (!Array.isArray(p.steps)) throw new Error("Planner returned no steps");

  p.steps.forEach((s: any, idx: number) => {
    if (typeof s.id !== "number")
      throw new Error(`Step ${idx} missing numeric id`);
    if (typeof s.action !== "string")
      throw new Error(`Step ${idx} missing action`);
    if (!["search", "calendar", "email"].includes(s.tool))
      throw new Error(`Invalid tool in step ${idx}: ${s.tool}`);
    if (typeof s.args !== "object")
      throw new Error(`Step ${idx} args must be an object`);
  });
}

function parsePlanner(text: string, originalGoal: string): PlannerResult {
  const json = extractJSON(text);

  const parsed = JSON.parse(json);
  validatePlan(parsed);

  parsed.goal = parsed.goal ?? originalGoal;

  return parsed;
}

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

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

  const prompt = `
You are an autonomous planner. Input: a user goal.

Return ONLY valid JSON (no commentary, no markdown). 
The JSON MUST match exactly this shape:

{
  "goal": "<original goal>",
  "steps": [
    { "id": 1, "action": "ShortActionName", "tool": "search|calendar|email", "args": { } }
  ]
}

Rules:
1) Allowed tools: "search", "calendar", "email".
2) Each step must have: id (int), action (string), tool (allowed value), args (object).
3) If using dates, they MUST be ISO-8601 format.
4) Return JSON only.

Now create a plan for this: """${goal}"""
`;

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

  if (!resultText) throw new Error("Gemini returned no text");

  let jsonText = extractJSON(resultText);

  console.log(jsonText);

  let parsed: PlannerResult;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    throw new Error(
      `Failed to parse planner JSON: ${err.message}\nRAW: ${resultText}`
    );
  }

  validatePlan(parsed);

  parsed.goal = parsed.goal ?? goal;

  return parsed;
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

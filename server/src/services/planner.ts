import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function planner(goal: string, ctx = {}) {
  if (!goal || goal.trim().length === 0) throw new Error("Empty goal.");
  const prompt = `
You are an autonomous planner. Input: a user goal.
Return ONLY valid JSON (no commentary, no markdown). The JSON MUST match this shape:

{
  "goal": "<original goal>",
  "steps": [
    { "id": 1, "action": "ShortActionName", "tool": "search|calendar|email", "args": { /* tool args */ } },
    ...
  ]
}

Rules:
1) Use only tools from this set: "search", "calendar", "email".
2) Each step must have id (int), action (short string), tool (one of allowed), args (object).
3) Dates should use ISO-8601 where applicable.
4) Keep the JSON compact and machine-parseable—NO extra text.
Now create a plan for this goal: """${goal}"""
`;

  const aiResponse = ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      temperature: 0.2,
      maxOutputTokens: 800,
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });

  console.log(aiResponse);
}

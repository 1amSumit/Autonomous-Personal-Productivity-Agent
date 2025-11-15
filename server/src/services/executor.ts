import { GoogleGenAI } from "@google/genai";
import { calendarToolExecute } from "./calendarTool";
import { eamilToolExecute } from "./emailTool";
import { appendLog, finalizePlan, updateSteps } from "./memoryStore";
import { searchToolExecute } from "./searchTool";
import {
  formatSearchStepsForPDF,
  generateSearchResultsPDF,
} from "../utils/pdfGnerator";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

const toolMap = {
  search: searchToolExecute,
  calendar: calendarToolExecute,
  email: eamilToolExecute,
};

export async function executor(planRecord: any, onEvent = (event: any) => {}) {
  const planId = planRecord._id.toString();
  const steps = planRecord.planJson.steps;

  let toolResults: Record<number, any> = {};

  for (const step of steps) {
    onEvent({
      type: "log",
      stepId: step.id,
      step,
      message: `Starting step ${step.id}: ${step.action}`,
    });

    await appendLog(planId, { stepId: step.id, status: "starting", step });

    //@ts-ignore
    const toolFn = toolMap[step.tool];

    if (!toolFn) {
      await updateSteps(planId, step.id, {
        status: "failed",
        error: "Unknown tool",
      });
      await appendLog(planId, {
        stepId: step.id,
        status: "failed",
        error: "Unknown tool",
      });

      onEvent({
        type: "log",
        stepId: step.id,
        message: `❌ Failed step ${step.id}: Unknown tool "${step.tool}"`,
        error: "Unknown Tool",
      });

      continue;
    }

    if (step.tool === "email") {
      try {
        // Generate PDF with all search results if any searches were done
        const searchSteps = steps.filter(
          (s: any) => s.id < step.id && s.tool === "search" && toolResults[s.id]
        );

        let pdfPath: string | null = null;

        if (searchSteps.length > 0) {
          console.log("📄 Generating PDF with search results...");
          const searchData = formatSearchStepsForPDF(steps, toolResults);

          try {
            pdfPath = await generateSearchResultsPDF(
              searchData,
              planRecord.planJson.goal
            );
            console.log(`✅ PDF generated: ${pdfPath}`);

            // Attach PDF to email
            step.args.attachments = step.args.attachments || [];
            step.args.attachments.push({
              filename: path.basename(pdfPath),
              path: pdfPath,
            });
          } catch (pdfError: any) {
            console.error("⚠️ PDF generation failed:", pdfError.message);
            // Continue without PDF if generation fails
          }
        }

        step.args.body = await enrichEmailBodyWithAI(
          step.args.body,
          steps,
          toolResults,
          step.id,
          planRecord.planJson.goal
          // pdfPath !== null
        );
      } catch (enrichError: any) {
        console.error("⚠️ Failed to enrich email:", enrichError.message);
      }
    }

    if (step.tool === "calendar") {
      if (!step.args.startTime && !step.args.date) {
        const error = "Calendar event missing startTime or date";
        console.error("❌", error, step);

        await updateSteps(planId, step.id, {
          status: "failed",
          error,
        });

        onEvent({
          type: "log",
          stepId: step.id,
          message: `❌ Step ${step.id} failed: ${error}`,
          error,
        });

        continue;
      }

      console.log("📅 Calendar step args:", JSON.stringify(step.args, null, 2));
    }

    try {
      const result = await toolFn(step.args, { userId: planRecord.userId });

      toolResults[step.id] = result;

      await updateSteps(planId, step.id, {
        status: "done",
        result,
      });

      await appendLog(planId, {
        stepId: step.id,
        status: "done",
        result,
      });

      onEvent({
        type: "log",
        stepId: step.id,
        message: `✅ Step ${step.id} done.`,
        result,
      });
    } catch (e: any) {
      await updateSteps(planId, step.id, {
        status: "failed",
        error: e.message,
      });

      await appendLog(planId, {
        stepId: step.id,
        status: "failed",
        error: e.message,
      });

      onEvent({
        type: "log",
        stepId: step.id,
        message: `❌ Step ${step.id} failed.`,
        error: e.message,
      });
    }
  }

  console.log("toolResults");

  console.log(toolResults);

  await finalizePlan(planId);

  onEvent({
    type: "completed",
    planId,
    message: "Plan execution finished.",
  });
}

async function enrichEmailBodyWithAI(
  originalBody: string,
  allSteps: any[],
  toolResults: Record<number, any>,
  currentStepId: number,
  goal: string
): Promise<string> {
  const previousSteps = allSteps.filter((s) => s.id < currentStepId);
  const searchSteps = previousSteps.filter(
    (s) => s.tool === "search" && toolResults[s.id]
  );
  const calendarSteps = previousSteps.filter(
    (s) => s.tool === "calendar" && toolResults[s.id]
  );

  // If no search results to synthesize, return original
  if (searchSteps.length === 0 && calendarSteps.length === 0) {
    return originalBody;
  }

  // Collect all search results from Tavily with FULL content
  let searchContext = "";
  let allUrls: string[] = [];

  searchSteps.forEach((searchStep, index) => {
    const searchResult = toolResults[searchStep.id];

    // Tavily returns: { query, result: { results: [...] } }
    if (searchResult?.result?.results?.length > 0) {
      searchContext += `\n### Search Query ${index + 1}: "${
        searchStep.args.query
      }"\n\n`;

      searchResult.result.results.forEach((item: any, i: number) => {
        searchContext += `Source ${i + 1}:\n`;
        searchContext += `Title: ${item.title || "Untitled"}\n`;
        searchContext += `URL: ${item.url}\n`;
        searchContext += `Content: ${
          item.content || item.snippet || "No content available"
        }\n`;
        searchContext += `---\n\n`;

        // Collect all URLs
        if (item.url) {
          allUrls.push(`[${item.title || "Source"}](${item.url})`);
        }
      });
    }
  });

  let calendarContext = "";
  calendarSteps.forEach((calStep) => {
    const result = toolResults[calStep.id];
    if (result?.event) {
      calendarContext += `\n- Created event: "${result.event.title}" at ${result.event.startTime}\n`;
    }
  });

  if (!searchContext && !calendarContext) {
    return originalBody;
  }

  console.log("🤖 Generating AI-enriched email content with summaries...");

  const prompt = `
You are an AI assistant helping to write a professional email summary based on research findings.

ORIGINAL EMAIL TEMPLATE:
"""
${originalBody}
"""

USER'S GOAL: ${goal}

SEARCH RESULTS WITH FULL CONTENT:
${searchContext}

CALENDAR EVENTS CREATED:
${calendarContext}

ALL SOURCE LINKS (MUST BE INCLUDED):
${allUrls.join("\n")}

TASK:
Write a complete professional email that replaces ALL placeholders in the template with actual content.

CRITICAL REQUIREMENTS:
1. Replace ALL placeholders like [Please describe...], [Manager's Name], [Your Name], etc. with real content
2. For [Manager's Name] - use "Manager" or the actual name if you know it
3. For [Your Name] - remove or use appropriate closing
4. Summarize the search results content into clear, concise paragraphs (3-5 sentences per topic)
5. MUST include ALL source links from the research - add them at the end of relevant sections
6. If multiple searches were done, organize findings by topic
7. Keep it professional, business-appropriate tone
8. Total length: 250-400 words
9. Format: Plain text paragraphs (NO markdown headers, NO bullet points)
10. Include specific tool names, technologies, or key findings mentioned in the content

EXAMPLE FORMAT:
Hi Manager,

Here's a summary of my productive work today, [DATE]:

Deep Work Session: [Summarize based on calendar events what was planned/accomplished]

AI Coding Tools Research: I researched various AI-powered coding assistants and development tools. My findings include: [2-3 sentences summarizing the KEY tools and their features from the search content]. Notable tools include [specific names from content]. [Another 1-2 sentences with insights].

Sources: [Source 1](url1), [Source 2](url2), [Source 3](url3)

Best regards,
[Appropriate closing]

Return ONLY the complete email body. No preamble, no explanation, just the email.
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
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    const enrichedBody = response.candidates?.[0]?.content?.parts
      ?.map((p: any) => ("text" in p ? p.text : ""))
      .join("")
      .trim();

    if (enrichedBody && enrichedBody.length > 50) {
      console.log(
        "✅ Email body enriched with AI-generated summaries and all links"
      );
      return enrichedBody;
    } else {
      console.warn("⚠️ AI generated empty response, using original");
      return originalBody;
    }
  } catch (error: any) {
    console.error("❌ AI enrichment failed:", error.message);
    // Fallback to simple enrichment
    return enrichEmailBodySimple(
      originalBody,
      searchSteps,
      calendarSteps,
      toolResults
    );
  }
}

// Fallback function if AI enrichment fails
function enrichEmailBodySimple(
  originalBody: string,
  searchSteps: any[],
  calendarSteps: any[],
  toolResults: Record<number, any>
): string {
  let enrichedBody = originalBody;

  // Try to replace basic placeholders
  enrichedBody = enrichedBody.replace(/\[Manager's Name\]/g, "Manager");
  enrichedBody = enrichedBody.replace(/\[Your Name\]/g, "");

  // Add search results at the end
  if (searchSteps.length > 0) {
    enrichedBody += "\n\n---\n## Research Findings:\n\n";

    searchSteps.forEach((searchStep) => {
      const searchResult = toolResults[searchStep.id];

      // Tavily format: { query, result: { results: [...] } }
      if (searchResult?.result?.results?.length > 0) {
        enrichedBody += `**${searchStep.args.query}:**\n`;
        searchResult.result.results
          .slice(0, 3)
          .forEach((item: any, i: number) => {
            enrichedBody += `${i + 1}. ${item.title || "Link"} - ${item.url}\n`;
            if (item.content || item.snippet) {
              enrichedBody += `   ${(item.content || item.snippet).substring(
                0,
                200
              )}...\n`;
            }
          });
        enrichedBody += "\n";
      }
    });
  }

  return enrichedBody;
}

export function createResultsSummary(
  allSteps: any[],
  toolResults: Record<number, any>,
  currentStepId: number
): string {
  const previousSteps = allSteps.filter((s) => s.id < currentStepId);

  let summary = "## Execution Summary\n\n";

  previousSteps.forEach((step) => {
    const result = toolResults[step.id];

    summary += `### Step ${step.id}: ${step.action}\n`;
    summary += `**Tool:** ${step.tool}\n`;

    if (result) {
      if (step.tool === "search" && result.result?.results) {
        // Tavily format: { query, result: { results: [...] } }
        summary += `**Results found:** ${result.result.results.length}\n`;
        summary += "**Top findings:**\n";
        result.result.results.slice(0, 3).forEach((r: any, i: number) => {
          summary += `${i + 1}. ${r.title || "Result"} - ${r.url}\n`;
        });
      } else if (step.tool === "calendar" && result.event) {
        summary += `**Event created:** ${result.event.title || "Event"}\n`;
      } else {
        summary += `**Status:** Completed\n`;
      }
    }

    summary += "\n";
  });

  return summary;
}

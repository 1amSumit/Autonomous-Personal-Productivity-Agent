import { GoogleGenAI } from "@google/genai";
import { calendarToolExecute } from "./calendarTool";
import { eamilToolExecute } from "./emailTool";
import { appendLog, finalizePlan, updateSteps } from "./memoryStore";
import { searchToolExecute } from "./searchTool";
import {
  formatSearchStepsForPDF,
  generateSearchResultsPDF,
} from "../utils/pdfGnerator";
import { generateICSFile } from "../utils/icsGenerator";
import path from "path";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
});

const toolMap = {
  search: searchToolExecute,
  calendar: calendarToolExecute,
  email: eamilToolExecute,
};

export async function executor(
  planRecord: any,
  onEvent = (event: any) => {},
  userName?: string
) {
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
        const searchSteps = steps.filter(
          (s: any) => s.id < step.id && s.tool === "search" && toolResults[s.id]
        );

        const calendarSteps = steps.filter(
          (s: any) => s.id < step.id && s.tool === "calendar" && toolResults[s.id]
        );

        let pdfPath: string | null = null;
        const icsFiles: string[] = [];

        // Generate PDF for search results
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

        // Generate ICS files for calendar events
        if (calendarSteps.length > 0) {
          console.log("📅 Generating ICS calendar files for events...");
          
          for (const calStep of calendarSteps) {
            const calResult = toolResults[calStep.id];
            
            if (calResult?.success && calResult?.event) {
              try {
                const icsPath = await generateICSFile({
                  title: calResult.event.title,
                  description: calResult.event.description || "",
                  startTime: new Date(calResult.event.startTime),
                  endTime: new Date(calResult.event.endTime),
                  location: calResult.event.location || "",
                  attendees: step.args.to ? [step.args.to] : [],
                });

                icsFiles.push(icsPath);
                console.log(`✅ ICS file generated: ${icsPath}`);

                // Attach ICS to email
                step.args.attachments = step.args.attachments || [];
                step.args.attachments.push({
                  filename: path.basename(icsPath),
                  path: icsPath,
                });
              } catch (icsError: any) {
                console.error("⚠️ ICS generation failed:", icsError.message);
                // Continue without ICS if generation fails
              }
            }
          }

          if (icsFiles.length > 0) {
            console.log(`✅ ${icsFiles.length} calendar invite(s) attached to email`);
          }
        }

        step.args.body = await enrichEmailBodyWithAI(
          step.args.body,
          steps,
          toolResults,
          step.id,
          planRecord.planJson.goal,
          pdfPath !== null,
          userName,
          icsFiles.length > 0
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
  goal: string,
  hasPdfAttachment: boolean = false,
  userName?: string,
  hasICSAttachment: boolean = false
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

  // Collect calendar events
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

  const pdfNote = hasPdfAttachment
    ? "\n\nNOTE: A detailed PDF report with all search results is attached to this email. Mention this in the email."
    : "";

  const icsNote = hasICSAttachment
    ? "\n\nNOTE: Calendar invite(s) (.ics file) are attached to this email. Mention that the recipient can click to add the event(s) to their calendar."
    : "";

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
${pdfNote}
${icsNote}

TASK:
Write a complete professional email that replaces ALL placeholders in the template with actual content.

CRITICAL REQUIREMENTS:
1. Replace ALL placeholders like [Please describe...], [Manager's Name], [Your Name], etc. with real content
2. For [Manager's Name] - use "Manager" or the actual name if you know it
3. For [Your Name] use ${userName} - remove or use appropriate closing
4. Provide a HIGH-LEVEL SUMMARY (2-3 sentences) of the search findings - don't go into too much detail${
    hasPdfAttachment ? " since the full details are in the attached PDF" : ""
  }
5. Mention key tool names or main findings, but keep it brief
6. ${
    hasPdfAttachment
      ? "MUST mention: 'Please see the attached PDF for detailed research findings with all sources and links.'"
      : "Include 2-3 key source links at the end"
  }
7. ${
    hasICSAttachment
      ? "MUST mention: 'Calendar invite(s) are attached - click to add the event(s) to your calendar.'"
      : ""
  }
8. Keep it professional, business-appropriate tone
9. Total length: ${hasPdfAttachment ? "150-250" : "250-400"} words
10. Format: Plain text paragraphs (NO markdown headers, NO bullet points)

EXAMPLE FORMAT (with PDF and Calendar):
Hi Manager,

Here's a summary of my work today, [DATE]:

Deep Work Session: [Brief description based on calendar]

AI Coding Tools Research: I researched AI-powered development tools and found several promising options including [2-3 tool names]. The landscape shows strong growth in AI-assisted coding with focus on [1-2 key trends]. 

Please see the attached PDF report for detailed findings with all sources, links, and full content from my research.

I've also scheduled the discussed events - calendar invites are attached for you to add to your calendar.

Best regards,
[Closing]

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

    return enrichEmailBodySimple(
      originalBody,
      searchSteps,
      calendarSteps,
      toolResults
    );
  }
}

function enrichEmailBodySimple(
  originalBody: string,
  searchSteps: any[],
  calendarSteps: any[],
  toolResults: Record<number, any>
): string {
  let enrichedBody = originalBody;

  enrichedBody = enrichedBody.replace(/\[Your Name\]/g, "xyz");

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

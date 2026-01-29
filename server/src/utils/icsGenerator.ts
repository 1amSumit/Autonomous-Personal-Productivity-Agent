import { createEvent, EventAttributes } from "ics";
import fs from "fs";
import path from "path";

export interface CalendarEventData {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
}


export async function generateICSFile(
  eventData: CalendarEventData,
  fileName?: string
): Promise<string> {
  const start = eventData.startTime;
  const end = eventData.endTime;


  const startArray: [number, number, number, number, number] = [
    start.getFullYear(),
    start.getMonth() + 1,
    start.getDate(),
    start.getHours(),
    start.getMinutes(),
  ];

  const endArray: [number, number, number, number, number] = [
    end.getFullYear(),
    end.getMonth() + 1,
    end.getDate(),
    end.getHours(),
    end.getMinutes(),
  ];

  const event: EventAttributes = {
    start: startArray,
    end: endArray,
    title: eventData.title,
    description: eventData.description || "",
    location: eventData.location || "",
    status: "CONFIRMED",
    busyStatus: "BUSY",
    organizer: { name: "AI Assistant", email: process.env.FROM_MAIL || "" },
  };

  // Add attendees if provided
  if (eventData.attendees && eventData.attendees.length > 0) {
    event.attendees = eventData.attendees.map((email) => ({
      name: email.split("@")[0],
      email: email,
      rsvp: true,
      partstat: "NEEDS-ACTION",
      role: "REQ-PARTICIPANT",
    }));
  }

  return new Promise((resolve, reject) => {
    createEvent(event, (error, value) => {
      if (error) {
        console.error("❌ ICS generation error:", error);
        return reject(new Error(`Failed to create ICS event: ${error.message}`));
      }

      // Create tmp directory if it doesn't exist
      const tmpDir = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedTitle = eventData.title
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase()
        .substring(0, 30);
      const icsFileName = fileName || `event-${sanitizedTitle}-${timestamp}`;
      const filePath = path.join(tmpDir, `${icsFileName}.ics`);

      // Write ICS content to file
      fs.writeFileSync(filePath, value);
      console.log(`✅ ICS file generated: ${filePath}`);

      resolve(filePath);
    });
  });
}

/**
 * Generates multiple ICS files for a list of events
 * @param events - Array of calendar event data
 * @returns Promise<string[]> - Array of paths to generated .ics files
 */
export async function generateMultipleICSFiles(
  events: CalendarEventData[]
): Promise<string[]> {
  const filePaths = await Promise.all(
    events.map((event, index) => generateICSFile(event, `event-${index + 1}`))
  );

  return filePaths;
}

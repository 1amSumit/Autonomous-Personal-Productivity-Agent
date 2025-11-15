import Event from "../models/Event";

interface InputTypes {
  title: string;
  date?: Date | string;
  startTime?: Date | string;
  endTime?: Date | string;
  durationMinutes?: number;
  description?: string;
  location?: string;
}

interface Ctx {
  userId: string;
}

export async function calendarToolExecute(
  {
    title,
    date,
    startTime,
    endTime,
    durationMinutes,
    description,
    location,
  }: InputTypes,
  ctx: Ctx
) {
  try {
    let eventDate: Date;

    if (startTime) {
      eventDate = new Date(startTime);
    } else if (date) {
      eventDate = new Date(date);
    } else {
      throw new Error("Either 'date' or 'startTime' must be provided");
    }

    if (isNaN(eventDate.getTime())) {
      throw new Error(`Invalid date format. Received: ${startTime || date}`);
    }

    let calculatedDuration = durationMinutes || 60;

    if (endTime && startTime) {
      const end = new Date(endTime);
      const start = new Date(startTime);

      if (!isNaN(end.getTime()) && !isNaN(start.getTime())) {
        calculatedDuration = Math.round(
          (end.getTime() - start.getTime()) / (1000 * 60)
        );
      }
    }

    const ev = new Event({
      title,
      description: description || "",
      date: eventDate,
      durationMinutes: calculatedDuration,
      location: location || "",
      createdBy: ctx.userId || "demo",
    });

    await ev.save();

    return {
      success: true,
      event: {
        id: ev._id,
        title: ev.title,
        description: ev.description,
        date: ev.date,
        startTime: ev.date,
        endTime: new Date(ev.date.getTime() + calculatedDuration * 60000),
        durationMinutes: ev.durationMinutes,
        location: ev.location,
      },
    };
  } catch (err: any) {
    console.error("❌ Calendar tool error:", err.message);
    throw new Error(`Event not added: ${err.message}`);
  }
}

export async function listEvents(userId: string) {
  return Event.find({ createdBy: userId || "demo" })
    .sort({ date: 1 })
    .lean();
}

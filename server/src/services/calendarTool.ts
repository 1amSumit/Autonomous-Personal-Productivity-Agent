import Event from "../models/Event";

interface inputTypes {
  title: string;
  date: Date;
  durationMinutes: number;
  description: string;
}

interface ctx {
  userId: string;
}

export async function calendrToolExecute(
  { title, date, durationMinutes = 60, description }: inputTypes,
  ctx: ctx
) {
  const ev = new Event({
    title,
    description,
    date: new Date(date),
    durationMinutes,
    createdBy: ctx.userId || "demo",
  });
  await ev.save();
  return { success: true, event: ev };
}

export async function listEvents(userId: string) {
  return Event.find({ createdBy: userId || "demo" })
    .sort({ date: 1 })
    .lean();
}

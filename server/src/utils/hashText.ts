import crypto from "crypto";

export async function hashText(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

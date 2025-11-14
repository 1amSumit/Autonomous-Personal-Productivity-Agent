import { tavily } from "@tavily/core";

const serachClient = tavily({
  apiKey: process.env.TAVILY_API_KEY as string,
});

type searchInput = {
  query: string;
  topK?: number;
};
export async function searchToolExecute(
  { query, topK = 5 }: searchInput,
  ctx: Record<string, any> = {}
) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("TAVILY API KEY not set");
  }

  try {
    const result = await serachClient.search(query, {
      maxResults: topK,
    });

    return { query, result };
  } catch (e: any) {
    throw new Error(`Tavily error: ${e.message}`);
  }
}

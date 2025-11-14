import { createClient } from "redis";

const redisClient = createClient({
  url: "redis://localhost:6379",
});

redisClient.on("error", (err: any) => console.log("Redis Error: ", err));

void redisClient.connect();

export default redisClient;

import { Redis } from "@upstash/redis";
import { emptyState, type QueueState, type Song } from "./types";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const KEY = "rokola:queue:v1";
let memoryState = emptyState();

export async function getState(): Promise<QueueState> {
  if (!redis) return structuredClone(memoryState);
  return (await redis.get<QueueState>(KEY)) ?? emptyState();
}
async function save(state: QueueState) {
  if (!redis) memoryState = state;
  else await redis.set(KEY, state);
}
export async function addSong(song: Song) {
  const state = await getState();
  if (state.current?.videoId === song.videoId || state.queue.some((item) => item.videoId === song.videoId)) {
    throw new Error("Esa canción ya está en la cola");
  }
  const limit = Math.max(1, Number(process.env.MAX_PER_CLIENT) || 3);
  if (state.queue.filter((item) => item.clientId === song.clientId).length >= limit) {
    throw new Error(`Puedes tener hasta ${limit} canciones en espera`);
  }
  if (!state.current) state.current = song;
  else state.queue.push(song);
  await save(state);
}
export async function advance(expectedId?: string) {
  const state = await getState();
  if (expectedId && state.current?.id !== expectedId) return state;
  state.current = state.queue.shift() ?? null;
  await save(state);
  return state;
}
export async function mutateQueue(action: "remove" | "priority" | "up" | "down" | "clear", id?: string) {
  const state = await getState();
  const index = state.queue.findIndex((song) => song.id === id);
  if (action === "clear") state.queue = [];
  if (action === "remove" && index >= 0) state.queue.splice(index, 1);
  if (action === "priority" && index > 0) state.queue.unshift(...state.queue.splice(index, 1));
  if (action === "up" && index > 0) [state.queue[index - 1], state.queue[index]] = [state.queue[index], state.queue[index - 1]];
  if (action === "down" && index >= 0 && index < state.queue.length - 1) [state.queue[index + 1], state.queue[index]] = [state.queue[index], state.queue[index + 1]];
  await save(state);
  return state;
}

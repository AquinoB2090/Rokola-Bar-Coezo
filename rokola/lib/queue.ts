import { Redis } from "@upstash/redis";
import { emptyState, type QueueState, type Song } from "./types";

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const KEY = "rokola:queue:v1";
type QueueRuntime = typeof globalThis & {
  __rokolaQueueState?: QueueState;
  __rokolaQueueLock?: Promise<void>;
};
const runtime = globalThis as QueueRuntime;
runtime.__rokolaQueueState ??= emptyState();

export class QueueStorageUnavailableError extends Error {}

function requireProductionRedis() {
  if (!redis && process.env.VERCEL) {
    throw new QueueStorageUnavailableError("La cola en Vercel necesita Redis compartido. Configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.");
  }
}

export async function getState(): Promise<QueueState> {
  requireProductionRedis();
  if (redis) return (await redis.get<QueueState>(KEY)) ?? emptyState();
  return structuredClone(runtime.__rokolaQueueState ?? emptyState());
}

async function updateState(mutator: (state: QueueState) => boolean | void): Promise<QueueState> {
  const previous = runtime.__rokolaQueueLock ?? Promise.resolve();
  let release!: () => void;
  runtime.__rokolaQueueLock = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    requireProductionRedis();
    const state = redis
      ? (await redis.get<QueueState>(KEY)) ?? emptyState()
      : structuredClone(runtime.__rokolaQueueState ?? emptyState());
    const shouldSave = mutator(state) !== false;
    if (shouldSave) {
      if (redis) await redis.set(KEY, state);
      else runtime.__rokolaQueueState = structuredClone(state);
    }
    return structuredClone(state);
  } finally {
    release();
  }
}

export async function addSong(song: Song) {
  await updateState((state) => {
    if (state.current?.videoId === song.videoId || state.queue.some((item) => item.videoId === song.videoId)) {
      throw new Error("Esa canción ya está en la cola");
    }
    const limit = Math.max(1, Number(process.env.MAX_PER_CLIENT) || 10);
    if (state.queue.filter((item) => item.clientId === song.clientId).length >= limit) {
      throw new Error(`Puedes tener hasta ${limit} canciones en espera`);
    }
    if (!state.current) state.current = song;
    else state.queue.push(song);
  });
}

export async function advance(expectedId?: string) {
  return updateState((state) => {
    if (expectedId && state.current?.id !== expectedId) return false;
    state.current = state.queue.shift() ?? null;
  });
}

export async function mutateQueue(action: "remove" | "priority" | "up" | "down" | "clear", id?: string) {
  return updateState((state) => {
    const index = state.queue.findIndex((song) => song.id === id);
    const originalLength = state.queue.length;

    if (action === "clear") state.queue = [];
    else if (action === "remove" && index >= 0) state.queue = state.queue.filter((song) => song.id !== id);
    else if (action === "priority" && index > 0) {
      const selected = state.queue[index];
      state.queue = [selected, ...state.queue.filter((song) => song.id !== id)];
    } else if (action === "up" && index > 0) {
      const reordered = [...state.queue];
      [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
      state.queue = reordered;
    } else if (action === "down" && index >= 0 && index < state.queue.length - 1) {
      const reordered = [...state.queue];
      [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
      state.queue = reordered;
    }

    if (action === "priority" && state.queue.length !== originalLength) {
      throw new Error("No se pudo cambiar la prioridad; la cola quedó sin cambios");
    }
  });
}

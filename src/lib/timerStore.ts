import fs from 'fs';
import path from 'path';

export interface TimerState {
  startedAt: string | null; // ISO 8601 string or null
  durationSeconds: number;  // Default: 300 (5 minutes)
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'timer-state.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Check if Vercel KV env variables are available
function isKvEnabled() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Helper to make call to Vercel KV REST API via vanilla fetch
async function kvCommand(command: string[]): Promise<any> {
  const url = process.env.KV_REST_API_URL!;
  const token = process.env.KV_REST_API_TOKEN!;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command),
      // Prevent Next.js from caching KV fetches in Route Handlers
      cache: 'no-store'
    });
    
    if (!res.ok) {
      console.error(`KV command failed: ${res.statusText}`);
      return null;
    }
    
    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error('Error executing KV command:', err);
    return null;
  }
}

export async function readState(): Promise<TimerState> {
  if (isKvEnabled()) {
    const data = await kvCommand(['GET', 'timer-state']);
    if (data) {
      try {
        return JSON.parse(data);
      } catch (err) {
        console.error('Error parsing KV state:', err);
      }
    }
    
    // Default if not found in KV
    const defaultState: TimerState = {
      startedAt: null,
      durationSeconds: 300 // 5 minutes default
    };
    await writeState(defaultState);
    return defaultState;
  }

  // Fallback to local files
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading timer state file, resetting to default.', err);
  }
  
  const defaultState: TimerState = {
    startedAt: null,
    durationSeconds: 300 // 5 minutes default
  };
  await writeState(defaultState);
  return defaultState;
}

export async function writeState(state: TimerState): Promise<void> {
  if (isKvEnabled()) {
    await kvCommand(['SET', 'timer-state', JSON.stringify(state)]);
    return;
  }

  // Fallback to local files
  ensureDataDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing timer state file:', err);
  }
}

export async function getTimerState() {
  const state = await readState();
  const serverTime = new Date().toISOString();
  
  if (!state.startedAt) {
    return {
      status: 'idle' as const,
      remainingSeconds: state.durationSeconds,
      durationSeconds: state.durationSeconds,
      serverTime
    };
  }
  
  const startedAtMs = new Date(state.startedAt).getTime();
  const nowMs = Date.now();
  const elapsedSeconds = (nowMs - startedAtMs) / 1000;
  
  if (elapsedSeconds >= state.durationSeconds) {
    return {
      status: 'ended' as const,
      remainingSeconds: 0,
      durationSeconds: state.durationSeconds,
      serverTime
    };
  }
  
  return {
    status: 'running' as const,
    remainingSeconds: Math.max(0, state.durationSeconds - elapsedSeconds),
    durationSeconds: state.durationSeconds,
    serverTime
  };
}

export async function startTimer(): Promise<TimerState> {
  const state = await readState();
  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
    await writeState(state);
  }
  return state;
}

export async function resetTimer(): Promise<TimerState> {
  const state = await readState();
  state.startedAt = null;
  await writeState(state);
  return state;
}

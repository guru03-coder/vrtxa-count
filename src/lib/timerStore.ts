import fs from 'fs';
import path from 'path';

export interface TimerState {
  startedAt: string | null; // ISO 8601 string or null
  durationSeconds: number;  // Default: 86400 (24 hours)
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'timer-state.json');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readState(): TimerState {
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
    durationSeconds: 86400 // 24 hours
  };
  writeState(defaultState);
  return defaultState;
}

export function writeState(state: TimerState): void {
  ensureDataDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing timer state file:', err);
  }
}

export function getTimerState() {
  const state = readState();
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

export function startTimer(): TimerState {
  const state = readState();
  if (!state.startedAt) {
    state.startedAt = new Date().toISOString();
    writeState(state);
  }
  return state;
}

export function resetTimer(): TimerState {
  const state = readState();
  state.startedAt = null;
  writeState(state);
  return state;
}

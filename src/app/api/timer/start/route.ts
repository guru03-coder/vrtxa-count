import { NextResponse } from 'next/server';
import { startTimer, getTimerState } from '@/lib/timerStore';

export async function POST() {
  try {
    startTimer();
    const currentState = getTimerState();
    return NextResponse.json(currentState);
  } catch (error) {
    console.error('Error starting timer:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

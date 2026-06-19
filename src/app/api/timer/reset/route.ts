import { NextResponse } from 'next/server';
import { resetTimer, getTimerState } from '@/lib/timerStore';

const ORGANIZER_PIN = '2026';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { pin } = body;
    if (pin !== ORGANIZER_PIN) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Invalid PIN' }, { status: 401 });
    }

    await resetTimer();
    const currentState = await getTimerState();
    return NextResponse.json(currentState);
  } catch (error) {
    console.error('Error resetting timer:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

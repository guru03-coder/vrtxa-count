import { NextResponse } from 'next/server';
import { getTimerState } from '@/lib/timerStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const currentState = await getTimerState();
    return NextResponse.json(currentState);
  } catch (error) {
    console.error('Error fetching timer state:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  initializeScheduler,
  getSchedules,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  ScheduleConfig
} from '@/lib/cronManager';

// Initialize the scheduler when this module loads
initializeScheduler();

export async function GET() {
  const schedules = await getSchedules();
  return NextResponse.json({ schedules });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'add') {
      const schedule: ScheduleConfig = {
        id: `sched_${Date.now()}`,
        name: body.name || 'Auto Check',
        type: body.type || 'both',
        cronExpression: body.cronExpression,
        enabled: body.enabled !== false,
        teamName: body.teamName || 'all',
        imapEmail: body.imapEmail,
        imapPassword: body.imapPassword,
        inboxLabel: body.inboxLabel
      };
      const schedules = await addSchedule(schedule);
      return NextResponse.json({ schedules, added: schedule });
    }

    if (action === 'update') {
      const schedules = await updateSchedule(body.id, body.updates);
      return NextResponse.json({ schedules });
    }

    if (action === 'delete') {
      const schedules = await deleteSchedule(body.id);
      return NextResponse.json({ schedules });
    }

    if (action === 'toggle') {
      const schedules = await updateSchedule(body.id, { enabled: body.enabled });
      return NextResponse.json({ schedules });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    console.error('Schedule API error:', e);
    return NextResponse.json({ error: 'Failed to manage schedule' }, { status: 500 });
  }
}

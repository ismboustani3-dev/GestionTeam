import { NextRequest, NextResponse } from 'next/server';
import {
  initializeScheduler,
  getSchedules,
  addSchedule,
  addSchedules,
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
      if (body.schedules && Array.isArray(body.schedules)) {
        const schedulesToAdd: ScheduleConfig[] = body.schedules.map((item: any, idx: number) => {
          const s: ScheduleConfig = {
            id: `sched_${Date.now()}_${idx}_${Math.floor(Math.random() * 1000)}`,
            name: item.name || 'Auto Check',
            type: item.type || 'both',
            cronExpression: item.cronExpression,
            enabled: item.enabled !== false,
            teamName: item.teamName || 'all'
          };
          if (item.imapEmail !== undefined) s.imapEmail = item.imapEmail;
          if (item.imapPassword !== undefined) s.imapPassword = item.imapPassword;
          if (item.inboxLabel !== undefined) s.inboxLabel = item.inboxLabel;
          return s;
        });
        const schedules = await addSchedules(schedulesToAdd);
        return NextResponse.json({ schedules, added: schedulesToAdd });
      } else {
        const schedule: ScheduleConfig = {
          id: `sched_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: body.name || 'Auto Check',
          type: body.type || 'both',
          cronExpression: body.cronExpression,
          enabled: body.enabled !== false,
          teamName: body.teamName || 'all'
        };
        if (body.imapEmail !== undefined) schedule.imapEmail = body.imapEmail;
        if (body.imapPassword !== undefined) schedule.imapPassword = body.imapPassword;
        if (body.inboxLabel !== undefined) schedule.inboxLabel = body.inboxLabel;
        const schedules = await addSchedule(schedule);
        return NextResponse.json({ schedules, added: schedule });
      }
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

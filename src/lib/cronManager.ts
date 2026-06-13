import cron, { ScheduledTask } from 'node-cron';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ScheduleConfig {
  id: string;
  name: string;
  type: string;  // rdns | vmta | both | blacklist_ips | blacklist_domains | blacklist_both | payment_notice | spf | imap_sync | old_age_N | by_provider_NAME
  cronExpression: string;
  enabled: boolean;
  lastRun?: string;
  teamName?: string;
  imapEmail?: string;
  imapPassword?: string;
  inboxLabel?: string;
}

const SCHEDULE_REF = doc(db, 'appData', 'schedules');

// Use global variables to persist cron tasks and initialization across Next.js hot-reloads
if (!(global as any).cronActiveTasks) {
  (global as any).cronActiveTasks = new Map<string, ScheduledTask>();
}
const activeTasks: Map<string, ScheduledTask> = (global as any).cronActiveTasks;

async function loadSchedules(): Promise<ScheduleConfig[]> {
  try {
    const snap = await getDoc(SCHEDULE_REF);
    if (snap.exists()) {
      return snap.data().schedules || [];
    }
  } catch (e) {
    console.error('Failed to load schedules:', e);
  }
  return [];
}

import fs from 'fs';
import path from 'path';

async function saveSchedules(schedules: ScheduleConfig[]) {
  try {
    const cleaned = JSON.parse(JSON.stringify(schedules));
    await setDoc(SCHEDULE_REF, { schedules: cleaned });
  } catch (e) {
    console.error('Failed to save schedules:', e);
  }
  try {
    fs.writeFileSync(path.join(process.cwd(), 'schedules.json'), JSON.stringify(schedules, null, 2));
  } catch (e) {}
}

async function executeCheck(schedule: ScheduleConfig) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  console.log(`[CRON] Running scheduled check: ${schedule.name} (${schedule.type})`);

  try {
    if (schedule.type === 'rdns' || schedule.type === 'both') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rdns', teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type === 'vmta' || schedule.type === 'both') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vmta', teamName: schedule.teamName || 'all' })
      });
    }
    
    if (schedule.type === 'payment_notice') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'payment_notice', teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type === 'spf') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spf', teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type.startsWith('blacklist')) {
       await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: schedule.type, teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type.startsWith('old_age_')) {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: schedule.type, teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type.startsWith('by_provider_')) {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: schedule.type, teamName: schedule.teamName || 'all' })
      });
    }

    if (schedule.type === 'ip_status_report') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ip_status_report' })
      });
    }

    if (schedule.type === 'imap_sync') {
      await fetch(`${baseUrl}/api/cron-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           type: 'imap_sync', 
           teamName: schedule.teamName || 'all',
           email: schedule.imapEmail,
           password: schedule.imapPassword,
           inboxLabel: schedule.inboxLabel
        })
      });
    }

    // Update lastRun
    const schedules = await loadSchedules();
    const idx = schedules.findIndex(s => s.id === schedule.id);
    if (idx >= 0) {
      schedules[idx].lastRun = new Date().toISOString();
      await saveSchedules(schedules);
    }
  } catch (e) {
    console.error(`[CRON] Error running check ${schedule.name}:`, e);
  }
}

function startTask(schedule: ScheduleConfig) {
  if (activeTasks.has(schedule.id)) {
    activeTasks.get(schedule.id)?.stop();
    activeTasks.delete(schedule.id);
  }

  if (!schedule.enabled) return;

  if (!cron.validate(schedule.cronExpression)) {
    console.error(`[CRON] Invalid cron expression for ${schedule.name}: ${schedule.cronExpression}`);
    return;
  }

  const task = cron.schedule(schedule.cronExpression, () => {
    executeCheck(schedule);
  });

  activeTasks.set(schedule.id, task);
  console.log(`[CRON] Scheduled: ${schedule.name} => ${schedule.cronExpression}`);
}

export async function initializeScheduler() {
  if ((global as any).cronInitialized) {
    console.log('[CRON] Scheduler already initialized in this process.');
    return;
  }
  (global as any).cronInitialized = true;

  console.log('[CRON] Initializing Node-Cron Scheduler...');
  
  // Clean up any existing tasks before starting to avoid duplicates on hot-reload
  if (activeTasks.size > 0) {
    for (const [id, task] of activeTasks.entries()) {
      try {
        task.stop();
      } catch (e) {}
    }
    activeTasks.clear();
  }

  let schedules = await loadSchedules();
  
  // Seed a default payment notice check at 10 AM if it doesn't exist
  if (!schedules.some(s => s.type === 'payment_notice')) {
    schedules.push({
      id: `sched_payment_notice`,
      name: 'Daily Payment Notice',
      type: 'payment_notice',
      cronExpression: '0 10 * * *',
      enabled: true,
      teamName: 'all'
    });
    await saveSchedules(schedules);
  }

  schedules.forEach(schedule => {
    if (schedule.enabled) startTask(schedule);
  });
  console.log(`[CRON] Initialized ${schedules.length} schedule(s)`);
}

export async function getSchedules(): Promise<ScheduleConfig[]> {
  return await loadSchedules();
}

export async function addSchedule(schedule: ScheduleConfig): Promise<ScheduleConfig[]> {
  const schedules = await loadSchedules();
  schedules.push(schedule);
  await saveSchedules(schedules);
  if (schedule.enabled) startTask(schedule);
  return schedules;
}

export async function addSchedules(schedulesToAdd: ScheduleConfig[]): Promise<ScheduleConfig[]> {
  const schedules = await loadSchedules();
  schedules.push(...schedulesToAdd);
  await saveSchedules(schedules);
  schedulesToAdd.forEach(schedule => {
    if (schedule.enabled) startTask(schedule);
  });
  return schedules;
}

export async function updateSchedule(id: string, updates: Partial<ScheduleConfig>): Promise<ScheduleConfig[]> {
  const schedules = await loadSchedules();
  const idx = schedules.findIndex(s => s.id === id);
  if (idx >= 0) {
    schedules[idx] = { ...schedules[idx], ...updates };
    await saveSchedules(schedules);
    startTask(schedules[idx]); // restart or stop
  }
  return schedules;
}

export async function deleteSchedule(id: string): Promise<ScheduleConfig[]> {
  if (activeTasks.has(id)) {
    activeTasks.get(id)?.stop();
    activeTasks.delete(id);
  }
  let schedules = await loadSchedules();
  schedules = schedules.filter(s => s.id !== id);
  await saveSchedules(schedules);
  return schedules;
}

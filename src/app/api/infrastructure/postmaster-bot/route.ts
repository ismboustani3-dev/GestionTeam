import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Bypass Turbopack static analysis for native process execution
const getChildProcess = () => eval('require')('child_process');

const getStatusFile = () => path.join(process.cwd(), 'postmaster-bot-status.json');
const getLogFile = () => path.join(process.cwd(), 'postmaster-bot.log');
const getScriptFile = () => path.join(process.cwd(), 'automate-postmaster-remote.js');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e.code === 'EPERM';
  }
}

function getStatus() {
  let statusData = {
    status: 'idle',
    pid: null as number | null,
    mode: null as string | null,
    updatedAt: new Date().toISOString()
  };

  const statusFile = getStatusFile();
  if (fs.existsSync(statusFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (parsed.status === 'running' && parsed.pid) {
        if (isProcessRunning(parsed.pid)) {
          statusData = parsed;
        } else {
          // Process died, reset status to idle
          statusData = {
            status: 'idle',
            pid: null,
            mode: null,
            updatedAt: new Date().toISOString()
          };
          fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
        }
      } else {
        statusData = parsed;
      }
    } catch (e) {}
  }

  return statusData;
}

export async function GET() {
  const currentStatus = getStatus();
  
  let logs = '';
  const logFile = getLogFile();
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split(/\r?\n/);
      logs = lines.slice(-50).join('\n');
    } catch (e: any) {
      logs = `Error reading logs: ${e.message}`;
    }
  }

  return NextResponse.json({ ...currentStatus, logs });
}

export async function POST(request: NextRequest) {
  try {
    const { action, mode, domains } = await request.json();
    const statusFile = getStatusFile();
    const logFile = getLogFile();
    const scriptFile = getScriptFile();

    if (action === 'start') {
      const currentStatus = getStatus();
      if (currentStatus.status === 'running') {
        return NextResponse.json({ error: 'Process is already running' }, { status: 400 });
      }

      if (mode === 'delete') {
        if (!Array.isArray(domains) || domains.length === 0) {
          return NextResponse.json({ error: 'No domains provided for deletion' }, { status: 400 });
        }
        const deleteFilePath = path.join(process.cwd(), 'domains-to-delete.txt');
        fs.writeFileSync(deleteFilePath, domains.join('\n'));
      } else {
        const filterFilePath = path.join(process.cwd(), 'domains-filter.txt');
        if (Array.isArray(domains) && domains.length > 0) {
          console.log(`Writing ${domains.length} domains to domains-filter.txt`);
          fs.writeFileSync(filterFilePath, domains.join('\n'));
        } else {
          if (fs.existsSync(filterFilePath)) {
            console.log('Clearing domains-filter.txt (unfiltered run)');
            fs.unlinkSync(filterFilePath);
          }
        }
      }

      const selectedMode = mode === 'validate' ? 'validate' : 
                           (mode === 'add' ? 'add' : 
                           (mode === 'sync' ? 'sync' : 
                           (mode === 'delete' ? 'delete' : 
                           (mode === 'fetch' ? 'fetch' : 'all'))));
      
      // Initialize/Truncate log file
      fs.writeFileSync(logFile, `=== Starting Postmaster Bot (${selectedMode}) at ${new Date().toLocaleString()} ===\n`);

      const out = fs.openSync(logFile, 'a');
      const err = fs.openSync(logFile, 'a');

      console.log(`Spawning bot script: node ${scriptFile} --mode=${selectedMode}`);
      const child = getChildProcess().spawn('node', [scriptFile, `--mode=${selectedMode}`], {
        detached: true,
        stdio: ['ignore', out, err]
      });

      child.unref();

      if (!child.pid) {
        return NextResponse.json({ error: 'Failed to start child process' }, { status: 500 });
      }

      const statusData = {
        status: 'running',
        pid: child.pid,
        mode: selectedMode,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));

      return NextResponse.json({ message: 'Bot started successfully', ...statusData });
    }

    if (action === 'stop') {
      const currentStatus = getStatus();
      if (currentStatus.status !== 'running' || !currentStatus.pid) {
        return NextResponse.json({ message: 'Bot is not running' });
      }

      const pid = currentStatus.pid;
      console.log(`Killing process tree for PID ${pid}`);

      // Windows taskkill command
      const killCmd = `taskkill /F /T /PID ${pid}`;
      
      return new Promise<NextResponse>((resolve) => {
        getChildProcess().exec(killCmd, (err: any, stdout: any, stderr: any) => {
          if (err) {
            console.error('taskkill error:', err);
          }
          
          // Reset status file
          const idleStatus = {
            status: 'idle',
            pid: null,
            mode: null,
            updatedAt: new Date().toISOString()
          };
          fs.writeFileSync(statusFile, JSON.stringify(idleStatus, null, 2));
          
          // Append termination notice to log
          fs.appendFileSync(logFile, `\n=== Bot stopped by user request at ${new Date().toLocaleString()} ===\n`);

          resolve(NextResponse.json({ message: 'Bot stopped successfully', ...idleStatus }));
        });
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Error in postmaster-bot route:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

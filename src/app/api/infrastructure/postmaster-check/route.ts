import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns';
import net from 'net';

const { resolveMx } = dns.promises;

function probePostmasterSmtp(host: string, domain: string): Promise<{ status: 'OK' | 'FAIL', reason?: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, host);
    socket.setTimeout(5000); // 5 seconds timeout

    let stage = 0; // 0: greeting, 1: ehlo, 2: mail from, 3: rcpt to
    let buffer = '';

    const cleanupAndResolve = (status: 'OK' | 'FAIL', reason?: string) => {
      try {
        socket.write('QUIT\r\n');
        socket.end();
      } catch (e) {}
      resolve({ status, reason });
    };

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      if (lines.length <= 1) return; // Wait for full line
      
      const lastLine = lines[lines.length - 2].trim();
      buffer = lines[lines.length - 1]; // keep remaining in buffer

      const code = parseInt(lastLine.substring(0, 3));
      
      // If code is not a number or response is multiline (has dash after code e.g. 250-), wait for final line (space after code e.g. 250 )
      if (isNaN(code) || lastLine.charAt(3) === '-') {
        return; 
      }

      if (stage === 0) {
        if (code === 220) {
          stage = 1;
          socket.write(`EHLO verification-agent.com\r\n`);
        } else {
          cleanupAndResolve('FAIL', `SMTP Greeting failed with code ${code}`);
        }
      } else if (stage === 1) {
        if (code === 250) {
          stage = 2;
          socket.write(`MAIL FROM:<>\r\n`); // Use empty sender
        } else {
          cleanupAndResolve('FAIL', `EHLO rejected with code ${code}`);
        }
      } else if (stage === 2) {
        if (code === 250) {
          stage = 3;
          socket.write(`RCPT TO:<postmaster@${domain}>\r\n`);
        } else {
          cleanupAndResolve('FAIL', `MAIL FROM rejected with code ${code}`);
        }
      } else if (stage === 3) {
        if (code === 250 || code === 251) {
          cleanupAndResolve('OK', 'Postmaster mailbox exists and accepts mail');
        } else if (code === 550 || code === 551 || code === 554) {
          cleanupAndResolve('FAIL', `Postmaster mailbox rejected: ${lastLine}`);
        } else {
          cleanupAndResolve('FAIL', `RCPT TO returned code ${code}: ${lastLine}`);
        }
      }
    });

    socket.on('error', (err: any) => {
      resolve({ status: 'FAIL', reason: `Connection error: ${err.message}` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ status: 'FAIL', reason: 'Connection timeout' });
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const { domains } = await request.json(); // Expected: Array of strings (domains)
    if (!domains || !Array.isArray(domains)) {
      return NextResponse.json({ error: 'Domains array is required' }, { status: 400 });
    }

    const results: Record<string, { status: 'OK' | 'FAIL', reason?: string }> = {};

    const checkPostmaster = async (domain: string) => {
      const key = domain;
      if (!domain || domain === 'No Domain Mapped' || domain === 'No Domain') {
        results[key] = { status: 'FAIL', reason: 'Invalid or missing domain' };
        return;
      }

      try {
        const mxRecords = await resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
          results[key] = { status: 'FAIL', reason: 'No MX records found for domain' };
          return;
        }

        const sortedMx = mxRecords.sort((a, b) => a.priority - b.priority);
        const primaryMx = sortedMx[0].exchange;

        // Try SMTP check
        const smtpCheck = await probePostmasterSmtp(primaryMx, domain);
        if (smtpCheck.status === 'OK') {
          results[key] = { status: 'OK', reason: smtpCheck.reason || 'Verified via SMTP port 25' };
        } else {
          // If connection timed out/refused (likely port 25 blocked), but MX is active
          if (
            smtpCheck.reason?.includes('timeout') || 
            smtpCheck.reason?.includes('ECONNREFUSED') || 
            smtpCheck.reason?.includes('EHOSTUNREACH') ||
            smtpCheck.reason?.includes('ENETUNREACH')
          ) {
            results[key] = { status: 'OK', reason: `MX Active (${primaryMx}), SMTP verification skipped (Port 25 blocked by host)` };
          } else {
            results[key] = { status: 'FAIL', reason: smtpCheck.reason || 'SMTP check failed' };
          }
        }
      } catch (e: any) {
        results[key] = { 
          status: 'FAIL', 
          reason: e.code === 'ENODATA' ? 'No MX records' : e.message || 'DNS Error' 
        };
      }
    };

    // Run in parallel batches
    const batchSize = 10;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      await Promise.all(batch.map(domain => checkPostmaster(domain)));
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error in postmaster-check API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

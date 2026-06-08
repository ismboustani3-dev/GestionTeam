import { NextRequest, NextResponse } from 'next/server';
import imaps from 'imap-simple';

function extractIpFromHeaders(headers: any): string | null {
  // Common headers that might contain the sending server's IP
  const possibleHeaders = ['x-originating-ip', 'x-sender-ip', 'x-real-ip'];
  for (const h of possibleHeaders) {
    if (headers[h] && headers[h][0]) {
      const match = headers[h][0].match(/(\d+\.\d+\.\d+\.\d+)/);
      if (match) return match[1];
    }
  }

  // Fallback to parsing Received headers
  if (headers['received']) {
    // Usually the last or second to last Received header is the original sender
    for (const rec of headers['received']) {
      // Look for standard IPv4 format inside brackets or after 'from'
      const match = rec.match(/\[(\d+\.\d+\.\d+\.\d+)\]/);
      if (match) return match[1];
    }
  }
  return null;
}

async function scanFolder(connection: any, folderName: string, statusLabel: string, sinceDate: Date, results: Record<string, string>) {
  try {
    await connection.openBox(folderName);
    const searchCriteria = ['ALL', ['SINCE', sinceDate]];
    const fetchOptions = { bodies: ['HEADER.FIELDS (RECEIVED X-ORIGINATING-IP X-SENDER-IP X-REAL-IP)'], struct: false };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    
    messages.forEach((item: any) => {
      const headerPart = item.parts.find((p: any) => p.which === 'HEADER.FIELDS (RECEIVED X-ORIGINATING-IP X-SENDER-IP X-REAL-IP)');
      if (headerPart && headerPart.body) {
        const ip = extractIpFromHeaders(headerPart.body);
        if (ip && !results[ip]) {
          results[ip] = statusLabel;
        }
      }
    });
  } catch (e) {
    console.warn(`Could not scan folder ${folderName}:`, e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, inboxLabel = 'RP TEST' } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });

    const domain = email.split('@')[1];
    let host = `imap.${domain}`;
    if (domain === 'gmail.com') host = 'imap.gmail.com';
    else if (domain === 'yahoo.com') host = 'imap.mail.yahoo.com';
    else if (domain === 'outlook.com' || domain === 'hotmail.com') host = 'outlook.office365.com';

    const config = {
      imap: {
        user: email,
        password: password,
        host: host,
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    const connection = await imaps.connect(config);
    const results: Record<string, string> = {};
    
    // Scan last 48 hours to be safe
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 2);

    // Scan Inbox -> RP TEST or RDNS (based on user selection)
    await scanFolder(connection, 'INBOX', inboxLabel, sinceDate, results);

    // Get all mailboxes to find Spam/Junk folder
    const boxes = await connection.getBoxes();
    let spamFolderName = '';
    const boxNames = Object.keys(boxes);
    
    for (const name of boxNames) {
      const lower = name.toLowerCase();
      if (lower.includes('spam') || lower.includes('junk')) {
        spamFolderName = name;
        break;
      }
      // Check children (like [Gmail]/Spam)
      if (boxes[name].children) {
        for (const childName of Object.keys(boxes[name].children)) {
          if (childName.toLowerCase().includes('spam') || childName.toLowerCase().includes('junk')) {
            spamFolderName = `${name}${boxes[name].delimiter}${childName}`;
            break;
          }
        }
      }
    }

    if (!spamFolderName) {
      // Common defaults
      spamFolderName = '[Gmail]/Spam'; 
    }

    // Scan Spam -> SPAM
    await scanFolder(connection, spamFolderName, 'SPAM', sinceDate, results);

    connection.end();

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    console.error('IMAP Error:', e);
    return NextResponse.json({ error: e.message || 'Failed to connect or read IMAP' }, { status: 500 });
  }
}

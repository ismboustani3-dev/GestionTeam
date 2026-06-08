'use server';
import { NextResponse } from 'next/server';
import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { config } from 'dotenv';

config(); // Load .env variables

export async function POST(request: Request) {
  try {
    let servers = [];
    try {
      const body = await request.json();
      servers = body.servers || [];
    } catch (parseErr) {
      console.error('Failed to parse request JSON:', parseErr);
    }
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const connection = await imap.connect({
      imap: {
        user: process.env.GMAIL_USER,
        password: process.env.GMAIL_PASS,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        // Allow self-signed certificates for development environments
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 3000
      }
    });
    // Search for messages received since today (IMAP SINCE is date-only)
    const searchCriteria = [['SINCE', new Date(oneHourAgo)]];
    const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true };
    
    await connection.openBox('INBOX');
    const messagesInbox = await connection.search(searchCriteria, fetchOptions);
    
    let messagesSpam: any[] = [];
    try {
      await connection.openBox('[Gmail]/Spam');
      messagesSpam = await connection.search(searchCriteria, fetchOptions);
    } catch (e) {
      try {
        await connection.openBox('Spam');
        messagesSpam = await connection.search(searchCriteria, fetchOptions);
      } catch (e2) {
        console.error('Could not open Spam folder');
      }
    }
    
    const messages = [...messagesInbox, ...messagesSpam];

    // Enhanced parsing with fallback and debug logs
    const mapping: Record<string, string> = {};
    let processed = 0;
    for (const item of messages) {
      const headerPart = item.parts.find((p: any) => p.which === 'HEADER');
      if (!headerPart || !headerPart.body || !headerPart.body.received) continue;
      
      const received = headerPart.body.received;
      const lines = Array.isArray(received) ? received : [received];
      for (const line of lines) {
        // Robust extraction: find IP in brackets and the nearest preceding domain token
        const ipMatch = /\[([0-9]{1,3}(?:\.[0-9]{1,3}){3})\]/.exec(line);
        if (ipMatch) {
          const ip = ipMatch[1];
          // Look backward for the domain right after 'from'
          const before = line.slice(0, ipMatch.index);
          const fromMatch = /from\s+([a-zA-Z0-9.-]+)/i.exec(before);
          if (fromMatch) {
            const domain = fromMatch[1];
            mapping[ip] = domain;
          }
        }
      }
    }
    await connection.end();
    return NextResponse.json({ mapping });
  } catch (err) {
    console.error('VMTA fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch VMTA' }, { status: 500 });
  }
}

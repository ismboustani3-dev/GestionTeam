import { NextResponse } from 'next/server';

const TELEGRAM_TOKEN = '8547636296:AAHmj28T3mh10XWLa9epa5sX5vuMYLLpyY8';
const BLACKLIST_CHAT_ID = '-1003727951074';
const BLACKLIST_THREAD_ID = 11;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Chunking pour messages longs
    const lines = message.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if (line.length > 3800) {
        if (currentChunk) { chunks.push(currentChunk); currentChunk = ''; }
        let remaining = line;
        while (remaining.length > 3800) {
          chunks.push(remaining.slice(0, 3800));
          remaining = remaining.slice(3800);
        }
        currentChunk = remaining;
      } else if (currentChunk.length + line.length + 1 > 3800) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n' + line : line;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    for (let i = 0; i < chunks.length; i++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: BLACKLIST_CHAT_ID,
          message_thread_id: BLACKLIST_THREAD_ID,
          text: chunks[i],
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Telegram Blacklist API error (chunk ${i+1}/${chunks.length}):`, errorData);
        return NextResponse.json({ error: 'Failed to send message to Telegram' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, sentChunks: chunks.length });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

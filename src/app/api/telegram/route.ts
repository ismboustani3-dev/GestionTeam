'use server';

import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = '8547636296:AAHmj28T3mh10XWLa9epa5sX5vuMYLLpyY8';
const TELEGRAM_CHAT_ID = '629979553';

export async function POST(request: NextRequest) {
  try {
    const { message, chatId, threadId } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const targetChatId = chatId || TELEGRAM_CHAT_ID;

    const lines = message.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      if (line.length > 3800) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
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
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    for (let i = 0; i < chunks.length; i++) {
      const payload: any = {
        chat_id: targetChatId,
        text: chunks[i],
        parse_mode: 'HTML',
      };

      // Si threadId fourni → envoyer dans le topic
      if (threadId) {
        payload.message_thread_id = threadId;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!data.ok) {
        console.error(`Telegram sendMessage error details (chunk ${i + 1}/${chunks.length}):`, data);
        return NextResponse.json({ error: data.description || 'Telegram API error' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, sentChunks: chunks.length });
  } catch (error) {
    console.error('Telegram API error:', error);
    return NextResponse.json({ error: 'Failed to send Telegram message' }, { status: 500 });
  }
}

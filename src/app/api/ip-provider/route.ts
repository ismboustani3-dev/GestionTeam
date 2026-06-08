import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { ips = [] } = await request.json();

    if (!Array.isArray(ips) || ips.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Basic IP validation regex (both IPv4 and IPv6)
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    const validIps = ips
      .map((ip: string) => ip.trim())
      .filter((ip: string) => ipRegex.test(ip));

    if (validIps.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No valid IP addresses provided.' 
      }, { status: 400 });
    }

    // Chunk the requests to ip-api.com/batch in blocks of 100 (API limit)
    const chunkSize = 100;
    const results: any[] = [];

    for (let i = 0; i < validIps.length; i += chunkSize) {
      const chunk = validIps.slice(i, i + chunkSize);
      
      try {
        const response = await fetch('http://ip-api.com/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk)
        });

        if (!response.ok) {
          throw new Error(`ip-api returned status ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) {
          results.push(...data);
        } else {
          chunk.forEach(ip => {
            results.push({ query: ip, status: 'fail', message: 'Invalid API response' });
          });
        }
      } catch (err: any) {
        console.error('Error fetching batch from ip-api:', err);
        chunk.forEach(ip => {
          results.push({ query: ip, status: 'fail', message: err.message || 'API request failed' });
        });
      }
    }

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error('IP Provider Checker Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Server error occurred' 
    }, { status: 500 });
  }
}

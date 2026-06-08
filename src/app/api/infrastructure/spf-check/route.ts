import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns';
const { resolveTxt, resolve4 } = dns.promises;

export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json(); // Expected: Array of { domain: string, ip: string }
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 });
    }

    const results: Record<string, { status: 'OK' | 'FAIL', record: string, reason?: string }> = {};

    const checkSpf = async (domain: string, ip: string) => {
      const key = `${domain}_${ip}`;
      if (!domain || !ip) {
        results[key] = { status: 'FAIL', record: '—', reason: 'Missing Domain or IP' };
        return;
      }

      try {
        const records = await resolveTxt(domain);
        const txtStrings = records.map(r => r.join(''));
        const spfRecord = txtStrings.find(txt => txt.startsWith('v=spf1'));

        if (!spfRecord) {
          results[key] = { status: 'FAIL', record: '—', reason: 'No SPF record found' };
        } else {
          let isValid = spfRecord.includes(ip);

          // If IP not explicitly in string, check if it relies on A record
          if (!isValid && (spfRecord.includes(' a ') || spfRecord.includes(' a:') || spfRecord.includes('=spf1 a ') || spfRecord.endsWith(' a') || spfRecord.includes('+a '))) {
            try {
              const aRecords = await resolve4(domain);
              if (aRecords.includes(ip)) {
                isValid = true;
              }
            } catch (e) {}
          }

          if (isValid) {
            results[key] = { status: 'OK', record: spfRecord };
          } else {
            results[key] = { status: 'FAIL', record: spfRecord, reason: 'IP not found in SPF' };
          }
        }
      } catch (e: any) {
        results[key] = { 
          status: 'FAIL', 
          record: '—', 
          reason: e.code === 'ENODATA' ? 'No TXT records' : e.message || 'DNS Error' 
        };
      }
    };

    // Run parallel resolutions in batches of 15
    const batchSize = 15;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(item => checkSpf(item.domain, item.ip)));
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Error in spf-check API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

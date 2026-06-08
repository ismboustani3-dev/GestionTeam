import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns';

export async function POST(request: NextRequest) {
  try {
    const { domains } = await request.json();
    if (!domains || !Array.isArray(domains)) {
      return NextResponse.json({ error: 'Domains array is required' }, { status: 400 });
    }

    const results: Record<string, { exist: boolean; record: string }> = {};

    const resolveDomain = async (domain: string) => {
      try {
        const records = await dns.promises.resolveTxt(domain);
        // Find TXT record containing spf1
        const spfRecord = records.flat().find(r => r.toLowerCase().includes('v=spf1')) || '';
        results[domain] = {
          exist: spfRecord !== '',
          record: spfRecord
        };
      } catch (e: any) {
        results[domain] = {
          exist: false,
          record: e.code === 'ENODATA' ? 'No TXT records' : e.code || 'Error'
        };
      }
    };

    // Process in batches of 10 in parallel
    const batchSize = 10;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      await Promise.all(batch.map(d => resolveDomain(d)));
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

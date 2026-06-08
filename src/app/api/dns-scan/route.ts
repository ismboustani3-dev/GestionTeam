import { NextResponse } from 'next/server';
import dns from 'dns/promises';

async function scanDomain(domain: string, checkSpf: boolean, checkMx: boolean, checkDmarc: boolean) {
  const startTime = Date.now();
  let spf = '—';
  let mx = '—';
  let dmarc = '—';
  let status = 'OK';
  
  const cleanDomain = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
  if (!cleanDomain) {
    return { domain, spf, mx, dmarc, status: 'ERROR', duration: 0 };
  }

  try {
    const promises = [];

    if (checkSpf) {
      promises.push(
        (async () => {
          try {
            const txts = await dns.resolveTxt(cleanDomain);
            const spfRecord = txts.flat().find(txt => txt.startsWith('v=spf1'));
            spf = spfRecord || 'No SPF';
          } catch (e: any) {
            spf = 'No SPF';
          }
        })()
      );
    }

    if (checkMx) {
      promises.push(
        (async () => {
          try {
            const mxs = await dns.resolveMx(cleanDomain);
            mxs.sort((a, b) => a.priority - b.priority);
            mx = mxs.map(m => `${m.priority} ${m.exchange}`).join(', ') || 'No MX';
          } catch (e: any) {
            mx = 'No MX';
          }
        })()
      );
    }

    if (checkDmarc) {
      promises.push(
        (async () => {
          try {
            const txts = await dns.resolveTxt(`_dmarc.${cleanDomain}`);
            const dmarcRecord = txts.flat().find(txt => txt.startsWith('v=DMARC1'));
            dmarc = dmarcRecord || 'No DMARC';
          } catch (e: any) {
            dmarc = 'No DMARC';
          }
        })()
      );
    }

    // Set a 4-second timeout limit for the DNS queries
    await Promise.race([
      Promise.all(promises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
    ]);

  } catch (err: any) {
    status = err.message === 'Timeout' ? 'TIMEOUT' : 'ERROR';
  }

  const duration = Date.now() - startTime;
  
  // If no records were found or there was an error in all checked fields, adjust status
  const hasSpf = spf !== '—' && spf !== 'No SPF';
  const hasMx = mx !== '—' && mx !== 'No MX';
  const hasDmarc = dmarc !== '—' && dmarc !== 'No DMARC';
  
  if (status === 'OK') {
    const checkedCount = (checkSpf ? 1 : 0) + (checkMx ? 1 : 0) + (checkDmarc ? 1 : 0);
    const foundCount = (checkSpf && hasSpf ? 1 : 0) + (checkMx && hasMx ? 1 : 0) + (checkDmarc && hasDmarc ? 1 : 0);
    
    if (checkedCount > 0 && foundCount === 0) {
      status = 'FAIL'; // No records found at all
    }
  }

  return {
    domain: cleanDomain,
    spf,
    mx,
    dmarc,
    status,
    duration
  };
}

export async function POST(request: Request) {
  try {
    const { domains, checkSpf, checkMx, checkDmarc } = await request.json();
    if (!domains || !Array.isArray(domains)) {
      return NextResponse.json({ error: 'Invalid domains payload' }, { status: 400 });
    }

    // Run scans concurrently for up to 30 domains at a time to prevent system resource limits
    const results = [];
    const batchSize = 30;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(domain => scanDomain(domain, checkSpf, checkMx, checkDmarc))
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('DNS Bulk Scan Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

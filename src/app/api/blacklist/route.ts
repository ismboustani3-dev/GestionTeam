import { NextResponse } from 'next/server';
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

function reverseIp(ip: string) {
  return ip.split('.').reverse().join('.');
}

async function checkDnsbl(query: string) {
  try {
    const addresses = await resolve4(query);
    return addresses;
  } catch (error: any) {
    if (error.code === 'ENOTFOUND' || error.code === 'NXDOMAIN') {
      return []; // Not listed
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items array' }, { status: 400 });
    }

    const results = await Promise.all(items.map(async (item: any) => {
      const { serverName, ip, domain } = item;
      
      let sbl = false;
      let css = false;
      let barracuda = false;
      let dbl = false;
      let error = null;

      try {
        if (ip) {
          const revIp = reverseIp(ip);
          
          // Check Spamhaus Zen
          try {
            const zenRes = await checkDnsbl(`${revIp}.zen.spamhaus.org`);
            if (zenRes.includes('127.0.0.2')) sbl = true;
            if (zenRes.includes('127.0.0.3')) css = true;
          } catch (e: any) {
             console.error(`Error checking Zen for ${ip}:`, e.message);
          }

          // Check Barracuda
          try {
            const bblRes = await checkDnsbl(`${revIp}.b.barracudacentral.org`);
            if (bblRes.includes('127.0.0.2')) barracuda = true;
          } catch (e: any) {
             console.error(`Error checking Barracuda for ${ip}:`, e.message);
          }
        }

        if (domain && domain !== 'No Domain') {
           // Check Spamhaus DBL
           try {
             const dblRes = await checkDnsbl(`${domain}.dbl.spamhaus.org`);
             // 127.0.1.2 to 127.0.1.255 indicates a listing
             if (dblRes.some(a => a.startsWith('127.0.1.'))) {
               dbl = true;
             }
           } catch (e: any) {
             console.error(`Error checking DBL for ${domain}:`, e.message);
           }
        }

      } catch (err: any) {
        error = err.message;
      }

      return {
        serverName,
        ip,
        domain,
        sbl,
        css,
        barracuda,
        dbl,
        error
      };
    }));

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error('Blacklist check error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

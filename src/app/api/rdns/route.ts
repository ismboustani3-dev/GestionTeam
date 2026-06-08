import { NextResponse } from 'next/server';
import dns from 'dns/promises';
import { getUniqueIpDomains } from '@/lib/ipUtils';

export async function POST(request: Request) {
  try {
    const { servers } = await request.json();
    if (!servers || !Array.isArray(servers)) {
      return NextResponse.json({ error: 'Invalid servers payload' }, { status: 400 });
    }

    const results = [];

    for (const server of servers) {
      const serverResult: any = {
        serverId: server.id,
        serverName: server.serverName,
        queries: [],
        overallMatch: true
      };

      // 1. Check mapped domains (Forward and Reverse)
      const uniqueIpDomains = getUniqueIpDomains(server.ipDomains);
      if (uniqueIpDomains.length > 0) {
        for (const mapping of uniqueIpDomains) {
          // IP -> PTR
          try {
            const ptrs = await dns.reverse(mapping.ip);
            const match = ptrs.some(ptr => ptr.toLowerCase() === mapping.domain.toLowerCase() || ptr.toLowerCase() === mapping.domain.toLowerCase() + '.');
            serverResult.queries.push({
              query: mapping.ip,
              type: 'PTR',
              result: ptrs.join(', '),
              match: match ? 'OK' : 'FAIL'
            });
            if (!match) serverResult.overallMatch = false;
          } catch (e: any) {
            serverResult.queries.push({
              query: mapping.ip,
              type: 'PTR',
              result: e.code || 'FAIL',
              match: 'FAIL'
            });
            serverResult.overallMatch = false;
          }

          // Domain -> A
          try {
            const aRecords = await dns.resolve4(mapping.domain);
            const match = aRecords.includes(mapping.ip);
            serverResult.queries.push({
              query: mapping.domain,
              type: 'A',
              result: aRecords.join(', '),
              match: match ? 'OK' : 'FAIL'
            });
            if (!match) serverResult.overallMatch = false;
          } catch (e: any) {
            serverResult.queries.push({
              query: mapping.domain,
              type: 'A',
              result: e.code || 'FAIL',
              match: 'FAIL'
            });
            serverResult.overallMatch = false;
          }
        }
      } else if (server.mainIp) {
        // If no mapped domains, just do a basic reverse lookup on main IP to see if anything resolves
        try {
          const ptrs = await dns.reverse(server.mainIp);
          serverResult.queries.push({
            query: server.mainIp,
            type: 'PTR',
            result: ptrs.join(', '),
            match: ptrs.length > 0 ? 'OK' : 'FAIL'
          });
          if (ptrs.length === 0) serverResult.overallMatch = false;
        } catch (e: any) {
          serverResult.queries.push({
            query: server.mainIp,
            type: 'PTR',
            result: e.code || 'FAIL',
            match: 'FAIL'
          });
          serverResult.overallMatch = false;
        }
      }

      results.push(serverResult);
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('RDNS Audit Error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

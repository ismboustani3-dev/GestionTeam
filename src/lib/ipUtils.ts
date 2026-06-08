export interface IpDomainMapping {
  ip: string;
  domain: string;
}

/**
 * Filters the list of IP-domain mappings to keep only the last (most recent)
 * domain mapping for each unique IP address.
 */
export function getUniqueIpDomains(ipDomains?: IpDomainMapping[]): IpDomainMapping[] {
  if (!ipDomains || !Array.isArray(ipDomains)) return [];
  const uniqueList: IpDomainMapping[] = [];
  const seenIps = new Set<string>();
  
  // Traverse in reverse to pick the latest mapping for each unique IP
  for (let i = ipDomains.length - 1; i >= 0; i--) {
    const mapping = ipDomains[i];
    if (mapping && mapping.ip) {
      const trimmedIp = mapping.ip.trim();
      if (trimmedIp && !seenIps.has(trimmedIp)) {
        seenIps.add(trimmedIp);
        uniqueList.unshift({
          ip: trimmedIp,
          domain: (mapping.domain || '').trim()
        });
      }
    }
  }
  return uniqueList;
}

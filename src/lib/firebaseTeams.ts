import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const DOC_REF = doc(db, "appData", "teams");

export async function loadTeamsFromFirebase(): Promise<any[] | null> {
  // AGGRESSIVE RECOVERY
  try {
    const saved = window.localStorage.getItem('gestiq_teams_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        let fbTeams: any[] = [];
        try {
          const snap = await getDoc(DOC_REF);
          if (snap.exists()) fbTeams = snap.data().teams || [];
        } catch (e) {
          console.warn('Firebase error during recovery check, assuming empty.');
        }
        
        const localServersCount = parsed.reduce((acc: number, t: any) => acc + (t.servers?.length || 0), 0);
        const fbServersCount = fbTeams.reduce((acc: number, t: any) => acc + (t.servers?.length || 0), 0);
        
        // If local has more data than FB, we MUST recover!
        if (localServersCount > fbServersCount || (localServersCount > 0 && fbServersCount === 0)) {
          console.log('[RECOVERY] Restoring from localstorage...');
          await saveTeamsToFirebase(parsed);
          return parsed;
        }
      }
    }
  } catch(e) {
    console.error('[RECOVERY] Error during localstorage check', e);
  }

  try {
    const snap = await getDoc(DOC_REF);
    if (snap.exists() && snap.data().teams && snap.data().teams.length > 0) {
      return snap.data().teams;
    }
  } catch (e) {
    console.error("Failed to load teams from firebase", e);
  }
  
  return null;
}

export async function saveTeamsToFirebase(teams: any[]) {
  try {
    await setDoc(DOC_REF, { teams });
  } catch (e) {
    console.error("Failed to save teams to firebase", e);
  }
  try {
    window.localStorage.setItem('gestiq_teams_data', JSON.stringify(teams));
  } catch (e) {}
}

const BL_RESULTS_REF = doc(db, "appData", "blacklist_results");

export async function loadBlacklistResultsFromFirebase(): Promise<any | null> {
  try {
    const snap = await getDoc(BL_RESULTS_REF);
    if (snap.exists() && Object.keys(snap.data().results || {}).length > 0) {
      return snap.data().results;
    }
  } catch (e) {
    console.error("Failed to load blacklist results from firebase", e);
  }
  
  // Fallback to localStorage
  try {
    const saved = window.localStorage.getItem('blacklist_results_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Object.keys(parsed).length > 0) {
        await saveBlacklistResultsToFirebase(parsed);
        return parsed;
      }
    }
  } catch(e) {}
  
  return null;
}

export async function saveBlacklistResultsToFirebase(results: any) {
  try {
    await setDoc(BL_RESULTS_REF, { results });
  } catch (e) {
    console.error("Failed to save blacklist results to firebase", e);
  }
  try {
    window.localStorage.setItem('blacklist_results_data', JSON.stringify(results));
  } catch (e) {}
}

const IP_STATUS_REF = doc(db, "appData", "ip_status");

export async function loadIpStatusFromFirebase(): Promise<any | null> {
  try {
    const snap = await getDoc(IP_STATUS_REF);
    if (snap.exists() && snap.data().history) {
      return snap.data().history;
    }
  } catch (e) {
    console.error("Failed to load IP status from firebase", e);
  }
  return null;
}

export async function saveIpStatusToFirebase(history: any) {
  try {
    await setDoc(IP_STATUS_REF, { history });
  } catch (e) {
    console.error("Failed to save IP status to firebase", e);
  }
}

const GESTION_RP_REF = doc(db, "appData", "gestion_rp");

export async function loadGestionRpFromFirebase(): Promise<any | null> {
  try {
    const snap = await getDoc(GESTION_RP_REF);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    console.error("Failed to load Gestion RP from firebase", e);
  }
  return null;
}

export async function saveGestionRpToFirebase(data: any) {
  try {
    await setDoc(GESTION_RP_REF, data);
  } catch (e) {
    console.error("Failed to save Gestion RP to firebase", e);
  }
}

const WARMUP_REF = doc(db, "appData", "warmup");

export async function loadWarmupFromFirebase(): Promise<any | null> {
  try {
    const snap = await getDoc(WARMUP_REF);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) {
    console.error("Failed to load Warmup data from firebase", e);
  }
  return null;
}

export async function saveWarmupToFirebase(data: any) {
  try {
    await setDoc(WARMUP_REF, data);
  } catch (e) {
    console.error("Failed to save Warmup data to firebase", e);
  }
}

const MONITOR_REF = doc(db, "appData", "database_monitor");

export async function loadMonitorLogsFromFirebase(): Promise<any[]> {
  try {
    const snap = await getDoc(MONITOR_REF);
    if (snap.exists() && snap.data().logs) {
      return snap.data().logs;
    }
  } catch (e) {
    console.error("Failed to load monitor logs from firebase", e);
  }
  return [];
}

export async function addMonitorLogToFirebase(action: string, details: string) {
  try {
    const logs = await loadMonitorLogsFromFirebase();
    const newLog = {
      timestamp: Date.now(),
      action,
      details
    };
    const updated = [newLog, ...logs].slice(0, 1000);
    await setDoc(MONITOR_REF, { logs: updated });
  } catch (e) {
    console.error("Failed to add monitor log to firebase", e);
  }
}



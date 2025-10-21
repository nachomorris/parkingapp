// ---------- Firebase SDK (CDN v11) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove,
  get,
  query,
  orderByChild,
  equalTo,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

// ---------- TU CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyBMdSRkAjfWGOP0cnTUI2UEsbXBI3vTNIo",
  authDomain: "parking-c5830.firebaseapp.com",
  databaseURL: "https://parking-c5830-default-rtdb.firebaseio.com",
  projectId: "parking-c5830",
  storageBucket: "parking-c5830.appspot.com",
  messagingSenderId: "242733687477",
  appId: "1:242733687477:web:46cc3ac60656e14d114fc",
  measurementId: "G-W9WTM7PT7Z"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
console.log("Firebase OK ✅");

// ---------- LocalStorage helpers ----------
const LS = {
  get(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
};
const KEYS = {
  PENDING_ENTRADAS: "parking_pending_entradas",
  PENDING_SALIDAS:  "parking_pending_salidas",
  IDMAP:            "parking_localId_to_firebaseId"
};

// ---------- Estado online/offline ----------
const isOnline = () => navigator.onLine === true;
window.addEventListener("online",  () => { console.log("🔌 Online");  processQueues(); });
window.addEventListener("offline", () => { console.log("📴 Offline"); });

// ---------- Mapa localId -> firebaseId ----------
function idMapGet(localId) {
  const map = LS.get(KEYS.IDMAP, {});
  return map[localId] || null;
}
function idMapSet(localId, firebaseId) {
  const map = LS.get(KEYS.IDMAP, {});
  map[localId] = firebaseId;
  LS.set(KEYS.IDMAP, map);
}
function idMapDeleteLocal(localId) {
  const map = LS.get(KEYS.IDMAP, {});
  delete map[localId];
  LS.set(KEYS.IDMAP, map);
}

// ---------- API: Alta de entrada ----------
export async function addEntrada({ placa, tipo, notas, entradaISO, horaTexto }) {
  if (isOnline()) {
    const key = push(ref(db, "estacionados")).key;
    await set(ref(db, `estacionados/${key}`), {
      id: key, placa, tipo, notas, entradaISO, horaTexto
    });
    return key;
  } else {
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    pend.push({ id: localId, placa, tipo, notas, entradaISO, horaTexto });
    LS.set(KEYS.PENDING_ENTRADAS, pend);
    console.log("📦 Entrada en cola:", localId);
    return localId;
  }
}

// ---------- Suscripción al listado ----------
export function onEstacionados(callback) {
  const r = ref(db, "estacionados");
  onValue(r, (snap) => {
    const val = snap.val() || {};
    let arr = Object.values(val).sort((a,b) =>
      (b.entradaISO || "").localeCompare(a.entradaISO || "")
    );

    // Si estoy offline, muestro también las pendientes
    const pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    if (!isOnline() && pend.length) {
      const existing = new Set(arr.map(x => `${x.placa}|${x.entradaISO}`));
      const toMerge = pend.filter(x => !existing.has(`${x.placa}|${x.entradaISO}`));
      arr = [...toMerge, ...arr];
    }
    callback(arr);
  });
}

// ---------- Guardar SALIDA en /salidas ----------
async function writeSalida(meta, estacionadoIdOrNull) {
  // meta debe traer: placa, tipo, notas, entradaISO, salidaISO, totalMin, totalCobrado, duracionTexto
  const key = push(ref(db, "salidas")).key;
  await set(ref(db, `salidas/${key}`), {
    id: key,
    ...meta,
    estacionadoId: estacionadoIdOrNull || null,
    ts: new Date().toISOString()
  });
}

// ---------- Baja de entrada (SALIDA) + HISTORIAL ----------
export async function removeEstacionado(id, meta = null) {
  // meta puede venir nula si el caller viejo no lo envía; pero tu index ahora sí la manda.
  const salidaPayload = meta || {};

  // Caso 1: id real de Firebase
  if (!id.startsWith("local-")) {
    if (isOnline()) {
      // 1) guardo historial
      await writeSalida(salidaPayload, id);
      // 2) borro de estacionados
      await remove(ref(db, `estacionados/${id}`));
      return;
    } else {
      // Encolo la salida con id Firebase y meta
      const outs = LS.get(KEYS.PENDING_SALIDAS, []);
      outs.push({ id, meta: salidaPayload });
      LS.set(KEYS.PENDING_SALIDAS, outs);
      console.log("📦 Salida en cola (firebaseId):", id);
      return;
    }
  }

  // Caso 2: id local (offline)
  const localId = id;

  if (isOnline()) {
    // Intento resolver el firebaseId
    let firebaseId = idMapGet(localId);
    if (!firebaseId) {
      const q = query(ref(db, "estacionados"), orderByChild("idOriginal"), equalTo(localId));
      const snap = await get(q);
      const data = snap.val() || {};
      const keys = Object.keys(data);
      if (keys.length > 0) {
        firebaseId = keys[0];
        idMapSet(localId, firebaseId);
      }
    }

    if (firebaseId) {
      await writeSalida(salidaPayload, firebaseId);
      await remove(ref(db, `estacionados/${firebaseId}`));
      idMapDeleteLocal(localId);
    } else {
      // Aún no subió su réplica → encolo salida por localId + meta
      const outs = LS.get(KEYS.PENDING_SALIDAS, []);
      outs.push({ localId, meta: salidaPayload });
      LS.set(KEYS.PENDING_SALIDAS, outs);
      console.log("📦 Salida en cola (localId):", localId);
    }
  } else {
    // Sin conexión: encolo salida por localId y saco de pendientes de entrada para que desaparezca de la UI
    const outs = LS.get(KEYS.PENDING_SALIDAS, []);
    outs.push({ localId, meta: salidaPayload });
    LS.set(KEYS.PENDING_SALIDAS, outs);

    let pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    pend = pend.filter(x => x.id !== localId);
    LS.set(KEYS.PENDING_ENTRADAS, pend);

    console.log("📦 Salida en cola OFF (localId):", localId);
  }
}

// ---------- Procesar colas ----------
async function processQueues() {
  if (!isOnline()) return;

  // 1) Subo ENTRADAS pendientes
  let pend = LS.get(KEYS.PENDING_ENTRADAS, []);
  for (const item of pend) {
    try {
      const key = push(ref(db, "estacionados")).key;
      await set(ref(db, `estacionados/${key}`), {
        id: key,
        idOriginal: item.id,
        placa: item.placa,
        tipo: item.tipo,
        notas: item.notas,
        entradaISO: item.entradaISO,
        horaTexto: item.horaTexto
      });
      idMapSet(item.id, key);
      pend = LS.get(KEYS.PENDING_ENTRADAS, []).filter(x => x.id !== item.id);
      LS.set(KEYS.PENDING_ENTRADAS, pend);
    } catch (e) {
      console.warn("Error subiendo entrada pendiente", item, e);
    }
  }

  // 2) Proceso SALIDAS pendientes
  let outs = LS.get(KEYS.PENDING_SALIDAS, []);
  const remaining = [];
  for (const o of outs) {
    try {
      let firebaseId = o.id || null;

      if (!firebaseId && o.localId) {
        firebaseId = idMapGet(o.localId);
        if (!firebaseId) {
          const q = query(ref(db, "estacionados"), orderByChild("idOriginal"), equalTo(o.localId));
          const snap = await get(q);
          const data = snap.val() || {};
          const keys = Object.keys(data);
          if (keys.length > 0) {
            firebaseId = keys[0];
            idMapSet(o.localId, firebaseId);
          }
        }
      }

      if (firebaseId) {
        // 1) historial
        await writeSalida(o.meta || {}, firebaseId);
        // 2) baja de estacionados
        await remove(ref(db, `estacionados/${firebaseId}`));
        if (o.localId) idMapDeleteLocal(o.localId);
      } else {
        // No lo pude resolver aún; lo reintento más tarde
        remaining.push(o);
      }
    } catch (e) {
      console.warn("Error procesando salida pendiente", o, e);
      remaining.push(o);
    }
  }
  LS.set(KEYS.PENDING_SALIDAS, remaining);
}

// Arranque: si ya estamos online, proceso colas
if (isOnline()) {
  processQueues();
}

// ---------- Debug helpers ----------
window.firebase = { app, db };
window.firebaseDebug = {
  queues() {
    return {
      entradas: LS.get(KEYS.PENDING_ENTRADAS, []),
      salidas:  LS.get(KEYS.PENDING_SALIDAS, []),
      map:      LS.get(KEYS.IDMAP, {})
    };
  },
  async forceProcess() { await processQueues(); console.log("✔ Reproceso manual de colas"); }
};

export { app, db };

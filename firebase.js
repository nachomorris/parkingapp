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

// ---------- CONFIG ----------
const firebaseConfig = {
  apiKey: "AIzaSyBMdSRkAjfWGOP0cnTUI2UEsbXBI3vTNIo",
  authDomain: "parking-c5830.firebaseapp.com",
  databaseURL: "https://parking-c5830-default-rtdb.firebaseio.com",
  projectId: "parking-c5830",
  storageBucket: "parking-c5830.appspot.com",
  messagingSenderId: "242733687477",
  appId: "1:242733687477:web:46cc3ac60656e14d114fc",
  measurementId: "G-W9WTM7PT7Z",
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
window.addEventListener("online",  () => { console.log("🔌 Volvimos online"); processQueues(); });
window.addEventListener("offline", () => { console.log("📴 Sin conexión"); });

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
    // Online: grabo directo
    const key = push(ref(db, "estacionados")).key;
    await set(ref(db, `estacionados/${key}`), {
      id: key,
      placa, tipo, notas, entradaISO, horaTexto
    });
    return key;
  } else {
    // Offline: guardo en cola con id local
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    pend.push({ id: localId, placa, tipo, notas, entradaISO, horaTexto });
    LS.set(KEYS.PENDING_ENTRADAS, pend);
    console.log("📦 Entrada en cola:", localId);
    return localId;
  }
}

// ---------- Suscripción al listado ----------
let onValueUnsub = null;
export function onEstacionados(callback) {
  // Me suscribo a Firebase
  const r = ref(db, "estacionados");
  onValueUnsub = onValue(r, (snap) => {
    const val = snap.val() || {};
    let arr = Object.values(val).sort((a,b) =>
      (b.entradaISO || "").localeCompare(a.entradaISO || "")
    );

    // Si estoy offline, agrego lo pendiente (para que el operador lo vea igual)
    const pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    if (!isOnline() && pend.length) {
      // Evito duplicar por misma placa y mismo timestamp
      const existingKeys = new Set(arr.map(x => `${x.placa}|${x.entradaISO}`));
      const toMerge = pend.filter(x => !existingKeys.has(`${x.placa}|${x.entradaISO}`));
      arr = [...toMerge, ...arr];
    }

    callback(arr);
  });
}

// ---------- Baja de entrada (SALIDA) ----------
export async function removeEstacionado(id) {
  // Caso 1: id real de Firebase
  if (!id.startsWith("local-")) {
    if (isOnline()) {
      await remove(ref(db, `estacionados/${id}`));
      return;
    } else {
      // No hay conexión: encolo la salida por id Firebase
      const outs = LS.get(KEYS.PENDING_SALIDAS, []);
      outs.push({ id });
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
      // Busco por idOriginal == localId
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
      await remove(ref(db, `estacionados/${firebaseId}`));
      idMapDeleteLocal(localId);
    } else {
      // Aún no subió su replica → encolo salida por localId
      const outs = LS.get(KEYS.PENDING_SALIDAS, []);
      outs.push({ localId });
      LS.set(KEYS.PENDING_SALIDAS, outs);
      console.log("📦 Salida en cola (localId):", localId);
    }
  } else {
    // Sin conexión: encolo salida por localId y saco de los pendientes de entrada si existiera
    const outs = LS.get(KEYS.PENDING_SALIDAS, []);
    outs.push({ localId });
    LS.set(KEYS.PENDING_SALIDAS, outs);

    // Limpieza visual: si aún estaba en pendientes de entrada, lo saco (desaparece de la UI)
    let pend = LS.get(KEYS.PENDING_ENTRADAS, []);
    const before = pend.length;
    pend = pend.filter(x => x.id !== localId);
    if (pend.length !== before) {
      LS.set(KEYS.PENDING_ENTRADAS, pend);
    }
    console.log("📦 Salida en cola OFF (localId):", localId);
  }
}

// ---------- Procesamiento de colas al volver online ----------
async function processQueues() {
  if (!isOnline()) return;

  // 1) Subo ENTRADAS pendientes
  let pend = LS.get(KEYS.PENDING_ENTRADAS, []);
  if (pend.length) {
    console.log(`⬆️ Subiendo ${pend.length} entradas pendientes...`);
  }
  for (const item of pend) {
    try {
      const key = push(ref(db, "estacionados")).key;
      await set(ref(db, `estacionados/${key}`), {
        id: key,
        idOriginal: item.id, // <- vínculo para poder borrarlo luego
        placa: item.placa,
        tipo: item.tipo,
        notas: item.notas,
        entradaISO: item.entradaISO,
        horaTexto: item.horaTexto
      });
      // guardo mapping local → firebase
      idMapSet(item.id, key);
      // lo saco de la cola
      let now = LS.get(KEYS.PENDING_ENTRADAS, []);
      now = now.filter(x => x.id !== item.id);
      LS.set(KEYS.PENDING_ENTRADAS, now);
    } catch (e) {
      console.warn("Error subiendo entrada pendiente", item, e);
    }
  }

  // 🔄 Espera breve para que onValue vea los nuevos nodos
  await new Promise(r => setTimeout(r, 350));

  // 2) Proceso SALIDAS pendientes
  let outs = LS.get(KEYS.PENDING_SALIDAS, []);
  if (outs.length) {
    console.log(`⬇️ Procesando ${outs.length} salidas pendientes...`);
  }
  const remaining = [];
  for (const o of outs) {
    try {
      let firebaseId = o.id || null;

      if (!firebaseId && o.localId) {
        // Intento mapping directo
        firebaseId = idMapGet(o.localId);
        if (!firebaseId) {
          // Busco por idOriginal
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
        await remove(ref(db, `estacionados/${firebaseId}`));
        if (o.localId) idMapDeleteLocal(o.localId);
      } else {
        // No lo pude resolver aún; lo dejo para la próxima vuelta
        remaining.push(o);
      }
    } catch (e) {
      console.warn("Error procesando salida pendiente", o, e);
      remaining.push(o); // reintento en próxima conexión
    }
  }
  LS.set(KEYS.PENDING_SALIDAS, remaining);
}

// ---------- Arranque: si ya estamos online, proceso colas ----------
if (isOnline()) {
  processQueues();
}

// ---------- Helpers para debug ----------
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

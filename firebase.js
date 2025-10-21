// ---------- Firebase SDK (CDN v11) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove, get, query, orderByChild, equalTo
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
  measurementId: "G-W9WTM7PT7Z"
};

// ---------- Init ----------
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
console.log("Firebase OK ✅ [GLOBAL + OFFLINE QUEUE]");

// ---------- Utils ----------
const isOnline = () => navigator.onLine;
const LS_ENTRADAS = "parking_pendingEntradas";
const LS_SALIDAS  = "parking_pendingSalidas";

const loadJSON = (k, d=[]) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const getPendEntradas = () => loadJSON(LS_ENTRADAS);
const setPendEntradas = (arr) => { saveJSON(LS_ENTRADAS, arr); notifySubscribers(); };

const getPendSalidas  = () => loadJSON(LS_SALIDAS);
const setPendSalidas  = (arr) => { saveJSON(LS_SALIDAS, arr); notifySubscribers(); };

// ---------- Estado de suscriptores y remoto ----------
let subs = [];
let lastRemoteList = [];
let listenerAttached = false;

function notifySubscribers() {
  const locals = getPendEntradas();
  const rem = lastRemoteList;

  const remIds = new Set(rem.map(x => x.id));
  const remOriginals = new Set(rem.map(x => x.idOriginal).filter(Boolean));

  // Mostrar locales sólo si no están representados por un remoto con idOriginal
  const localsFiltered = locals.filter(v => !remIds.has(v.id) && !remOriginals.has(v.id));

  const merged = [...rem, ...localsFiltered]
    .sort((a,b) => (b.entradaISO||"").localeCompare(a.entradaISO||""));

  subs.forEach(cb => cb(merged));
}

function attachRemoteListenerOnce() {
  if (listenerAttached) return;
  listenerAttached = true;
  onValue(ref(db, "estacionados"), (snap) => {
    const val = snap.val() || {};
    lastRemoteList = Object.values(val)
      .filter(Boolean)
      .sort((a,b) => (b.entradaISO||"").localeCompare(a.entradaISO||""));
    notifySubscribers();
  }, () => {
    notifySubscribers();
  });
}

// ---------- Procesamiento de colas al reconectar ----------
async function processQueues() {
  if (!isOnline()) return;

  // 1) Subir ENTRADAS pendientes
  let entradas = getPendEntradas();
  if (entradas.length) {
    const remaining = [];
    let salidas = getPendSalidas();

    for (const item of entradas) {
      try {
        const key = push(ref(db, "estacionados")).key;
        await set(ref(db, `estacionados/${key}`), { id: key, ...item, idOriginal: item.id });

        // Si había salida pendiente para ese id local, borro el recién subido
        const idxSalida = salidas.findIndex(s => s.id === item.id);
        if (idxSalida !== -1) {
          try { await remove(ref(db, `estacionados/${key}`)); } catch {}
          salidas.splice(idxSalida, 1);
        }
      } catch (e) {
        // dejar pendiente si falló
        remaining.push(item);
      }
    }
    setPendEntradas(remaining);
    setPendSalidas(salidas);
  }

  // 2) Ejecutar SALIDAS pendientes (ids reales)
  let salidas = getPendSalidas();
  if (salidas.length) {
    const remaining = [];
    const entradasPend = getPendEntradas();

    for (const s of salidas) {
      if (String(s.id).startsWith("local-")) {
        // si la entrada local aún está pendiente, todavía no hay qué borrar remoto
        if (entradasPend.some(e => e.id === s.id)) remaining.push(s);
        continue;
      }
      try {
        await remove(ref(db, `estacionados/${s.id}`));
      } catch (e) {
        remaining.push(s);
      }
    }
    setPendSalidas(remaining);
  }
}

window.addEventListener("online",  () => processQueues());
window.addEventListener("offline", () => notifySubscribers());

// ---------- API PÚBLICA ----------
export async function addEntrada({ placa, tipo, notas, entradaISO, horaTexto }) {
  if (isOnline()) {
    const key = push(ref(db, "estacionados")).key;
    await set(ref(db, `estacionados/${key}`), { id: key, placa, tipo, notas, entradaISO, horaTexto });
    return key;
  }
  // Offline: id temporal local-...
  const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const nuevo  = { id: tempId, placa, tipo, notas, entradaISO, horaTexto };
  const entradas = getPendEntradas();
  entradas.push(nuevo);
  setPendEntradas(entradas);
  return tempId;
}

export function onEstacionados(callback) {
  subs.push(callback);
  attachRemoteListenerOnce();
  notifySubscribers();
  return () => { subs = subs.filter(fn => fn !== callback); };
}

// ---- helper: buscar por idOriginal en remoto (consulta directa) ----
async function findRemoteByOriginalId(idOriginal) {
  try {
    const q = query(ref(db, "estacionados"), orderByChild("idOriginal"), equalTo(idOriginal));
    const snap = await get(q);
    if (snap.exists()) {
      const obj = snap.val();
      // devolver el primer match {id, ...}
      for (const [key, val] of Object.entries(obj)) {
        return { id: key, ...val };
      }
    }
  } catch {}
  return null;
}

export async function removeEstacionado(id) {
  // Caso: id local
  if (String(id).startsWith("local-")) {

    if (isOnline()) {
      // 1) intento con cache
      let match = lastRemoteList.find(r => r.idOriginal === id);

      // 2) si no está en cache, consulto al server
      if (!match) {
        match = await findRemoteByOriginalId(id);
      }

      // 3) si existe remoto -> lo borro
      if (match && match.id) {
        try { await remove(ref(db, `estacionados/${match.id}`)); } catch {}
      }
    }

    // Limpio la cola local para que desaparezca de UI
    const entradas = getPendEntradas().filter(e => e.id !== id);
    setPendEntradas(entradas);

    // Limpio una posible salida pendiente duplicada
    const salidas = getPendSalidas().filter(s => s.id !== id);
    setPendSalidas(salidas);

    return;
  }

  // Caso: id real
  if (isOnline()) {
    await remove(ref(db, `estacionados/${id}`));
    return;
  }

  // Sin red: encolo salida para id real
  const salidas = getPendSalidas();
  if (!salidas.some(s => s.id === id)) {
    salidas.push({ id });
    setPendSalidas(salidas);
  }
  notifySubscribers();
}

// ---------- Arranque ----------
processQueues();

// ---------- Debug ----------
window.firebase = { app, db };
window.parkingDebug = {
  getPendEntradas,
  getPendSalidas,
  syncNow: processQueues
};
export { app, db };

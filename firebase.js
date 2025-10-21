// ---------- Firebase SDK (CDN v11) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getDatabase, ref, push, set, onValue, remove
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

// ---------- Util ----------
const isOnline = () => navigator.onLine;
const LS_ENTRADAS = "parking_pendingEntradas";
const LS_SALIDAS  = "parking_pendingSalidas";

function loadJSON(key, def = []) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getPendEntradas() { return loadJSON(LS_ENTRADAS); }
function setPendEntradas(arr) { saveJSON(LS_ENTRADAS, arr); notifySubscribers(); }

function getPendSalidas() { return loadJSON(LS_SALIDAS); }
function setPendSalidas(arr) { saveJSON(LS_SALIDAS, arr); notifySubscribers(); }

// ---------- onEstacionados (fusiona remoto + local) ----------
let subs = [];
let lastRemoteList = [];
let listenerAttached = false;

function notifySubscribers() {
  const locals = getPendEntradas();                 // entradas pendientes (ids local-...)
  const remIds = new Set(lastRemoteList.map(v => v.id));
  const merged = [
    ...lastRemoteList,
    ...locals.filter(v => !remIds.has(v.id))        // evita duplicados si ya subieron
  ].sort((a,b) => (b.entradaISO||"").localeCompare(a.entradaISO||""));
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
    // si hay error/red: mostramos solo lo local
    notifySubscribers();
  });
}

// ---------- Sincronización de colas al reconectar ----------
async function processQueues() {
  if (!isOnline()) return;

  // 1) Subir ENTRADAS pendientes
  let entradas = getPendEntradas();
  if (entradas.length) {
    const remaining = [];
    let salidas = getPendSalidas();

    for (const item of entradas) {
      try {
        // Subir entrada local creando id real en Firebase
        const key = push(ref(db, "estacionados")).key;
        await set(ref(db, `estacionados/${key}`), { id: key, ...item, idOriginal: item.id });

        // ¿Había una SALIDA pendiente para esa entrada local?
        const idxSalida = salidas.findIndex(s => s.id === item.id);
        if (idxSalida !== -1) {
          // Si hay salida pendiente, borramos inmediatamente el registro recién subido
          try { await remove(ref(db, `estacionados/${key}`)); } catch {}
          salidas.splice(idxSalida, 1); // quitamos esa salida de la cola
        }

        // item subido/borrado -> no queda pendiente
      } catch (e) {
        // si falla la subida, queda en la cola
        remaining.push(item);
      }
    }
    setPendEntradas(remaining);
    setPendSalidas(salidas); // actualizar si quitamos alguna
  }

  // 2) Ejecutar SALIDAS pendientes
  let salidas = getPendSalidas();
  if (salidas.length) {
    const remaining = [];
    const entradasPend = getPendEntradas();

    for (const s of salidas) {
      // Si apunta a un id local-... y esa entrada aún está pendiente, todavía no podemos borrar en server
      if (String(s.id).startsWith("local-")) {
        // Si ya no existe esa entrada en pendientes, descartamos esa salida fantasma
        if (entradasPend.some(e => e.id === s.id)) {
          remaining.push(s);
        }
        continue;
      }
      try {
        await remove(ref(db, `estacionados/${s.id}`));
      } catch (e) {
        remaining.push(s); // si falla, queda para el próximo intento
      }
    }
    setPendSalidas(remaining);
  }
}

// Reaccionar a cambios de conectividad
window.addEventListener("online",  () => processQueues());
window.addEventListener("offline", () => notifySubscribers()); // refresca vista fusionada

// ---------- API para la app ----------
export async function addEntrada({ placa, tipo, notas, entradaISO, horaTexto }) {
  // Si hay red, escribir directo
  if (isOnline()) {
    const key = push(ref(db, "estacionados")).key;
    await set(ref(db, `estacionados/${key}`), {
      id: key, placa, tipo, notas, entradaISO, horaTexto
    });
    return key;
  }

  // Sin red: guardo local y lo muestro ya
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

  // Primer render con lo que haya (útil si arranca sin red)
  notifySubscribers();

  // devolver unsubscribe opcional
  return () => { subs = subs.filter(fn => fn !== callback); };
}

export async function removeEstacionado(id) {
  // si es local aún no subido -> lo quito de la cola local inmediatamente
  if (String(id).startsWith("local-")) {
    const entradas = getPendEntradas().filter(e => e.id !== id);
    setPendEntradas(entradas);
    // limpiar una posible salida pendiente duplicada
    const salidas = getPendSalidas().filter(s => s.id !== id);
    setPendSalidas(salidas);
    return;
  }

  // con red -> borrar directo en server
  if (isOnline()) {
    await remove(ref(db, `estacionados/${id}`));
    return;
  }

  // sin red -> encolo salida
  const salidas = getPendSalidas();
  if (!salidas.some(s => s.id === id)) {
    salidas.push({ id });
    setPendSalidas(salidas);
  }
  // notify para que la UI pueda distinguir si quisieras (aquí no cambiamos estilo)
  notifySubscribers();
}

// ---------- Arranque ----------
processQueues(); // intenta sincronizar si ya hay red

// ---------- Helpers de prueba en consola ----------
window.firebase = { app, db };
window.parkingDebug = {
  getPendEntradas,
  getPendSalidas,
  syncNow: processQueues
};
export { app, db };

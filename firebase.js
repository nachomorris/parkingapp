// ---------- Firebase SDK (CDN v11) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getDatabase, ref, push, set, onValue, remove
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

// ---------- CONFIGURACIÓN DEL PROYECTO ----------
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
console.log("CFG =>", firebaseConfig);

// ---------- Inicialización ----------
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);
console.log("Firebase OK ✅ [DEFAULT]");

// ---------- Autenticación anónima ----------
await signInAnonymously(auth).catch((e) => console.error("Error en login anónimo:", e));

// ---------- Nodo compartido ----------
const BASE = "estacionados"; // Todos los dispositivos ven el mismo nodo

// ---------- API para la app ----------
export async function addEntrada({ placa, tipo, notas, entradaISO, horaTexto }) {
  const key = push(ref(db, BASE)).key;
  await set(ref(db, `${BASE}/${key}`), {
    id: key,
    placa,
    tipo,
    notas,
    entradaISO,
    horaTexto
  });
  console.log("🚗 Entrada guardada:", placa);
  return key;
}

export function onEstacionados(callback) {
  onValue(ref(db, BASE), (snap) => {
    const val = snap.val() || {};
    const arr = Object.values(val)
      .sort((a,b) => (b.entradaISO || "").localeCompare(a.entradaISO || ""));
    callback(arr);
  });
}

export async function removeEstacionado(id) {
  await remove(ref(db, `${BASE}/${id}`));
  console.log("🧹 Vehículo eliminado:", id);
}

// ---------- Prueba desde consola ----------
window.firebase = { app, auth, db };
window.firebasePing = async () => {
  const key = push(ref(db, "ping")).key;
  await set(ref(db, `ping/${key}`), { ts: new Date().toISOString() });
  console.log("DB OK ✅ ping:", key);
};

export { app, auth, db };

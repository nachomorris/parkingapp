// ---------- Firebase SDK (CDN estable) ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getDatabase, ref, push, set, onValue, remove } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

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
console.log("CFG =>", firebaseConfig);

// ---------- Init ----------
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

console.log("Firebase OK ✅", app.name);

// ---------- Auth anónima ----------
let currentUid = null;
const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(auth, (user) => {
    if (user) { currentUid = user.uid; resolve(user); }
    else { signInAnonymously(auth).catch(reject); }
  }, reject);
});
const path = (p) => `users/${currentUid}/${p}`;

// ---------- API mínima para tu app ----------
export async function addEntrada({ placa, tipo, notas, entradaISO, horaTexto }) {
  await authReady;
  const key = push(ref(db, path("estacionados"))).key;
  await set(ref(db, path(`estacionados/${key}`)), { id: key, placa, tipo, notas, entradaISO, horaTexto });
  return key;
}

export function onEstacionados(callback) {
  authReady.then(() => {
    onValue(ref(db, path("estacionados")), (snap) => {
      const val = snap.val() || {};
      // Orden opcional por hora de entrada (más recientes primero)
      const arr = Object.values(val).sort((a,b) => (b.entradaISO||"").localeCompare(a.entradaISO||""));
      callback(arr);
    });
  });
}

export async function removeEstacionado(id) {
  await authReady;
  await remove(ref(db, path(`estacionados/${id}`)));
}

// ---------- Utilidad para probar desde consola (opcional) ----------
window.firebasePing = async () => {
  await authReady;
  const key = push(ref(db, path("ping"))).key;
  await set(ref(db, path(`ping/${key}`)), { ts: new Date().toISOString() });
  console.log("DB OK ✅ ping subido:", key);
};

// (export para usos futuros si querés)
export { app, auth, db };

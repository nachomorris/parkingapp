// =============================
// Inicialización de Firebase
// =============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  remove
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js";

// --- Configuración de tu proyecto ---
const firebaseConfig = {
  apiKey: "AIzaSyBMdSRkAjfWGOP8cnTU2UEsbXBl3vTNIo",
  authDomain: "parking-c5830.firebaseapp.com",
  databaseURL: "https://parking-c5830-default-rtdb.firebaseio.com",
  projectId: "parking-c5830",
  storageBucket: "parking-c5830.appspot.com",
  messagingSenderId: "242733687477",
  appId: "1:242733687477:web:46cc3ac60656e14d114fc",
  measurementId: "G-W9WTM7PT7Z"
};
console.log("CFG =>", firebaseConfig);
// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
console.log("Firebase OK ✅", app.name);

// =============================
// Autenticación anónima
// =============================
let currentUid = null;

const authReady = new Promise((resolve, reject) => {
  onAuthStateChanged(
    auth,
    (user) => {
      if (user) {
        currentUid = user.uid;
        resolve(user);
      } else {
        signInAnonymously(auth).catch(reject);
      }
    },
    reject
  );
});

// =============================
// Función de prueba (firebasePing)
// =============================
window.firebasePing = async () => {
  await authReady;
  const key = push(ref(db, `users/${currentUid}/ping`)).key;
  await set(ref(db, `users/${currentUid}/ping/${key}`), {
    ts: new Date().toISOString(),
  });
  console.log("DB OK ✅ ping subido:", key);
};

// =============================
// (Después añadiremos tus funciones reales: addEntrada, onEstacionados, etc.)
// =============================

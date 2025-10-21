// Importa desde una versión estable de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-analytics.js";

// Configuración de tu proyecto Firebase
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

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
console.log("Firebase OK ✅", app.name);

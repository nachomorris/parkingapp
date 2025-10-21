<script type="module">
  // Import the functions you need from the SDKs you need
 import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBMdSRkAjfWGOP0cnTUI2UEsbXBI3vTNIo",
    authDomain: "parking-c5830.firebaseapp.com",
    databaseURL: "https://parking-c5830-default-rtdb.firebaseio.com",
    projectId: "parking-c5830",
    storageBucket: "parking-c5830.firebasestorage.app",
    messagingSenderId: "242733687477",
    appId: "1:242733687477:web:46ccc3ac60656e14d114fc",
    measurementId: "G-W9WT1M7PTZ"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>

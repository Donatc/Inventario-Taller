import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

 
const firebaseConfig = {
  apiKey: "AIzaSyBsPup3vz23Q2zzgBGUJCTNiZZn1-YT7w8",
  authDomain: "inventario-taller-d9470.firebaseapp.com",
};
 
const app = initializeApp(firebaseConfig);
 
const auth = getAuth(app);
 
window.iniciarSesion = async function() {
 
  const correo =
    document.getElementById("correo").value;
 
  const password =
    document.getElementById("password").value;
 
  try {
 
    await signInWithEmailAndPassword(
      auth,
      correo,
      password
    );
 
    window.location.href = "inventario.html";
 
  } catch(error) {
 
    alert(error.message);
 
  }
 
}


import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/** Public Firebase Web App identifiers. Access control belongs in Auth and Firestore Rules. */
const firebaseConfig = {
  apiKey: "AIzaSyAFL4eBvLt5ZPJpm1CJrePVAXPc3OAgCdU",
  authDomain: "yoxi-yoi-demo.firebaseapp.com",
  projectId: "yoxi-yoi-demo",
  storageBucket: "yoxi-yoi-demo.firebasestorage.app",
  messagingSenderId: "101262386766",
  appId: "1:101262386766:web:136762b0b73981920a051f",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp, "(default)");

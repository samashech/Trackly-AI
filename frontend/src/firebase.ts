import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, GithubAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBdKERbc6tCyixtBbGtwAiIZ49umEDWGGw",
  authDomain: "actionmate-ai-79bd2.firebaseapp.com",
  projectId: "actionmate-ai-79bd2",
  storageBucket: "actionmate-ai-79bd2.firebasestorage.app",
  messagingSenderId: "200365938727",
  appId: "1:200365938727:web:bfe11187fdd7f62a67d602",
  measurementId: "G-23ZR73W80S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };

// Firebase web config for the forge-eb613 project. Public by design
// (ADR-0005): it identifies the project, it doesn't grant access. The
// Firestore security rules decide who can read and write.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDs4OkWrj9Tl-O5yhAaq4Jb2UauQHmFWt0",
  authDomain: "forge-eb613.firebaseapp.com",
  projectId: "forge-eb613",
  storageBucket: "forge-eb613.firebasestorage.app",
  messagingSenderId: "115267862432",
  appId: "1:115267862432:web:11f7a4111a75a44f64aec5",
};

// The one account allowed to use this Forge (#9). An opaque Firebase id, not
// personal data. firestore.rules holds the same uid; the rules tests sign in
// as this uid, so they fail if the two drift apart.
export const OWNER_UID = "x98Yvmbfj6eBxKbsluJOC3HkcBJ3";

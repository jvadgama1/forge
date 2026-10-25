// @ts-nocheck -- tsc can't resolve URL imports. The JSDoc types on the exports
// below give callers the real SDK types, from the `firebase` dev dependency,
// whose version a test keeps equal to the CDN version here.
//
// The Firebase SDK loads as ES modules from a pinned CDN URL (ADR-0002: no
// build step, never npm into the served app).
import * as appSdk from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import * as authSdk from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import * as firestoreSdk from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

/** @type {typeof import("firebase/app")} */
export const firebaseApp = appSdk;
/** @type {typeof import("firebase/auth")} */
export const firebaseAuth = authSdk;
/** @type {typeof import("firebase/firestore")} */
export const firestore = firestoreSdk;

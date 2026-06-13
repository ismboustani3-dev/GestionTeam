"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.app = void 0;
const app_1 = require("firebase/app");
const firestore_1 = require("firebase/firestore");
const firebaseConfig = {
    apiKey: "AIzaSyCPoDZ0pSYIyUgeciVDbKkILhkUXZ8AJ4g",
    authDomain: "gestionteamnew.firebaseapp.com",
    projectId: "gestionteamnew",
    storageBucket: "gestionteamnew.firebasestorage.app",
    messagingSenderId: "682522030466",
    appId: "1:682522030466:web:c1c41cd3c024653332df9b",
    measurementId: "G-DDNN7CD4HT"
};
// Initialize Firebase only if it hasn't been initialized yet
const app = !(0, app_1.getApps)().length ? (0, app_1.initializeApp)(firebaseConfig) : (0, app_1.getApp)();
exports.app = app;
const db = (0, firestore_1.getFirestore)(app);
exports.db = db;

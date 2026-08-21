import { initApp } from "./main.js";
import { initLogin } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
    initLogin();
    initApp();
});


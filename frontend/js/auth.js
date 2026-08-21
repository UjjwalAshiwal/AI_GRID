// auth.js (improved)
//
// Temporary in-memory users. Replace with server-backed auth later.
const USERS = {
    admin: { password: "admin123", role: "admin" },
    viewer: { password: "viewer123", role: "viewer" }
};

export function initLogin() {
    const loginBtn = document.getElementById("loginBtn");
    const errorBox = document.getElementById("errorMsg");

    if (!loginBtn) return;

    // Press Enter to submit
    [document.getElementById("username"), document.getElementById("password")].forEach(el => {
        if (!el) return;
        el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") loginBtn.click();
        });
    });

    loginBtn.addEventListener("click", () => {
        const usernameEl = document.getElementById("username");
        const passwordEl = document.getElementById("password");
        const roleSelect = document.getElementById("role");

        const username = usernameEl ? usernameEl.value.trim() : "";
        const password = passwordEl ? passwordEl.value.trim() : "";
        const roleFromSelect = roleSelect ? roleSelect.value : null;

        if (!username || !password) {
            showError("Enter username and password.");
            return;
        }

        const user = USERS[username];
        if (!user || user.password !== password) {
            showError("Invalid username or password.");
            return;
        }

        const finalRole = user.role;

        // Save role and username for session
        localStorage.setItem("userRole", finalRole);
        localStorage.setItem("username", username);
        if (roleFromSelect) localStorage.setItem("selectedRole", roleFromSelect);
        // ensure mode exists
        if (!localStorage.getItem("dashboardMode")) localStorage.setItem("dashboardMode", "simulation");
        if (errorBox) { errorBox.style.display = "none"; errorBox.innerText = ""; }
        window.location.href = "dashboard.html";
    });

    function showError(msg) {
        if (!errorBox) return;
        errorBox.style.display = "block";
        errorBox.innerText = msg;
    }
}

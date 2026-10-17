document.addEventListener("DOMContentLoaded", async () => {
    // 1. Load User Info
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    let currentColor = localStorage.getItem("chathub_color") || "#23a559"; // Default green

    const displayName = document.getElementById("user-display-name");
    const userAvatar = document.getElementById("user-avatar");
    
    if (displayName) displayName.innerText = currentUsername;
    if (userAvatar) {
        userAvatar.innerText = currentUsername.charAt(0).toUpperCase();
        userAvatar.style.background = currentColor;
    }

    // 2. Settings Modal Logic
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("close-settings");

    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            // Pre-fill the form with current data
            document.getElementById("settings-username").value = localStorage.getItem("chathub_username") || "User";
            document.getElementById("settings-color").value = localStorage.getItem("chathub_color") || "#23a559";
            settingsModal.classList.add("active");
        });
    }

    if (closeSettings) closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
    
    if (settingsModal) {
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove("active");
        });
    }
});

// 3. Save Profile Logic
async function saveProfile() {
    const oldName = localStorage.getItem("chathub_username") || "User";
    const newName = document.getElementById("settings-username").value.trim();
    const newColor = document.getElementById("settings-color").value;

    if (!newName) {
        alert("Username cannot be empty.");
        return;
    }

    // Send to backend to update DB
    try {
        const res = await fetch("/api/profile/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ old_username: oldName, new_username: newName, new_color: newColor })
        });

        if (res.ok) {
            // Update local storage
            localStorage.setItem("chathub_username", newName);
            localStorage.setItem("chathub_color", newColor);

            // Update UI
            document.getElementById("user-display-name").innerText = newName;
            const avatar = document.getElementById("user-avatar");
            avatar.innerText = newName.charAt(0).toUpperCase();
            avatar.style.background = newColor;

            alert("Profile updated successfully!");
            document.getElementById("settings-modal").classList.remove("active");
        } else {
            alert("That username is already taken.");
        }
    } catch (err) {
        alert("Error saving profile.");
    }
}

// 4. Logout Logic
function logout() {
    localStorage.removeItem("chathub_username");
    localStorage.removeItem("chathub_color");
    window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Load User Data ---
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    
    const displayName = document.getElementById("user-display-name");
    const userAvatar = document.getElementById("user-avatar");
    const settingsUsername = document.getElementById("settings-username");

    if (displayName) displayName.innerText = currentUsername;
    if (settingsUsername) settingsUsername.value = currentUsername;
    if (userAvatar) userAvatar.innerText = currentUsername.charAt(0).toUpperCase();

    // --- 2. Navigation Logic (DMs vs Friends) ---
    const navFriends = document.getElementById("nav-friends");
    const navDms = document.getElementById("nav-dms");
    const viewFriends = document.getElementById("view-friends");
    const viewDms = document.getElementById("view-dms");
    const dmCategory = document.getElementById("dm-category");
    const dmListContainer = document.getElementById("dm-list-container");

    if (navFriends && navDms) {
        navFriends.addEventListener("click", () => {
            navFriends.classList.add("active");
            navDms.classList.remove("active");
            viewFriends.style.display = "flex";
            viewDms.style.display = "none";
            dmCategory.style.display = "none";
            dmListContainer.style.display = "none";
        });

        navDms.addEventListener("click", () => {
            navDms.classList.add("active");
            navFriends.classList.remove("active");
            viewDms.style.display = "flex";
            viewFriends.style.display = "none";
            dmCategory.style.display = "block";
            dmListContainer.style.display = "block";
        });
    }

    // --- 3. Settings Modal Logic ---
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("close-settings");

    if (settingsBtn) settingsBtn.addEventListener("click", () => settingsModal.classList.add("active"));
    if (closeSettings) closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
    if (settingsModal) {
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove("active");
        });
    }
});

// Add Friend Logic
function addFriend() {
    const friendName = document.getElementById("friend-search").value;
    if (!friendName) return;

    const friendsList = document.getElementById("friends-list");
    
    // Clear empty text if it's there
    if (friendsList.innerHTML.includes("don't have any friends yet")) {
        friendsList.innerHTML = "";
    }

    // Create friend row
    const friendDiv = document.createElement("div");
    friendDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--hover);";
    friendDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar" style="background: #5865F2;">${friendName.charAt(0).toUpperCase()}</div>
            <span style="font-weight: bold;">${friendName}</span>
        </div>
        <button style="background: #23a559; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Message</button>
    `;
    
    friendsList.appendChild(friendDiv);
    document.getElementById("friend-search").value = "";
}

// Save profile logic
function saveProfile() {
    const newName = document.getElementById("settings-username").value;
    if (newName) {
        localStorage.setItem("chathub_username", newName);
        document.getElementById("user-display-name").innerText = newName;
        document.getElementById("user-avatar").innerText = newName.charAt(0).toUpperCase();
        alert("Profile updated!");
        document.getElementById("settings-modal").classList.remove("active");
    }
}

// Logout logic
function logout() {
    localStorage.removeItem("chathub_username");
    window.location.href = "index.html";
}

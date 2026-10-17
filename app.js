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
            if(dmCategory) dmCategory.style.display = "none";
            if(dmListContainer) dmListContainer.style.display = "none";
        });

        navDms.addEventListener("click", () => {
            navDms.classList.add("active");
            navFriends.classList.remove("active");
            viewDms.style.display = "flex";
            viewFriends.style.display = "none";
            if(dmCategory) dmCategory.style.display = "block";
            if(dmListContainer) dmListContainer.style.display = "block";
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

    // Settings Tabs logic
    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", function() {
            tabs.forEach(t => t.classList.remove("active"));
            this.classList.add("active");
        });
    });
});

// --- 4. Add Friend Logic ---
async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;

    const currentUser = localStorage.getItem("chathub_username") || "User";

    if (friendName.toLowerCase() === currentUser.toLowerCase()) {
        alert("You can't add yourself!");
        return;
    }

    // Send to Go backend
    try {
        const response = await fetch("/api/friends", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user: currentUser, friend: friendName })
        });

        if (response.ok) {
            const data = await response.json();
            renderFriendsList(data.friends);
            document.getElementById("friend-search").value = "";
        } else {
            alert("Failed to add friend.");
        }
    } catch (err) {
        console.error("Error adding friend:", err);
        alert("Could not connect to server.");
    }
}

// --- 5. Render Friends List ---
function renderFriendsList(friends) {
    const friendsList = document.getElementById("friends-list");
    if (!friendsList) return;
    
    friendsList.innerHTML = "";

    if (friends.length === 0) {
        friendsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">You don't have any friends yet. Add some!</p>`;
        return;
    }

    friends.forEach(friendName => {
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
    });
}

// --- 6. Save Profile Logic ---
function saveProfile() {
    const newName = document.getElementById("settings-username").value.trim();
    if (newName) {
        localStorage.setItem("chathub_username", newName);
        document.getElementById("user-display-name").innerText = newName;
        document.getElementById("user-avatar").innerText = newName.charAt(0).toUpperCase();
        alert("Profile updated!");
        document.getElementById("settings-modal").classList.remove("active");
    }
}

// --- 7. Logout Logic ---
function logout() {
    localStorage.removeItem("chathub_username");
    window.location.href = "index.html";
}

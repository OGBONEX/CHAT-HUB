let activeChatUser = null; // Tracks who you are currently messaging

document.addEventListener("DOMContentLoaded", () => {
    // --- 1. Load User Data ---
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    
    const displayName = document.getElementById("user-display-name");
    const userAvatar = document.getElementById("user-avatar");
    const settingsUsername = document.getElementById("settings-username");

    if (displayName) displayName.innerText = currentUsername;
    if (settingsUsername) settingsUsername.value = currentUsername;
    if (userAvatar) userAvatar.innerText = currentUsername.charAt(0).toUpperCase();

    // --- 2. Navigation Logic ---
    const navFriends = document.getElementById("nav-friends");
    const navDms = document.getElementById("nav-dms");
    const viewFriends = document.getElementById("view-friends");
    const viewDms = document.getElementById("view-dms");

    if (navFriends && navDms) {
        navFriends.addEventListener("click", () => {
            navFriends.classList.add("active");
            navDms.classList.remove("active");
            viewFriends.style.display = "flex";
            viewDms.style.display = "none";
        });

        navDms.addEventListener("click", () => {
            navDms.classList.add("active");
            navFriends.classList.remove("active");
            viewDms.style.display = "flex";
            viewFriends.style.display = "none";
        });
    }

    // --- 3. DM Input Logic ---
    const dmInput = document.getElementById("dm-message-input");
    const dmContainer = document.getElementById("dm-messages-container");

    if (dmInput) {
        dmInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && dmInput.value.trim() !== "" && activeChatUser) {
                const text = dmInput.value.trim();
                
                // Add message to screen
                appendDMMessage("You", text, "#5865F2");
                
                // (In a real app, you would send this to the WebSocket/Backend here)
                
                dmInput.value = "";
            }
        });
    }

    // --- 4. Settings Logic ---
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("close-settings");

    if (settingsBtn) settingsBtn.addEventListener("click", () => settingsModal.classList.add("active"));
    if (closeSettings) closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
});

// --- 5. Open a Chat from the Friends List ---
function openChat(friendName) {
    activeChatUser = friendName;
    
    // Switch to DM view
    document.getElementById("nav-dms").click();

    // Hide empty state, show chat
    document.getElementById("dm-empty-state").style.display = "none";
    const activeChat = document.getElementById("dm-active-chat");
    activeChat.style.display = "flex";

    // Update header
    document.getElementById("dm-chat-name").innerText = friendName;
    document.getElementById("dm-chat-avatar").innerText = friendName.charAt(0).toUpperCase();
    document.getElementById("dm-message-input").placeholder = `Message @${friendName}`;

    // Clear previous messages
    document.getElementById("dm-messages-container").innerHTML = "";
    
    // Add a dummy welcome message
    appendDMMessage(friendName, "Hey! This is the start of your direct message history.", "#5865F2");
}

// --- 6. Append message to DM screen ---
function appendDMMessage(author, text, color) {
    const container = document.getElementById("dm-messages-container");
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    
    msgDiv.innerHTML = `
        <div class="avatar" style="background: ${color};">${author.charAt(0).toUpperCase()}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="author" style="color: ${color};">${author}</span>
                <span class="time">Just now</span>
            </div>
            <div class="text">${text}</div>
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// --- 7. Friends Logic ---
async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;

    const currentUser = localStorage.getItem("chathub_username") || "User";
    if (friendName.toLowerCase() === currentUser.toLowerCase()) {
        alert("You can't add yourself!");
        return;
    }

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
        }
    } catch (err) {
        console.error(err);
    }
}

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
        
        // Added onclick="openChat('${friendName}')" to the button!
        friendDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="avatar" style="background: #5865F2;">${friendName.charAt(0).toUpperCase()}</div>
                <span style="font-weight: bold;">${friendName}</span>
            </div>
            <button onclick="openChat('${friendName}')" style="background: #23a559; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Message</button>
        `;
        friendsList.appendChild(friendDiv);
    });
}

// --- 8. Save/Logout Logic ---
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

function logout() {
    localStorage.removeItem("chathub_username");
    window.location.href = "index.html";
}

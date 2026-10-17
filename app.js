let activeChatUser = null;
let socket;

document.addEventListener("DOMContentLoaded", async () => {
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    
    // 1. Setup UI
    document.getElementById("user-display-name").innerText = currentUsername;
    document.getElementById("settings-username").value = currentUsername;
    document.getElementById("user-avatar").innerText = currentUsername.charAt(0).toUpperCase();

    // 2. Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(`${wsProtocol}${window.location.host}/ws?user=${currentUsername}`);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // If it's a new message, and we are currently looking at the sender's chat
        if (data.type === "new_message") {
            if (activeChatUser === data.sender || activeChatUser === data.receiver) {
                const isMe = data.sender === currentUsername;
                appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? "#5865F2" : "#23a559");
            }
        }
    };

    // 3. Load Friends
    try {
        const res = await fetch(`/api/friends?user=${currentUsername}`);
        const data = await res.json();
        renderFriendsList(data.friends);
    } catch (err) { console.log("Could not load friends."); }

    // 4. Navigation
    const navFriends = document.getElementById("nav-friends");
    const navDms = document.getElementById("nav-dms");
    const viewFriends = document.getElementById("view-friends");
    const viewDms = document.getElementById("view-dms");

    navFriends.addEventListener("click", () => {
        navFriends.classList.add("active"); navDms.classList.remove("active");
        viewFriends.style.display = "flex"; viewDms.style.display = "none";
    });

    navDms.addEventListener("click", () => {
        navDms.classList.add("active"); navFriends.classList.remove("active");
        viewDms.style.display = "flex"; viewFriends.style.display = "none";
    });

    // 5. Send Message
    const dmInput = document.getElementById("dm-message-input");
    dmInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter" && dmInput.value.trim() !== "" && activeChatUser) {
            const text = dmInput.value.trim();
            
            // Draw locally immediately
            appendDMMessage("You", text, "#5865F2");
            dmInput.value = "";

            // Save to DB (WebSocket will push it to the receiver)
            fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: currentUsername, receiver: activeChatUser, content: text })
            });
        }
    });

    // 6. Settings
    document.getElementById("settings-btn").addEventListener("click", () => document.getElementById("settings-modal").classList.add("active"));
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));
});

// --- Open Chat ---
async function openChat(friendName) {
    activeChatUser = friendName;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    
    document.getElementById("nav-dms").click();

    document.getElementById("dm-empty-state").style.display = "none";
    document.getElementById("dm-active-chat").style.display = "flex";

    document.getElementById("dm-chat-name").innerText = friendName;
    document.getElementById("dm-chat-avatar").innerText = friendName.charAt(0).toUpperCase();
    document.getElementById("dm-message-input").placeholder = `Message @${friendName}`;

    const container = document.getElementById("dm-messages-container");
    container.innerHTML = "";

    // Load History
    try {
        const res = await fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`);
        const messages = await res.json();

        if (messages.length === 0) {
            appendDMMessage(friendName, "This is the start of your conversation.", "#5865F2");
        } else {
            messages.forEach(msg => {
                const isMe = msg.sender === currentUser;
                appendDMMessage(isMe ? "You" : friendName, msg.content, isMe ? "#5865F2" : "#23a559");
            });
        }
    } catch (err) { console.error(err); }
}

// --- UI Helper ---
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

// --- Friends Logic ---
async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    
    if (friendName.toLowerCase() === currentUser.toLowerCase()) {
        alert("You can't add yourself!"); return;
    }

    const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: currentUser, friend: friendName })
    });

    if (response.ok) {
        const getRes = await fetch(`/api/friends?user=${currentUser}`);
        const data = await getRes.json();
        renderFriendsList(data.friends);
        document.getElementById("friend-search").value = "";
    } else {
        alert("User not found.");
    }
}

function renderFriendsList(friends) {
    const friendsList = document.getElementById("friends-list");
    friendsList.innerHTML = (!friends || friends.length === 0) ? `<p style="color: var(--text-muted); font-size: 0.9rem;">You don't have any friends yet.</p>` : "";

    friends.forEach(friendName => {
        const friendDiv = document.createElement("div");
        friendDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--hover);";
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

// --- Settings ---
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

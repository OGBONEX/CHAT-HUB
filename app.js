let activeChatUser = null;
let socket;

document.addEventListener("DOMContentLoaded", async () => {
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    let currentColor = localStorage.getItem("chathub_color") || "#23a559"; 
    
    document.getElementById("user-display-name").innerText = currentUsername;
    const userAvatar = document.getElementById("user-avatar");
    userAvatar.innerText = currentUsername.charAt(0).toUpperCase();
    userAvatar.style.background = currentColor;

    // 1. Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(`${wsProtocol}${window.location.host}/ws?user=${currentUsername}`);
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "new_message" && (activeChatUser === data.sender || activeChatUser === data.receiver)) {
            const isMe = data.sender === currentUsername;
            appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? currentColor : "#5865F2");
        }
    };

    // 2. Load Friends
    try {
        const res = await fetch(`/api/friends?user=${currentUsername}`);
        const data = await res.json();
        renderFriendsList(data.friends);
    } catch (err) { console.log("Could not load friends."); }

    // 3. Load Servers
    try {
        const res = await fetch(`/api/servers/get?user=${currentUsername}`);
        const servers = await res.json();
        const divider = document.querySelector(".sidebar-divider");
        
        servers.forEach(server => {
            const newIcon = document.createElement("div");
            newIcon.className = "server-icon";
            newIcon.innerText = server.name.substring(0, 2).toUpperCase();
            newIcon.title = server.name;
            newIcon.onclick = () => loadServer(server.id, server.name);
            divider.parentNode.insertBefore(newIcon, divider);
        });
    } catch (err) { console.log("Could not load servers."); }

    // 4. Navigation
    document.getElementById("nav-friends").addEventListener("click", () => {
        document.getElementById("nav-friends").classList.add("active");
        document.getElementById("nav-dms").classList.remove("active");
        document.getElementById("view-friends").style.display = "flex";
        document.getElementById("view-dms").style.display = "none";
    });

    document.getElementById("nav-dms").addEventListener("click", () => {
        document.getElementById("nav-dms").classList.add("active");
        document.getElementById("nav-friends").classList.remove("active");
        document.getElementById("view-dms").style.display = "flex";
        document.getElementById("view-friends").style.display = "none";
    });

    // 5. DM Input
    const dmInput = document.getElementById("dm-message-input");
    dmInput.addEventListener("keypress", async (e) => {
        if (e.key === "Enter" && dmInput.value.trim() !== "" && activeChatUser) {
            const text = dmInput.value.trim();
            appendDMMessage("You", text, currentColor);
            dmInput.value = "";
            fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: currentUsername, receiver: activeChatUser, content: text })
            });
        }
    });

    // 6. Settings
    document.getElementById("settings-btn").addEventListener("click", () => {
        document.getElementById("settings-username").value = localStorage.getItem("chathub_username") || "User";
        document.getElementById("settings-color").value = localStorage.getItem("chathub_color") || "#23a559";
        document.getElementById("settings-modal").classList.add("active");
    });
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));

    // 7. Create Server
    document.getElementById("create-server-btn").addEventListener("click", async () => {
        const serverName = prompt("Enter a name for your new server:");
        if (serverName && serverName.trim() !== "") {
            const res = await fetch("/api/servers/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: serverName, owner: currentUsername })
            });
            const data = await res.json();
            if (data.server_id) {
                const newIcon = document.createElement("div");
                newIcon.className = "server-icon";
                newIcon.innerText = serverName.substring(0, 2).toUpperCase();
                newIcon.title = serverName;
                newIcon.onclick = () => loadServer(data.server_id, serverName);
                
                const divider = document.querySelector(".sidebar-divider");
                divider.parentNode.insertBefore(newIcon, divider);
                loadServer(data.server_id, serverName);
            }
        }
    });
});

// --- Open DM ---
async function openChat(friendName) {
    activeChatUser = friendName;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    const currentColor = localStorage.getItem("chathub_color") || "#23a559";
    
    document.getElementById("nav-dms").click();
    document.getElementById("dm-empty-state").style.display = "none";
    document.getElementById("dm-active-chat").style.display = "flex";

    document.getElementById("dm-chat-name").innerText = friendName;
    const chatAvatar = document.getElementById("dm-chat-avatar");
    chatAvatar.style.display = "flex";
    chatAvatar.innerText = friendName.charAt(0).toUpperCase();
    document.getElementById("dm-message-input").placeholder = `Message @${friendName}`;

    const container = document.getElementById("dm-messages-container");
    container.innerHTML = "";

    const dmInput = document.getElementById("dm-message-input");
    dmInput.onkeypress = async (e) => {
        if (e.key === "Enter" && dmInput.value.trim() !== "") {
            const text = dmInput.value.trim();
            appendDMMessage("You", text, currentColor);
            dmInput.value = "";
            fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: currentUser, receiver: friendName, content: text })
            });
        }
    };

    try {
        const res = await fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`);
        const messages = await res.json();
        if (messages.length === 0) {
            appendDMMessage(friendName, "This is the start of your conversation.", "#5865F2");
        } else {
            messages.forEach(msg => {
                const isMe = msg.sender === currentUser;
                appendDMMessage(isMe ? "You" : friendName, msg.content, isMe ? currentColor : "#5865F2");
            });
        }
    } catch (err) { console.error(err); }
}

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

// --- Friends ---
async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    if (friendName.toLowerCase() === currentUser.toLowerCase()) { alert("You can't add yourself!"); return; }

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
        friendDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);";
        friendDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div class="avatar" style="background: #5865F2;">${friendName.charAt(0).toUpperCase()}</div>
                <span style="font-weight: bold; color: white;">${friendName}</span>
            </div>
            <button onclick="openChat('${friendName}')" style="background: #23a559; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;">Message</button>
        `;
        friendsList.appendChild(friendDiv);
    });
}

// --- Save Profile ---
async function saveProfile() {
    const oldName = localStorage.getItem("chathub_username") || "User";
    const newName = document.getElementById("settings-username").value.trim();
    const newColor = document.getElementById("settings-color").value;

    if (!newName) { alert("Username cannot be empty."); return; }

    const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_username: oldName, new_username: newName, new_color: newColor })
    });

    if (res.ok) {
        localStorage.setItem("chathub_username", newName);
        localStorage.setItem("chathub_color", newColor);
        document.getElementById("user-display-name").innerText = newName;
        const avatar = document.getElementById("user-avatar");
        avatar.innerText = newName.charAt(0).toUpperCase();
        avatar.style.background = newColor;
        alert("Profile updated!");
        document.getElementById("settings-modal").classList.remove("active");
    } else {
        alert("That username is already taken.");
    }
}

// --- Servers & Channels ---
async function loadServer(serverID, serverName) {
    const channelList = document.querySelector(".channel-list");
    const res = await fetch(`/api/channels/get?server_id=${serverID}`);
    const channels = await res.json();

    channelList.innerHTML = `
        <div class="category" style="display: flex; justify-content: space-between; align-items: center;">
            TEXT CHANNELS
            <i class="fa-solid fa-plus" style="cursor: pointer; color: var(--text-muted);" title="Create Channel" onclick="promptCreateChannel(${serverID}, '${serverName}')"></i>
        </div>
        <div id="server-channels-container"></div>
        <div style="padding: 16px; margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
             <button onclick="promptInvite(${serverID})" style="background: #23a559; border: none; color: white; width: 100%; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">Invite Friends</button>
             <button onclick="window.location.reload()" style="background: var(--bg-input); border: 1px solid var(--border-color); color: white; width: 100%; padding: 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">Back to DMs</button>
        </div>
    `;

    const container = document.getElementById("server-channels-container");
    channels.forEach(chan => {
        const chanDiv = document.createElement("div");
        chanDiv.className = "channel";
        chanDiv.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${chan.name}`;
        chanDiv.onclick = () => openServerChannel(chan.id, chan.name, serverName);
        container.appendChild(chanDiv);
    });

    document.getElementById("view-friends").style.display = "none";
    document.getElementById("view-dms").style.display = "flex";
    document.getElementById("dm-empty-state").innerHTML = `
        <h1 style="font-size: 3rem; color: white; margin-bottom: 10px;">Welcome to ${serverName}</h1>
        <p>Select a channel to start chatting.</p>
    `;
    document.getElementById("dm-active-chat").style.display = "none";
    document.getElementById("dm-empty-state").style.display = "flex";
}

async function promptCreateChannel(serverID, serverName) {
    const channelName = prompt("Enter a name for the new channel:");
    if (!channelName) return;
    const cleanName = channelName.toLowerCase().replace(/\s+/g, '-');

    await fetch("/api/channels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverID, name: cleanName })
    });
    loadServer(serverID, serverName);
}

async function promptInvite(serverID) {
    const friendName = prompt("Enter the username of the friend you want to invite:");
    if (!friendName) return;

    const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverID, user: friendName })
    });

    if (res.ok) {
        alert(`Invited ${friendName} to the server! They will see it when they log in.`);
    } else {
        alert("Failed to invite user.");
    }
}

async function openServerChannel(channelID, channelName, serverName) {
    const currentUser = localStorage.getItem("chathub_username") || "User";
    const currentColor = localStorage.getItem("chathub_color") || "#23a559";

    document.getElementById("dm-empty-state").style.display = "none";
    document.getElementById("dm-active-chat").style.display = "flex";

    document.getElementById("dm-chat-name").innerText = `#${channelName} (${serverName})`;
    document.getElementById("dm-chat-avatar").style.display = "none";
    document.getElementById("dm-message-input").placeholder = `Message #${channelName}`;

    const container = document.getElementById("dm-messages-container");
    container.innerHTML = "";

    const dmInput = document.getElementById("dm-message-input");
    dmInput.onkeypress = async (e) => {
        if (e.key === "Enter" && dmInput.value.trim() !== "") {
            const text = dmInput.value.trim();
            appendDMMessage("You", text, currentColor);
            dmInput.value = "";
            await fetch("/api/server-messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel_id: channelID, sender: currentUser, content: text })
            });
        }
    };

    const res = await fetch(`/api/server-messages/get?channel_id=${channelID}`);
    const messages = await res.json();

    if (messages.length === 0) {
        appendDMMessage("System", `Welcome to #${channelName}!`, "#ff5c46");
    } else {
        messages.forEach(msg => {
            const isMe = msg.sender === currentUser;
            appendDMMessage(isMe ? "You" : msg.sender, msg.content, isMe ? currentColor : "#5865F2");
        });
    }
}

function logout() {
    localStorage.removeItem("chathub_username");
    localStorage.removeItem("chathub_color");
    window.location.href = "index.html";
}

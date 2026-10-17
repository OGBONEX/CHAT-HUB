let activeChatUser = null;
let activeChannelID = null;
let socket;
let typingTimeout;

document.addEventListener("DOMContentLoaded", async () => {
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    let currentColor = localStorage.getItem("chathub_color") || "#23a559"; 
    
    // Update UI
    document.querySelectorAll("#user-display-name, #user-display-name-friends").forEach(el => el.innerText = currentUsername);
    document.querySelectorAll("#user-avatar, #user-avatar-friends").forEach(el => {
        el.innerText = currentUsername.charAt(0).toUpperCase();
        el.style.background = currentColor;
    });

    // 1. Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(`${wsProtocol}${window.location.host}/ws?user=${currentUsername}`);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "new_message" && (activeChatUser === data.sender || activeChatUser === data.receiver)) {
            const isMe = data.sender === currentUsername;
            appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? currentColor : "#5865F2", data.id);
        }
        
        if (data.type === "server_message" && activeChannelID === data.channel_id) {
            const isMe = data.sender === currentUsername;
            appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? currentColor : "#5865F2", data.id);
        }

        if (data.type === "typing") {
            document.getElementById("dm-message-input").placeholder = `${data.user} is typing...`;
        } else if (data.type === "stop_typing") {
            document.getElementById("dm-message-input").placeholder = activeChannelID ? `Message #${document.getElementById("dm-chat-name").innerText.split(" ")[0].replace('#', '')}` : `Message @${activeChatUser}`;
        }
    };

    // 2. Load Friends, Servers, and Recent DMs
    try {
        const res = await fetch(`/api/friends?user=${currentUsername}`);
        const data = await res.json();
        renderFriendsList(data.friends);
    } catch (err) { console.log("Could not load friends."); }

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

    try {
        const res = await fetch(`/api/messages/recent?user=${currentUsername}`);
        const contacts = await res.json();
        const dmListContainer = document.getElementById("dm-list-container");
        
        if (contacts.length > 0) {
            dmListContainer.innerHTML = ""; 
            contacts.forEach(contact => {
                const dmDiv = document.createElement("div");
                dmDiv.className = "dm-user";
                dmDiv.onclick = () => openChat(contact);
                dmDiv.innerHTML = `
                    <div class="avatar" style="background: #5865F2; width: 32px; height: 32px; font-size: 0.9rem;">${contact.charAt(0).toUpperCase()}</div>
                    <div class="dm-info">
                        <span class="dm-name">${contact}</span>
                        <span class="dm-status">Click to chat</span>
                    </div>
                `;
                dmListContainer.appendChild(dmDiv);
            });
        }
    } catch (err) { console.log("Could not load recent DMs."); }

    // 3. Navigation
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

    // 4. Typing Indicator
    const dmInput = document.getElementById("dm-message-input");
    dmInput.addEventListener("input", () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const target = activeChannelID ? `channel_${activeChannelID}` : activeChatUser;
        if (!target) return;
        socket.send(JSON.stringify({ type: "typing", user: currentUsername, target: target }));
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.send(JSON.stringify({ type: "stop_typing", user: currentUsername, target: target }));
        }, 2000);
    });

    // 5. Settings Modal (Now targets multiple buttons)
    document.querySelectorAll("#settings-btn, #settings-btn-friends").forEach(btn => {
        if(btn) btn.addEventListener("click", () => {
            document.getElementById("settings-username").value = localStorage.getItem("chathub_username") || "User";
            document.getElementById("settings-color").value = localStorage.getItem("chathub_color") || "#23a559";
            document.getElementById("settings-modal").classList.add("active");
        });
    });
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));

    // 6. Explore Modal
    document.getElementById("explore-btn").addEventListener("click", async () => {
        document.getElementById("explore-modal").classList.add("active");
        const list = document.getElementById("public-servers-list");
        list.innerHTML = "<p style='color: var(--text-muted);'>Loading servers...</p>";
        
        try {
            const res = await fetch("/api/servers/public");
            const servers = await res.json();
            
            list.innerHTML = "";
            if (servers.length === 0) {
                list.innerHTML = "<p style='color: var(--text-muted);'>No servers found.</p>";
                return;
            }

            servers.forEach(server => {
                const div = document.createElement("div");
                div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 12px; border: 1px solid var(--glass-border);";
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="avatar" style="background: var(--accent);">${server.name.charAt(0).toUpperCase()}</div>
                        <span style="font-weight: bold; color: white;">${server.name}</span>
                    </div>
                    <button onclick="joinServer(${server.id}, '${server.name}')" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">Join</button>
                `;
                list.appendChild(div);
            });
        } catch (err) {
            list.innerHTML = "<p style='color: #ff5c46;'>Error loading servers.</p>";
        }
    });
    document.getElementById("close-explore").addEventListener("click", () => document.getElementById("explore-modal").classList.remove("active"));

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

// --- Join Server from Explore ---
async function joinServer(serverID, serverName) {
    const currentUser = localStorage.getItem("chathub_username") || "User";
    const res = await fetch("/api/servers/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverID, user: currentUser })
    });

    if (res.ok) {
        alert(`Joined ${serverName}!`);
        document.getElementById("explore-modal").classList.remove("active");
        
        const newIcon = document.createElement("div");
        newIcon.className = "server-icon";
        newIcon.innerText = serverName.substring(0, 2).toUpperCase();
        newIcon.title = serverName;
        newIcon.onclick = () => loadServer(serverID, serverName);
        const divider = document.querySelector(".sidebar-divider");
        divider.parentNode.insertBefore(newIcon, divider);
        
        loadServer(serverID, serverName);
    } else {
        alert("Failed to join server.");
    }
}

// --- Message Rendering ---
function appendDMMessage(author, text, color, msgID) {
    const container = document.getElementById("dm-messages-container");
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    msgDiv.style.position = "relative";
    
    msgDiv.innerHTML = `
        <div class="avatar" style="background: ${color};">${author.charAt(0).toUpperCase()}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="author" style="color: ${color};">${author}</span>
                <span class="time">Just now</span>
            </div>
            <div class="text" id="text-${msgID}">${text}</div>
        </div>
    `;

    if (author === "You" && msgID && msgID !== "welcome") {
        msgDiv.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showContextMenu(e.pageX, e.pageY, msgID, text);
        });
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function showContextMenu(x, y, msgID, currentText) {
    const existingMenu = document.getElementById("custom-context-menu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "custom-context-menu";
    menu.style.cssText = `
        position: absolute; top: ${y}px; left: ${x}px; background: rgba(30, 27, 75, 0.95);
        border: 1px solid var(--glass-border); border-radius: 12px; padding: 8px 0;
        z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); min-width: 120px; backdrop-filter: blur(10px);
    `;
    menu.innerHTML = `
        <div onclick="editMessage(${msgID}, '${currentText}')" style="padding: 10px 16px; cursor: pointer; color: white; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-pen"></i> Edit
        </div>
        <div onclick="deleteMessage(${msgID})" style="padding: 10px 16px; cursor: pointer; color: #ff5c46; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-trash"></i> Delete
        </div>
    `;
    document.body.appendChild(menu);
    document.addEventListener("click", () => { if (menu) menu.remove(); }, { once: true });
}

async function editMessage(msgID, oldText) {
    const newText = prompt("Edit your message:", oldText);
    if (newText && newText !== oldText) {
        await fetch("/api/messages/edit", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msgID, content: newText })
        });
        document.getElementById(`text-${msgID}`).innerText = newText;
    }
}

async function deleteMessage(msgID) {
    if (confirm("Are you sure you want to delete this message?")) {
        await fetch("/api/messages/delete", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msgID })
        });
        document.getElementById(`text-${msgID}`).innerText = "This message was deleted.";
        document.getElementById(`text-${msgID}`).style.color = "var(--text-muted)";
        document.getElementById(`text-${msgID}`).style.fontStyle = "italic";
    }
}

// --- Open DM ---
async function openChat(friendName) {
    activeChatUser = friendName;
    activeChannelID = null;
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
            dmInput.value = "";
            fetch("/api/messages/send", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: currentUser, receiver: friendName, content: text })
            }).then(() => {
                fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`).then(res=>res.json()).then(messages=>{
                    container.innerHTML = "";
                    messages.forEach(msg => {
                        const isMe = msg.sender === currentUser;
                        appendDMMessage(isMe ? "You" : friendName, msg.content, isMe ? currentColor : "#5865F2", msg.id);
                    });
                    
                    fetch(`/api/messages/recent?user=${currentUser}`).then(res=>res.json()).then(contacts=>{
                        const dmListContainer = document.getElementById("dm-list-container");
                        dmListContainer.innerHTML = "";
                        contacts.forEach(contact => {
                            const dmDiv = document.createElement("div");
                            dmDiv.className = "dm-user";
                            dmDiv.onclick = () => openChat(contact);
                            dmDiv.innerHTML = `
                                <div class="avatar" style="background: #5865F2; width: 32px; height: 32px; font-size: 0.9rem;">${contact.charAt(0).toUpperCase()}</div>
                                <div class="dm-info">
                                    <span class="dm-name">${contact}</span>
                                    <span class="dm-status">Click to chat</span>
                                </div>
                            `;
                            dmListContainer.appendChild(dmDiv);
                        });
                    });
                });
            });
        }
    };

    try {
        const res = await fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`);
        const messages = await res.json();
        if (messages.length === 0) {
            appendDMMessage(friendName, "This is the start of your conversation.", "#5865F2", "welcome");
        } else {
            messages.forEach(msg => {
                const isMe = msg.sender === currentUser;
                appendDMMessage(isMe ? "You" : friendName, msg.content, isMe ? currentColor : "#5865F2", msg.id);
            });
        }
    } catch (err) { console.error(err); }
}

// --- Friends ---
async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    if (friendName.toLowerCase() === currentUser.toLowerCase()) { alert("You can't add yourself!"); return; }

    const response = await fetch("/api/friends", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: currentUser, friend: friendName })
    });

    if (response.ok) {
        const getRes = await fetch(`/api/friends?user=${currentUser}`);
        const data = await getRes.json();
        renderFriendsList(data.friends);
        document.getElementById("friend-search").value = "";
    } else { alert("User not found."); }
}

function renderFriendsList(friends) {
    const friendsList = document.getElementById("friends-list");
    friendsList.innerHTML = (!friends || friends.length === 0) ? `<p style="color: var(--text-muted); font-size: 0.9rem;">You don't have any friends yet.</p>` : "";
    friends.forEach(friendName => {
        const friendDiv = document.createElement("div");
        friendDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 12px; margin-bottom: 8px;";
        friendDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="avatar" style="background: #5865F2;">${friendName.charAt(0).toUpperCase()}</div>
                <span style="font-weight: bold; color: white;">${friendName}</span>
            </div>
            <button onclick="openChat('${friendName}')" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">Message</button>
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_username: oldName, new_username: newName, new_color: newColor })
    });

    if (res.ok) {
        localStorage.setItem("chathub_username", newName);
        localStorage.setItem("chathub_color", newColor);
        
        document.querySelectorAll("#user-display-name, #user-display-name-friends").forEach(el => el.innerText = newName);
        document.querySelectorAll("#user-avatar, #user-avatar-friends").forEach(el => {
            el.innerText = newName.charAt(0).toUpperCase();
            el.style.background = newColor;
        });
        
        alert("Profile updated!");
        document.getElementById("settings-modal").classList.remove("active");
    } else { alert("That username is already taken."); }
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
             <button onclick="promptInvite(${serverID})" style="background: #10b981; border: none; color: white; width: 100%; padding: 10px; border-radius: 12px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">Invite Friends</button>
             <button onclick="window.location.reload()" style="background: var(--bg-input); border: 1px solid var(--glass-border); color: white; width: 100%; padding: 10px; border-radius: 12px; cursor: pointer; font-weight: bold;">Back to DMs</button>
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverID, name: cleanName })
    });
    loadServer(serverID, serverName);
}

async function promptInvite(serverID) {
    const friendName = prompt("Enter the username of the friend you want to invite:");
    if (!friendName) return;
    const res = await fetch("/api/servers/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: serverID, user: friendName })
    });
    if (res.ok) alert(`Invited ${friendName} to the server!`);
    else alert("Failed to invite user.");
}

async function openServerChannel(channelID, channelName, serverName) {
    activeChannelID = channelID;
    activeChatUser = null;
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
            dmInput.value = "";
            fetch("/api/server-messages/send", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channel_id: channelID, sender: currentUser, content: text })
            }).then(() => {
                fetch(`/api/server-messages/get?channel_id=${channelID}`).then(res=>res.json()).then(messages=>{
                    container.innerHTML = "";
                    messages.forEach(msg => {
                        const isMe = msg.sender === currentUser;
                        appendDMMessage(isMe ? "You" : msg.sender, msg.content, isMe ? currentColor : "#5865F2", msg.id);
                    });
                });
            });
        }
    };

    const res = await fetch(`/api/server-messages/get?channel_id=${channelID}`);
    const messages = await res.json();
    if (messages.length === 0) {
        appendDMMessage("System", `Welcome to #${channelName}!`, "#ff5c46", "welcome");
    } else {
        messages.forEach(msg => {
            const isMe = msg.sender === currentUser;
            appendDMMessage(isMe ? "You" : msg.sender, msg.content, isMe ? currentColor : "#5865F2", msg.id);
        });
    }
}

function logout() {
    localStorage.removeItem("chathub_username");
    localStorage.removeItem("chathub_color");
    window.location.href = "index.html";
}

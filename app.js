let activeChatUser = null;
let activeChannelID = null;
let socket;
let typingTimeout;

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

    // 2. Load Friends & Servers
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

    // 5. Settings & Create Server
    document.getElementById("settings-btn").addEventListener("click", () => {
        document.getElementById("settings-username").value = currentUsername;
        document.getElementById("settings-color").value = currentColor;
        document.getElementById("settings-modal").classList.add("active");
    });
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));

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

// --- Message Rendering with Context Menu ---
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

    // If it's your own message, add a right-click (contextmenu) listener
    if (author === "You" && msgID) {
        msgDiv.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showContextMenu(e.pageX, e.pageY, msgID, text);
        });
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function showContextMenu(x, y, msgID, currentText) {
    // Remove existing menu if any
    const existingMenu = document.getElementById("custom-context-menu");
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement("div");
    menu.id = "custom-context-menu";
    menu.style.cssText = `
        position: absolute; top: ${y}px; left: ${x}px; background: var(--bg-sidebar);
        border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 0;
        z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); min-width: 120px;
    `;

    menu.innerHTML = `
        <div onclick="editMessage(${msgID}, '${currentText}')" style="padding: 8px 16px; cursor: pointer; color: white; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-pen"></i> Edit
        </div>
        <div onclick="deleteMessage(${msgID})" style="padding: 8px 16px; cursor: pointer; color: #ff5c46; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
            <i class="fa-solid fa-trash"></i> Delete
        </div>
    `;

    document.body.appendChild(menu);

    // Close menu on click anywhere else
    document.addEventListener("click", () => {
        if (menu) menu.remove();
    }, { once: true });
}

async function editMessage(msgID, oldText) {
    const newText = prompt("Edit your message:", oldText);
    if (newText && newText !== oldText) {
        await fetch("/api/messages/edit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msgID, content: newText })
        });
        document.getElementById(`text-${msgID}`).innerText = newText;
    }
}

async function deleteMessage(msgID) {
    if (confirm("Are you sure you want to delete this message?")) {
        await fetch("/api/messages/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: msgID })
        });
        document.getElementById(`text-${msgID}`).innerText = "This message was deleted.";
        document.getElementById(`text-${msgID}`).style.color = "var(--text-muted)";
        document.getElementById(`text-${msgID}`).style.fontStyle = "italic";
    }
}

// --- DM & Server Loaders ---
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
            // We will reload the messages to get the ID
            fetch("/api/messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sender: currentUser, receiver: friendName, content: text })
            }).then(() => {
                fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`).then(res=>res.json()).then(messages=>{
                    container.innerHTML = "";
                    messages.forEach(msg => {
                        const isMe = msg.sender === currentUser;
                        appendDMMessage(isMe ? "You" : friendName, msg.content, isMe ? currentColor : "#5865F2", msg.id);
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
                method: "POST",
                headers: { "Content-Type": "application/json" },
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

let activeChatUser = null;
let activeChannelID = null;
let socket;
let typingTimeout;
let currentServerID = null;
let currentServerName = null;

// Voice Variables
let localStream = null;
let peerConnection = null;
const servers = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };

document.addEventListener("DOMContentLoaded", async () => {
    let currentUsername = localStorage.getItem("chathub_username") || "User";
    let currentColor = localStorage.getItem("chathub_color") || "#23a559"; 
    
    document.querySelectorAll("#user-display-name, #user-display-name-friends").forEach(el => el.innerText = currentUsername);
    document.querySelectorAll("#user-avatar, #user-avatar-friends").forEach(el => {
        el.innerText = currentUsername.charAt(0).toUpperCase();
        el.style.background = currentColor;
    });

    // 1. Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    socket = new WebSocket(`${wsProtocol}${window.location.host}/ws?user=${currentUsername}`);

    socket.onmessage = async (event) => {
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
        if (data.type === "webrtc_signal") {
            if (!peerConnection) {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                peerConnection = new RTCPeerConnection(servers);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                peerConnection.ontrack = (e) => { document.getElementById("remote-audio").srcObject = e.streams[0]; };
                peerConnection.onicecandidate = (e) => {
                    if (e.candidate) socket.send(JSON.stringify({ type: "webrtc_signal", target: data.sender, signal: { candidate: e.candidate } }));
                };
                document.getElementById("voice-overlay").style.display = "flex";
            }
            if (data.signal.sdp) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                if (data.signal.sdp.type === "offer") {
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.send(JSON.stringify({ type: "webrtc_signal", target: data.sender, signal: { sdp: peerConnection.localDescription } }));
                }
            }
            if (data.signal.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
    };

    // Load Base Sidebar (DMs & Friends)
    renderBaseSidebar(currentUsername);

    // 2. Modals setup
    document.querySelectorAll("#settings-btn, #settings-btn-friends").forEach(btn => {
        if(btn) btn.addEventListener("click", () => {
            document.getElementById("settings-username").value = localStorage.getItem("chathub_username") || "User";
            document.getElementById("settings-color").value = localStorage.getItem("chathub_color") || "#23a559";
            document.getElementById("settings-modal").classList.add("active");
        });
    });
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));
    document.getElementById("create-server-btn").addEventListener("click", () => document.getElementById("create-server-modal").classList.add("active"));
    document.getElementById("close-create-server").addEventListener("click", () => document.getElementById("create-server-modal").classList.remove("active"));
    document.getElementById("close-create-channel").addEventListener("click", () => document.getElementById("create-channel-modal").classList.remove("active"));

    // Explore Logic
    document.getElementById("explore-btn").addEventListener("click", async () => {
        document.getElementById("explore-modal").classList.add("active");
        const list = document.getElementById("public-servers-list");
        list.innerHTML = "<p style='color: var(--text-muted); grid-column: span 2;'>Loading servers...</p>";
        const res = await fetch("/api/servers/public");
        const servers = await res.json();
        list.innerHTML = servers.length === 0 ? "<p>No servers found.</p>" : "";
        servers.forEach(server => {
            const div = document.createElement("div");
            div.className = "explore-card";
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div class="avatar" style="background: var(--accent); width: 48px; height: 48px; font-size: 1.2rem;">${server.name.charAt(0).toUpperCase()}</div>
                    <span style="font-weight: bold; color: white; font-size: 1.1rem;">${server.name}</span>
                </div>
                <button onclick="joinServer(${server.id}, '${server.name}')" style="background: #10b981; color: white; border: none; padding: 10px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer;">Join Server</button>
            `;
            list.appendChild(div);
        });
    });
    document.getElementById("close-explore").addEventListener("click", () => document.getElementById("explore-modal").classList.remove("active"));

    // Load User's Servers into Sidebar
    const res = await fetch(`/api/servers/get?user=${currentUsername}`);
    const userServers = await res.json();
    const divider = document.querySelector(".sidebar-divider");
    userServers.forEach(server => {
        const newIcon = document.createElement("div");
        newIcon.className = "server-icon";
        newIcon.innerText = server.name.substring(0, 2).toUpperCase();
        newIcon.title = server.name;
        newIcon.onclick = () => loadServer(server.id, server.name);
        divider.parentNode.insertBefore(newIcon, divider);
    });
});

// --- Render Base Sidebar (DMs & Friends) ---
async function renderBaseSidebar(currentUsername) {
    const channelList = document.getElementById("main-channel-list");
    channelList.innerHTML = `
        <div class="channel" id="nav-friends"><i class="fa-solid fa-user-group"></i> Friends</div>
        <div class="channel active" id="nav-dms"><i class="fa-solid fa-inbox"></i> Direct Messages</div>
        <div class="category" id="dm-category">DIRECT MESSAGES</div>
        <div id="dm-list-container"></div>
    `;

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

    const res = await fetch(`/api/friends?user=${currentUsername}`);
    const data = await res.json();
    renderFriendsList(data.friends);

    const dmRes = await fetch(`/api/messages/recent?user=${currentUsername}`);
    const contacts = await dmRes.json();
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
}

// --- Load Server Channels ---
async function loadServer(serverID, serverName) {
    currentServerID = serverID;
    currentServerName = serverName;
    
    const channelList = document.getElementById("main-channel-list");
    const res = await fetch(`/api/channels/get?server_id=${serverID}`);
    const channels = await res.json();

    const textChannels = channels.filter(c => c.type !== 'voice');
    const voiceChannels = channels.filter(c => c.type === 'voice');

    channelList.innerHTML = `
        <div class="category" style="display: flex; justify-content: space-between; align-items: center;">
            TEXT CHANNELS <i class="fa-solid fa-plus" style="cursor: pointer; color: var(--text-muted);" title="Create Channel" onclick="openCreateChannelModal()"></i>
        </div>
        <div id="text-channels-container"></div>
        
        <div class="category" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
            VOICE CHANNELS <i class="fa-solid fa-plus" style="cursor: pointer; color: var(--text-muted);" title="Create Voice Channel" onclick="openCreateChannelModal()"></i>
        </div>
        <div id="voice-channels-container"></div>

        <div style="padding: 16px; margin-top: 20px; display: flex; flex-direction: column; gap: 10px;">
             <button onclick="generateInviteLink(${serverID})" style="background: #10b981; border: none; color: white; width: 100%; padding: 10px; border-radius: 12px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">Invite Friends</button>
             <button onclick="renderBaseSidebar(localStorage.getItem('chathub_username'))" style="background: var(--bg-input); border: 1px solid var(--glass-border); color: white; width: 100%; padding: 10px; border-radius: 12px; cursor: pointer; font-weight: bold;">Back to DMs</button>
        </div>
    `;

    const textContainer = document.getElementById("text-channels-container");
    textChannels.forEach(chan => {
        const chanDiv = document.createElement("div");
        chanDiv.className = "channel";
        chanDiv.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${chan.name}`;
        chanDiv.onclick = () => openServerChannel(chan.id, chan.name, serverName);
        textContainer.appendChild(chanDiv);
    });

    const voiceContainer = document.getElementById("voice-channels-container");
    voiceChannels.forEach(chan => {
        const chanDiv = document.createElement("div");
        chanDiv.className = "channel";
        chanDiv.innerHTML = `<i class="fa-solid fa-volume-high"></i> ${chan.name}`;
        chanDiv.onclick = () => joinVoiceChannel(chan.name);
        voiceContainer.appendChild(chanDiv);
    });

    document.getElementById("view-friends").style.display = "none";
    document.getElementById("view-dms").style.display = "flex";
    document.getElementById("dm-empty-state").innerHTML = `<h1 style="font-size: 3rem; color: white; margin-bottom: 10px;">Welcome to ${serverName}</h1><p>Select a channel to start chatting.</p>`;
    document.getElementById("dm-active-chat").style.display = "none";
    document.getElementById("dm-empty-state").style.display = "flex";
}

// --- Create Channel Logic ---
function openCreateChannelModal() {
    document.getElementById("new-channel-name").value = "";
    document.getElementById("create-channel-modal").classList.add("active");
}

async function submitCreateChannel() {
    const name = document.getElementById("new-channel-name").value.trim();
    const type = document.getElementById("new-channel-type").value;
    if (!name) return alert("Please enter a channel name.");
    const cleanName = name.toLowerCase().replace(/\s+/g, '-');

    await fetch("/api/channels/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_id: currentServerID, name: cleanName, type: type })
    });
    
    document.getElementById("create-channel-modal").classList.remove("active");
    loadServer(currentServerID, currentServerName);
}

// --- Create & Join Server Logic ---
async function createNewServer() {
    const serverName = document.getElementById("new-server-name").value.trim();
    const serverColor = document.getElementById("new-server-color").value;
    const currentUsername = localStorage.getItem("chathub_username");

    if (!serverName) return alert("Please enter a server name.");

    const res = await fetch("/api/servers/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: serverName, owner: currentUsername })
    });
    const data = await res.json();
    
    if (data.server_id) {
        const newIcon = document.createElement("div");
        newIcon.className = "server-icon";
        newIcon.innerText = serverName.substring(0, 2).toUpperCase();
        newIcon.title = serverName;
        newIcon.style.background = serverColor;
        newIcon.onclick = () => loadServer(data.server_id, serverName);
        
        const divider = document.querySelector(".sidebar-divider");
        divider.parentNode.insertBefore(newIcon, divider);
        
        document.getElementById("create-server-modal").classList.remove("active");
        document.getElementById("new-server-name").value = "";
        loadServer(data.server_id, serverName);
    }
}

async function joinServer(serverID, serverName) {
    const currentUser = localStorage.getItem("chathub_username") || "User";
    const res = await fetch("/api/servers/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ server_id: serverID, user: currentUser }) });
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
    } else alert("Failed to join server.");
}

function filterExplore() {
    const query = document.getElementById("explore-search").value.toLowerCase();
    const cards = document.querySelectorAll(".explore-card");
    cards.forEach(card => {
        const name = card.querySelector("span").innerText.toLowerCase();
        card.style.display = name.includes(query) ? "flex" : "none";
    });
}

// --- Voice Logic ---
async function joinVoiceChannel(channelName) {
    document.getElementById("voice-overlay").style.display = "flex";
    document.getElementById("voice-channel-name").innerText = channelName;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.ontrack = (event) => { document.getElementById("remote-audio").srcObject = event.streams[0]; };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const targetUser = prompt("Who do you want to call? (Enter their username)");
                if (targetUser) socket.send(JSON.stringify({ type: "webrtc_signal", target: targetUser, signal: { candidate: event.candidate } }));
            }
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const targetUser = prompt("Who do you want to call? (Enter their username)");
        if (targetUser) socket.send(JSON.stringify({ type: "webrtc_signal", target: targetUser, signal: { sdp: peerConnection.localDescription } }));
    } catch (err) { alert("Could not access microphone."); }
}

function leaveVoiceChannel() {
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();
    localStream = null;
    peerConnection = null;
    document.getElementById("remote-audio").srcObject = null;
    document.getElementById("voice-overlay").style.display = "none";
}

// --- Message Logic ---
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
        msgDiv.addEventListener("contextmenu", (e) => { e.preventDefault(); showContextMenu(e.pageX, e.pageY, msgID, text); });
    }
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function showContextMenu(x, y, msgID, currentText) {
    const existingMenu = document.getElementById("custom-context-menu");
    if (existingMenu) existingMenu.remove();
    const menu = document.createElement("div");
    menu.id = "custom-context-menu";
    menu.style.cssText = `position: absolute; top: ${y}px; left: ${x}px; background: rgba(30, 27, 75, 0.95); border: 1px solid var(--glass-border); border-radius: 12px; padding: 8px 0; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.5); min-width: 120px; backdrop-filter: blur(10px);`;
    menu.innerHTML = `
        <div onclick="editMessage(${msgID}, '${currentText}')" style="padding: 10px 16px; cursor: pointer; color: white; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'"><i class="fa-solid fa-pen"></i> Edit</div>
        <div onclick="deleteMessage(${msgID})" style="padding: 10px 16px; cursor: pointer; color: #ff5c46; font-size: 0.9rem;" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'"><i class="fa-solid fa-trash"></i> Delete</div>
    `;
    document.body.appendChild(menu);
    document.addEventListener("click", () => { if (menu) menu.remove(); }, { once: true });
}

async function editMessage(msgID, oldText) {
    const newText = prompt("Edit your message:", oldText);
    if (newText && newText !== oldText) {
        await fetch("/api/messages/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: msgID, content: newText }) });
        document.getElementById(`text-${msgID}`).innerText = newText;
    }
}

async function deleteMessage(msgID) {
    if (confirm("Delete this message?")) {
        await fetch("/api/messages/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: msgID }) });
        document.getElementById(`text-${msgID}`).innerText = "This message was deleted.";
        document.getElementById(`text-${msgID}`).style.color = "var(--text-muted)";
        document.getElementById(`text-${msgID}`).style.fontStyle = "italic";
    }
}

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
            fetch("/api/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sender: currentUser, receiver: friendName, content: text }) })
            .then(() => {
                fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`).then(res=>res.json()).then(messages=>{
                    container.innerHTML = "";
                    messages.forEach(msg => appendDMMessage(msg.sender === currentUser ? "You" : friendName, msg.content, msg.sender === currentUser ? currentColor : "#5865F2", msg.id));
                });
            });
        }
    };

    try {
        const res = await fetch(`/api/messages/get?user1=${currentUser}&user2=${friendName}`);
        const messages = await res.json();
        if (messages.length === 0) appendDMMessage(friendName, "This is the start of your conversation.", "#5865F2", "welcome");
        else messages.forEach(msg => appendDMMessage(msg.sender === currentUser ? "You" : friendName, msg.content, msg.sender === currentUser ? currentColor : "#5865F2", msg.id));
    } catch (err) { console.error(err); }
}

// --- Generate & Join Invite Link ---
async function generateInviteLink(serverID) {
    const currentUser = localStorage.getItem("chathub_username") || "User";
    const res = await fetch("/api/invites/generate", {
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ server_id: serverID, creator: currentUser })
    });
    
    const data = await res.json();
    if (data.code) {
        const inviteLink = `${window.location.origin}/invite.html?code=${data.code}`;
        
        navigator.clipboard.writeText(inviteLink).then(() => {
            alert(`Invite link copied to clipboard!\n\n${inviteLink}`);
        }).catch(err => {
            prompt("Here is your invite link:", inviteLink);
        });
    } else {
        alert("Failed to generate invite.");
    }
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
            fetch("/api/server-messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: channelID, sender: currentUser, content: text }) })
            .then(() => {
                fetch(`/api/server-messages/get?channel_id=${channelID}`).then(res=>res.json()).then(messages=>{
                    container.innerHTML = "";
                    messages.forEach(msg => appendDMMessage(msg.sender === currentUser ? "You" : msg.sender, msg.content, msg.sender === currentUser ? currentColor : "#5865F2", msg.id));
                });
            });
        }
    };

    const res = await fetch(`/api/server-messages/get?channel_id=${channelID}`);
    const messages = await res.json();
    if (messages.length === 0) appendDMMessage("System", `Welcome to #${channelName}!`, "#ff5c46", "welcome");
    else messages.forEach(msg => appendDMMessage(msg.sender === currentUser ? "You" : msg.sender, msg.content, msg.sender === currentUser ? currentColor : "#5865F2", msg.id));
}

async function addFriend() {
    const friendName = document.getElementById("friend-search").value.trim();
    if (!friendName) return;
    const currentUser = localStorage.getItem("chathub_username") || "User";
    if (friendName.toLowerCase() === currentUser.toLowerCase()) return alert("You can't add yourself!");
    const response = await fetch("/api/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: currentUser, friend: friendName }) });
    if (response.ok) {
        const getRes = await fetch(`/api/friends?user=${currentUser}`);
        renderFriendsList((await getRes.json()).friends);
        document.getElementById("friend-search").value = "";
    } else alert("User not found.");
}

function renderFriendsList(friends) {
    const friendsList = document.getElementById("friends-list");
    friendsList.innerHTML = (!friends || friends.length === 0) ? `<p style="color: var(--text-muted); font-size: 0.9rem;">You don't have any friends yet.</p>` : "";
    friends.forEach(friendName => {
        const friendDiv = document.createElement("div");
        friendDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 12px; margin-bottom: 8px;";
        friendDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;"><div class="avatar" style="background: #5865F2;">${friendName.charAt(0).toUpperCase()}</div><span style="font-weight: bold; color: white;">${friendName}</span></div>
            <button onclick="openChat('${friendName}')" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);">Message</button>
        `;
        friendsList.appendChild(friendDiv);
    });
}

async function saveProfile() {
    const oldName = localStorage.getItem("chathub_username") || "User";
    const newName = document.getElementById("settings-username").value.trim();
    const newColor = document.getElementById("settings-color").value;
    if (!newName) return alert("Username cannot be empty.");
    const res = await fetch("/api/profile/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old_username: oldName, new_username: newName, new_color: newColor }) });
    if (res.ok) {
        localStorage.setItem("chathub_username", newName);
        localStorage.setItem("chathub_color", newColor);
        document.querySelectorAll("#user-display-name, #user-display-name-friends").forEach(el => el.innerText = newName);
        document.querySelectorAll("#user-avatar, #user-avatar-friends").forEach(el => { el.innerText = newName.charAt(0).toUpperCase(); el.style.background = newColor; });
        alert("Profile updated!"); document.getElementById("settings-modal").classList.remove("active");
    } else alert("That username is already taken.");
}

function logout() {
    localStorage.removeItem("chathub_username");
    localStorage.removeItem("chathub_color");
    window.location.href = "index.html";
}

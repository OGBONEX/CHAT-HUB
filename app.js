let activeChatUser = null;
let activeChannelID = null;
let socket;
let typingTimeout;

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

    // 2. WebSocket Message Handler
    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        // Handle Chats
        if (data.type === "new_message" && (activeChatUser === data.sender || activeChatUser === data.receiver)) {
            const isMe = data.sender === currentUsername;
            appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? currentColor : "#5865F2", data.id);
        }
        if (data.type === "server_message" && activeChannelID === data.channel_id) {
            const isMe = data.sender === currentUsername;
            appendDMMessage(isMe ? "You" : data.sender, data.content, isMe ? currentColor : "#5865F2", data.id);
        }

        // Handle Typing
        if (data.type === "typing") {
            document.getElementById("dm-message-input").placeholder = `${data.user} is typing...`;
        } else if (data.type === "stop_typing") {
            document.getElementById("dm-message-input").placeholder = activeChannelID ? `Message #${document.getElementById("dm-chat-name").innerText.split(" ")[0].replace('#', '')}` : `Message @${activeChatUser}`;
        }

        // Handle WebRTC Signaling
        if (data.type === "webrtc_signal") {
            if (!peerConnection) {
                localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                peerConnection = new RTCPeerConnection(servers);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
                
                peerConnection.ontrack = (e) => {
                    document.getElementById("remote-audio").srcObject = e.streams[0];
                };
                
                peerConnection.onicecandidate = (e) => {
                    if (e.candidate) {
                        socket.send(JSON.stringify({
                            type: "webrtc_signal", target: data.sender, signal: { candidate: e.candidate }
                        }));
                    }
                };
                document.getElementById("voice-overlay").style.display = "flex";
            }

            if (data.signal.sdp) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
                if (data.signal.sdp.type === "offer") {
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    socket.send(JSON.stringify({
                        type: "webrtc_signal", target: data.sender, signal: { sdp: peerConnection.localDescription }
                    }));
                }
            }
            if (data.signal.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
            }
        }
    };

    // 3. Load Data
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

    // 5. Typing
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

    // 6. Settings & Explore Modals
    document.querySelectorAll("#settings-btn, #settings-btn-friends").forEach(btn => {
        if(btn) btn.addEventListener("click", () => {
            document.getElementById("settings-username").value = localStorage.getItem("chathub_username") || "User";
            document.getElementById("settings-color").value = localStorage.getItem("chathub_color") || "#23a559";
            document.getElementById("settings-modal").classList.add("active");
        });
    });
    document.getElementById("close-settings").addEventListener("click", () => document.getElementById("settings-modal").classList.remove("active"));

    document.getElementById("explore-btn").addEventListener("click", async () => {
        document.getElementById("explore-modal").classList.add("active");
        const list = document.getElementById("public-servers-list");
        list.innerHTML = "<p style='color: var(--text-muted);'>Loading servers...</p>";
        try {
            const res = await fetch("/api/servers/public");
            const servers = await res.json();
            list.innerHTML = "";
            servers.forEach(server => {
                const div = document.createElement("div");
                div.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 12px; border: 1px solid var(--glass-border);";
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="avatar" style="background: var(--accent);">${server.name.charAt(

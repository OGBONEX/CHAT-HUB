document.addEventListener("DOMContentLoaded", () => {
    // --- 1. WebSocket Connection ---
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const socket = new WebSocket(wsProtocol + window.location.host + '/ws');

    socket.onopen = () => console.log("Connected to Chat Hub WebSocket!");
    socket.onerror = (error) => console.error("WebSocket Error:", error);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === "presence") {
            const onlineCount = document.getElementById("online-count");
            if (onlineCount) onlineCount.innerText = data.count;
        } 
        else if (data.type === "chat") {
            appendMessage(data.author, data.text, data.color);
        }
    };

    // --- 2. Chat Input Logic ---
    const messageInput = document.getElementById("message-input");
    const chatMessages = document.getElementById("chat-messages");

    if (messageInput && chatMessages) {
        messageInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter" && messageInput.value.trim() !== "") {
                event.preventDefault();
                
                const payload = {
                    type: "chat",
                    author: "You", 
                    text: messageInput.value.trim(),
                    color: "#5865F2" 
                };

                socket.send(JSON.stringify(payload));
                messageInput.value = "";
            }
        });
    }

    function appendMessage(author, text, color) {
        if (!chatMessages) return;
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";
        const initial = author.charAt(0).toUpperCase();

        messageDiv.innerHTML = `
            <div class="avatar" style="background: ${color};">${initial}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="author" style="color: ${color};">${author}</span>
                    <span class="time">Just now</span>
                </div>
                <div class="text">${escapeHTML(text)}</div>
            </div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    }

    // --- 3. Sidebar Action Buttons Logic ---
    const createServerBtn = document.getElementById("create-server-btn");
    const exploreBtn = document.getElementById("explore-btn");

    if (createServerBtn) {
        createServerBtn.addEventListener("click", () => {
            const serverName = prompt("Enter a name for your new server:");
            if (serverName) {
                alert(`Server "${serverName}" created! (Backend logic coming soon)`);
                const newIcon = document.createElement("div");
                newIcon.className = "server-icon";
                newIcon.innerText = serverName.substring(0, 2).toUpperCase();
                newIcon.title = serverName;
                const divider = document.querySelector(".sidebar-divider");
                divider.parentNode.insertBefore(newIcon, divider);
            }
        });
    }

    if (exploreBtn) {
        exploreBtn.addEventListener("click", () => alert("Opening the Server Discovery page..."));
    }

    // --- 4. Settings Modal Logic ---
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const closeSettings = document.getElementById("close-settings");

    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => settingsModal.classList.add("active"));
    }

    if (closeSettings) {
        closeSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
    }

    if (settingsModal) {
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove("active");
        });
    }

    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", function() {
            tabs.forEach(t => t.classList.remove("active"));
            this.classList.add("active");
        });
    });
});

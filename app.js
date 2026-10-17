document.addEventListener("DOMContentLoaded", () => {
    const messageInput = document.getElementById("message-input");
    const chatMessages = document.getElementById("chat-messages");

    // 1. Connect to the Go WebSocket backend
    // We use window.location.host so it works both locally and in Codespaces
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const socket = new WebSocket(wsProtocol + window.location.host + '/ws');

    socket.onopen = () => {
        console.log("Connected to Chat Hub WebSocket!");
    };

    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
    };

    // 2. Listen for incoming messages from the server
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        appendMessage(data.author, data.text, data.color);
    };

    // 3. Send message on Enter key
    messageInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter" && messageInput.value.trim() !== "") {
            event.preventDefault();
            
            // Create the message payload
            const payload = {
                author: "You", // Later, we will use the logged-in user's name
                text: messageInput.value.trim(),
                color: "#5865F2" // Chat Hub Blue
            };

            // Send to Go server
            socket.send(JSON.stringify(payload));
            messageInput.value = "";
        }
    });

    // 4. Function to add the message to the HTML
    function appendMessage(author, text, color) {
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";
        
        messageDiv.innerHTML = `
            <div class="avatar" style="background: ${color};">${author.charAt(0).toUpperCase()}</div>
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

    // Security: Prevent XSS attacks
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag])
        );
    }
});

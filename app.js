document.addEventListener("DOMContentLoaded", () => {
    const messageInput = document.getElementById("message-input");
    const chatMessages = document.getElementById("chat-messages");

    // Send message on Enter key
    messageInput.addEventListener("keypress", function(event) {
        if (event.key === "Enter" && messageInput.value.trim() !== "") {
            event.preventDefault();
            sendMessage(messageInput.value.trim());
            messageInput.value = "";
        }
    });

    function sendMessage(text) {
        // 1. Create the HTML for the new message
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";
        
        messageDiv.innerHTML = `
            <div class="avatar" style="background: var(--accent);">Y</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="author" style="color: var(--accent);">You</span>
                    <span class="time">Just now</span>
                </div>
                <div class="text">${escapeHTML(text)}</div>
            </div>
        `;

        // 2. Add it to the chat
        chatMessages.appendChild(messageDiv);
        
        // 3. Auto-scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // NOTE: Later, we will add a WebSocket connection here to send this to Go!
    }

    // Security: Prevent XSS (Cross Site Scripting) attacks
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }
});

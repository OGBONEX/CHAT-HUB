package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // Allow all origins for dev
}

// Client represents a single connected user
type Client struct {
	conn *websocket.Conn
}

// Global hub to keep track of all connected clients
var (
	clients   = make(map[*Client]bool)
	clientsMu sync.Mutex
)

// Message structure
type Message struct {
	Author string `json:"author"`
	Text   string `json:"text"`
	Color  string `json:"color"`
}

func main() {
	// 1. Serve the static frontend files
	fs := http.FileServer(http.Dir("./"))
	http.Handle("/", fs)

	// 2. API Endpoints
	http.HandleFunc("/api/request-otp", handleRequestOTP)
	http.HandleFunc("/api/verify-otp", handleVerifyOTP)
	
	// 3. WebSocket Endpoint for Real-Time Chat
	http.HandleFunc("/ws", handleConnections)

	// 4. Start the server
	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}

// --- WEBSOCKET LOGIC ---

func handleConnections(w http.ResponseWriter, r *http.Request) {
	// Upgrade initial GET request to a websocket
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer ws.Close()

	client := &Client{conn: ws}

	// Register our new client
	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()

	// Remove client when they disconnect
	defer func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
	}()

	for {
		var msg Message
		// Read in a new message as JSON and map it to a Message object
		err := ws.ReadJSON(&msg)
		if err != nil {
			// If error (e.g. user closed tab), remove client and break loop
			clientsMu.Lock()
			delete(clients, client)
			clientsMu.Unlock()
			break
		}

		// Broadcast the message to everyone
		broadcastMessage(msg)
	}
}

func broadcastMessage(msg Message) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	for client := range clients {
		err := client.conn.WriteJSON(msg)
		if err != nil {
			client.conn.Close()
			delete(clients, client)
		}
	}
}

// --- OTP LOGIC (From before) ---
var otpStore = make(map[string]string)
var otpMutex sync.RWMutex

type OTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func handleRequestOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPRequest
	json.NewDecoder(r.Body).Decode(&req)
	otpMutex.Lock()
	otpStore[req.Email] = "123456"
	otpMutex.Unlock()
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent"})
}

func handleVerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPRequest
	json.NewDecoder(r.Body).Decode(&req)
	otpMutex.RLock()
	savedCode := otpStore[req.Email]
	otpMutex.RUnlock()
	if savedCode == req.Code && savedCode != "" {
		delete(otpStore, req.Email)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"token": "fake-jwt"})
	} else {
		http.Error(w, "Invalid code", http.StatusUnauthorized)
	}
}

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	conn *websocket.Conn
}

var (
	clients   = make(map[*Client]bool)
	clientsMu sync.Mutex
)

// Message structure
type Message struct {
	Author string `json:"author"`
	Text   string `json:"text"`
	Color  string `json:"color"`
	Type   string `json:"type"` // "chat" or "presence"
	Count  int    `json:"count,omitempty"` // Used for presence
}

func main() {
	fs := http.FileServer(http.Dir("./"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})

	http.HandleFunc("/api/request-otp", handleRequestOTP)
	http.HandleFunc("/api/verify-otp", handleVerifyOTP)
	http.HandleFunc("/ws", handleConnections)

	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Fatal(err)
	}
	defer ws.Close()

	client := &Client{conn: ws}

	clientsMu.Lock()
	clients[client] = true
	clientsMu.Unlock()

	// Broadcast new user count to everyone
	broadcastPresence()

	defer func() {
		clientsMu.Lock()
		delete(clients, client)
		clientsMu.Unlock()
		broadcastPresence() // Broadcast when someone leaves
	}()

	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			clientsMu.Lock()
			delete(clients, client)
			clientsMu.Unlock()
			broadcastPresence()
			break
		}
		
		// If it's a chat message, broadcast it
		if msg.Type == "chat" {
			broadcastMessage(msg)
		}
	}
}

func broadcastMessage(msg Message) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	for client := range clients {
		client.conn.WriteJSON(msg)
	}
}

// Sends the real-time online count
func broadcastPresence() {
	clientsMu.Lock()
	count := len(clients)
	clientsMu.Unlock()

	msg := Message{
		Type:  "presence",
		Count: count,
	}
	
	clientsMu.Lock()
	defer clientsMu.Unlock()
	for client := range clients {
		client.conn.WriteJSON(msg)
	}
}

var otpStore = make(map[string]string)
var otpMutex sync.RWMutex
type OTPRequest struct { Email string `json:"email"`; Code string `json:"code"` }
func handleRequestOTP(w http.ResponseWriter, r *http.Request) { var req OTPRequest; json.NewDecoder(r.Body).Decode(&req); otpMutex.Lock(); otpStore[req.Email] = "123456"; otpMutex.Unlock(); w.WriteHeader(http.StatusOK); json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent"}) }
func handleVerifyOTP(w http.ResponseWriter, r *http.Request) { var req OTPRequest; json.NewDecoder(r.Body).Decode(&req); otpMutex.RLock(); savedCode := otpStore[req.Email]; otpMutex.RUnlock(); if savedCode == req.Code && savedCode != "" { delete(otpStore, req.Email); w.WriteHeader(http.StatusOK); json.NewEncoder(w).Encode(map[string]string{"token": "fake-jwt"}) } else { http.Error(w, "Invalid code", http.StatusUnauthorized) } }

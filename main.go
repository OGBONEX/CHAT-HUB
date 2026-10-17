package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
type Client struct { conn *websocket.Conn }
var (clients = make(map[*Client]bool); clientsMu sync.Mutex)

// --- Chat & Friends Data ---
type Message struct { Author string `json:"author"`; Text string `json:"text"`; Color string `json:"color"`; Type string `json:"type"` }

// In-memory Friends Store
var (
	friendsStore = make(map[string][]string) // map[username][]friends
	friendsMu    sync.RWMutex
)

func main() {
	fs := http.FileServer(http.Dir("./"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})

	// APIs
	http.HandleFunc("/api/request-otp", handleRequestOTP)
	http.HandleFunc("/api/verify-otp", handleVerifyOTP)
	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/friends", handleFriends) // NEW: Friends API
	http.HandleFunc("/ws", handleConnections)

	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	log.Fatal(http.ListenAndServe(port, nil))
}

// --- WEBSOCKET ---
func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { log.Fatal(err) }
	defer ws.Close()

	client := &Client{conn: ws}
	clientsMu.Lock(); clients[client] = true; clientsMu.Unlock()

	defer func() {
		clientsMu.Lock(); delete(clients, client); clientsMu.Unlock()
	}()

	for {
		var msg Message
		err := ws.ReadJSON(&msg)
		if err != nil {
			clientsMu.Lock(); delete(clients, client); clientsMu.Unlock(); break
		}
		clientsMu.Lock()
		for c := range clients { c.conn.WriteJSON(msg) }
		clientsMu.Unlock()
	}
}

// --- FRIENDS API ---
func handleFriends(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		User   string `json:"user"`
		Friend string `json:"friend"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	friendsMu.Lock()
	defer friendsMu.Unlock()

	// Add friend to user's list (prevent duplicates)
	isDuplicate := false
	for _, f := range friendsStore[req.User] {
		if f == req.Friend {
			isDuplicate = true
			break
		}
	}

	if !isDuplicate && req.User != req.Friend {
		friendsStore[req.User] = append(friendsStore[req.User], req.Friend)
		fmt.Printf("🤝 %s added %s as a friend.\n", req.User, req.Friend)
	}

	// Return the updated list
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string][]string{"friends": friendsStore[req.User]})
}

// --- AUTHENTICATION & REGISTER (From previous steps) ---
var otpStore = make(map[string]string)
var otpMutex sync.RWMutex
type AuthRequest struct { Email string `json:"email"`; Code string `json:"code"`; Password string `json:"password"` }
func handleRequestOTP(w http.ResponseWriter, r *http.Request) { /* ... keep your existing code ... */ }
func handleVerifyOTP(w http.ResponseWriter, r *http.Request) { /* ... keep your existing code ... */ }

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Username string `json:"username"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	fmt.Printf("👤 New Account Created: %s (%s)\n", req.Username, req.Email)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Account created"})
}

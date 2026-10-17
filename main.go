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
type Message struct { Author string `json:"author"`; Text string `json:"text"`; Color string `json:"color"`; Type string `json:"type"` }

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

// --- AUTHENTICATION ---
var otpStore = make(map[string]string)
var otpMutex sync.RWMutex

type AuthRequest struct {
	Email    string `json:"email"`
	Code     string `json:"code"`
	Password string `json:"password"`
}

func handleRequestOTP(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	// Generate a fake code (In real life, use Brevo here)
	fakeCode := "123456"
	
	otpMutex.Lock()
	otpStore[req.Email] = fakeCode
	otpMutex.Unlock()
	
	fmt.Printf("✉️ [MOCK EMAIL] Sent code %s to %s\n", fakeCode, req.Email)
	
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent"})
}

func handleVerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	otpMutex.RLock()
	savedCode := otpStore[req.Email]
	otpMutex.RUnlock()
	
	if savedCode == req.Code && savedCode != "" {
		// Delete the OTP after success
		otpMutex.Lock(); delete(otpStore, req.Email); otpMutex.Unlock()
		
		fmt.Printf("✅ User %s successfully registered with password.\n", req.Email)
		
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"token": "fake-jwt-token"})
	} else {
		http.Error(w, "Invalid code", http.StatusUnauthorized)
	}
}

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB
var dbMu sync.Mutex

// --- Database Setup ---
func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./chathub.db")
	if err != nil {
		log.Fatal(err)
	}

	// Create Users Table
	createUsersTable := `CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE,
		email TEXT UNIQUE,
		password TEXT,
		color TEXT DEFAULT '#5865F2'
	);`
	
	// Create Friends Table
	createFriendsTable := `CREATE TABLE IF NOT EXISTS friends (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user1 TEXT,
		user2 TEXT,
		UNIQUE(user1, user2)
	);`

	// Create Messages Table (Handles both DMs and Server Channels)
	createMessagesTable := `CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		sender TEXT,
		receiver TEXT,
		content TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	// Create Servers Table
	createServersTable := `CREATE TABLE IF NOT EXISTS servers (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT,
		owner TEXT
	);`
	
	// Create Channels Table
	createChannelsTable := `CREATE TABLE IF NOT EXISTS channels (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		server_id INTEGER,
		name TEXT,
		type TEXT DEFAULT 'text'
	);`

	db.Exec(createUsersTable)
	db.Exec(createFriendsTable)
	db.Exec(createMessagesTable)
	db.Exec(createServersTable)
	db.Exec(createChannelsTable)
	fmt.Println("💾 Database connected and tables created.")
}

func main() {
	initDB()
	defer db.Close()

	// Serve Frontend
	fs := http.FileServer(http.Dir("./"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})

	// API Routes
	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/friends", handleFriends)
	http.HandleFunc("/api/messages/send", handleSendMessage)
	http.HandleFunc("/api/messages/get", handleGetMessages)
	http.HandleFunc("/api/profile/update", handleUpdateProfile)
	
	// Server Routes
	http.HandleFunc("/api/servers/create", handleCreateServer)
	http.HandleFunc("/api/servers/get", handleGetServers)
	http.HandleFunc("/api/channels/get", handleGetChannels)
	http.HandleFunc("/api/server-messages/send", handleSendServerMessage)
	http.HandleFunc("/api/server-messages/get", handleGetServerMessages)
	
	// WebSocket
	http.HandleFunc("/ws", handleConnections)

	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	log.Fatal(http.ListenAndServe(port, nil))
}

// --- WebSocket Hub ---
var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
type Client struct { conn *websocket.Conn; username string }
var (clients = make(map[*Client]bool); clientsMu sync.Mutex)

func handleConnections(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("user")
	if username == "" { return }

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }
	defer ws.Close()

	client := &Client{conn: ws, username: username}
	clientsMu.Lock(); clients[client] = true; clientsMu.Unlock()

	defer func() {
		clientsMu.Lock(); delete(clients, client); clientsMu.Unlock()
	}()

	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			clientsMu.Lock(); delete(clients, client); clientsMu.Unlock()
			break
		}
	}
}

// --- Register & Login ---
func handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Username string `json:"username"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbMu.Lock()
	_, err := db.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", req.Username, req.Email, req.Password)
	dbMu.Unlock()

	if err != nil {
		http.Error(w, "Username or email already exists", http.StatusConflict)
		return
	}

	fmt.Printf("👤 New Account Created: %s\n", req.Username)
	w.WriteHeader(http.StatusOK)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var username string
	err := db.QueryRow("SELECT username FROM users WHERE (username = ? OR email = ?) AND password = ?", req.Identifier, req.Identifier, req.Password).Scan(&username)

	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"username": username})
}

// --- Profile API ---
func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldUsername string `json:"old_username"`
		NewUsername string `json:"new_username"`
		NewColor    string `json:"new_color"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbMu.Lock()
	_, err := db.Exec("UPDATE users SET username = ?, color = ? WHERE username = ?", req.NewUsername, req.NewColor, req.OldUsername)
	dbMu.Unlock()

	if err != nil {
		http.Error(w, "Username already taken or database error", http.StatusConflict)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated"})
}

// --- Friends API ---
func handleFriends(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		user := r.URL.Query().Get("user")
		rows, err := db.Query("SELECT user2 FROM friends WHERE user1 = ?", user)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var friends []string
		for rows.Next() {
			var f string
			rows.Scan(&f)
			friends = append(friends, f)
		}
		if friends == nil { friends = []string{} }
		
		json.NewEncoder(w).Encode(map[string][]string{"friends": friends})
		return
	}

	if r.Method == http.MethodPost {
		var req struct {
			User   string `json:"user"`
			Friend string `json:"friend"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		if req.User == req.Friend {
			http.Error(w, "Cannot add yourself", http.StatusBadRequest)
			return
		}

		var exists int
		db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", req.Friend).Scan(&exists)
		if exists == 0 {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		dbMu.Lock()
		_, err := db.Exec("INSERT OR IGNORE INTO friends (user1, user2) VALUES (?, ?)", req.User, req.Friend)
		dbMu.Unlock()

		if err != nil {
			http.Error(w, "Error adding friend", http.StatusInternalServerError)
			return
		}
		
		w.WriteHeader(http.StatusOK)
	}
}

// --- DM Messages API ---
func handleSendMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Sender   string `json:"sender"`
		Receiver string `json:"receiver"`
		Content  string `json:"content"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbMu.Lock()
	_, err := db.Exec("INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)", req.Sender, req.Receiver, req.Content)
	dbMu.Unlock()

	if err != nil {
		http.Error(w, "Error saving message", http.StatusInternalServerError)
		return
	}

	clientsMu.Lock()
	for c := range clients {
		if c.username == req.Receiver || c.username == req.Sender {
			c.conn.WriteJSON(map[string]string{
				"type":     "new_message",
				"sender":   req.Sender,
				"receiver": req.Receiver,
				"content":  req.Content,
			})
		}
	}
	clientsMu.Unlock()

	w.WriteHeader(http.StatusOK)
}

func handleGetMessages(w http.ResponseWriter, r *http.Request) {
	user1 := r.URL.Query().Get("user1")
	user2 := r.URL.Query().Get("user2")

	rows, err := db.Query(`
		SELECT sender, content FROM messages 
		WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
		ORDER BY timestamp ASC`, user1, user2, user2, user1)
	
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]string
	for rows.Next() {
		var sender, content string
		rows.Scan(&sender, &content)
		messages = append(messages, map[string]string{"sender": sender, "content": content})
	}
	
	if messages == nil { messages = []map[string]string{} }
	json.NewEncoder(w).Encode(messages)
}

// --- Servers & Channels API ---
func handleCreateServer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Owner string `json:"owner"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbMu.Lock()
	res, err := db.Exec("INSERT INTO servers (name, owner) VALUES (?, ?)", req.Name, req.Owner)
	if err != nil {
		dbMu.Unlock()
		http.Error(w, "Error creating server", http.StatusInternalServerError)
		return
	}
	serverID, _ := res.LastInsertId()
	db.Exec("INSERT INTO channels (server_id, name) VALUES (?, ?)", serverID, "general")
	dbMu.Unlock()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{"server_id": serverID})
}

func handleGetServers(w http.ResponseWriter, r *http.Request) {
	owner := r.URL.Query().Get("owner")
	rows, _ := db.Query("SELECT id, name FROM servers WHERE owner = ?", owner)
	defer rows.Close()

	var servers []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)
		servers = append(servers, map[string]interface{}{"id": id, "name": name})
	}
	if servers == nil { servers = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(servers)
}

func handleGetChannels(w http.ResponseWriter, r *http.Request) {
	serverID := r.URL.Query().Get("server_id")
	rows, _ := db.Query("SELECT id, name FROM channels WHERE server_id = ?", serverID)
	defer rows.Close()

	var channels []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		rows.Scan(&id, &name)
		channels = append(channels, map[string]interface{}{"id": id, "name": name})
	}
	if channels == nil { channels = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(channels)
}

// --- Server Channel Messages API ---
func handleSendServerMessage(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChannelID int    `json:"channel_id"`
		Sender    string `json:"sender"`
		Content   string `json:"content"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	dbMu.Lock()
	_, err := db.Exec("INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)", req.Sender, fmt.Sprintf("channel_%d", req.ChannelID), req.Content)
	dbMu.Unlock()

	if err != nil {
		http.Error(w, "Error saving message", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func handleGetServerMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	receiver := fmt.Sprintf("channel_%s", channelID)

	rows, err := db.Query("SELECT sender, content FROM messages WHERE receiver = ? ORDER BY timestamp ASC", receiver)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []map[string]string
	for rows.Next() {
		var sender, content string
		rows.Scan(&sender, &content)
		messages = append(messages, map[string]string{"sender": sender, "content": content})
	}
	
	if messages == nil { messages = []map[string]string{} }
	json.NewEncoder(w).Encode(messages)
}

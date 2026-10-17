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

	createUsersTable := `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT, color TEXT DEFAULT '#5865F2');`
	createFriendsTable := `CREATE TABLE IF NOT EXISTS friends (id INTEGER PRIMARY KEY AUTOINCREMENT, user1 TEXT, user2 TEXT, UNIQUE(user1, user2));`
	createMessagesTable := `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT, receiver TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);`
	createServersTable := `CREATE TABLE IF NOT EXISTS servers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, owner TEXT);`
	createChannelsTable := `CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER, name TEXT, type TEXT DEFAULT 'text');`
	createServerMembersTable := `CREATE TABLE IF NOT EXISTS server_members (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER, username TEXT, UNIQUE(server_id, username));`

	db.Exec(createUsersTable)
	db.Exec(createFriendsTable)
	db.Exec(createMessagesTable)
	db.Exec(createServersTable)
	db.Exec(createChannelsTable)
	db.Exec(createServerMembersTable)
	fmt.Println("💾 Database connected and tables created.")
}

func main() {
	initDB()
	defer db.Close()

	fs := http.FileServer(http.Dir("./"))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./index.html")
			return
		}
		fs.ServeHTTP(w, r)
	})

	// APIs
	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/login", handleLogin)
	http.HandleFunc("/api/friends", handleFriends)
	http.HandleFunc("/api/messages/send", handleSendMessage)
	http.HandleFunc("/api/messages/get", handleGetMessages)
	http.HandleFunc("/api/messages/recent", handleGetRecentDMs)
	http.HandleFunc("/api/messages/edit", handleEditMessage)
	http.HandleFunc("/api/messages/delete", handleDeleteMessage)
	http.HandleFunc("/api/profile/update", handleUpdateProfile)
	
	// Server APIs
	http.HandleFunc("/api/servers/create", handleCreateServer)
	http.HandleFunc("/api/servers/get", handleGetServers)
	http.HandleFunc("/api/servers/public", handleGetPublicServers)
	http.HandleFunc("/api/servers/join", handleJoinServer)
	http.HandleFunc("/api/channels/create", handleCreateChannel)
	http.HandleFunc("/api/channels/get", handleGetChannels)
	http.HandleFunc("/api/server-messages/send", handleSendServerMessage)
	http.HandleFunc("/api/server-messages/get", handleGetServerMessages)
	
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
		var msg map[string]interface{}
		err := ws.ReadJSON(&msg)
		if err != nil {
			clientsMu.Lock(); delete(clients, client); clientsMu.Unlock()
			break
		}

		// Handle Typing Indicators
		if msg["type"] == "typing" || msg["type"] == "stop_typing" {
			target, ok := msg["target"].(string)
			if !ok { continue }
			clientsMu.Lock()
			for c := range clients {
				if c.username == target || c.username == username {
					c.conn.WriteJSON(msg)
				}
			}
			clientsMu.Unlock()
		}

		// Handle WebRTC Signaling
		if msg["type"] == "webrtc_signal" {
			target, ok := msg["target"].(string)
			if !ok { continue }
			
			clientsMu.Lock()
			for c := range clients {
				if c.username == target {
					c.conn.WriteJSON(map[string]interface{}{
						"type": "webrtc_signal", "sender": username, "signal": msg["signal"],
					})
				}
			}
			clientsMu.Unlock()
		}
	}
}

// --- Auth & Profile ---
func handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct { Email, Password, Username string }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock()
	_, err := db.Exec("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", req.Username, req.Email, req.Password)
	dbMu.Unlock()
	if err != nil { http.Error(w, "Username taken", http.StatusConflict); return }
	w.WriteHeader(http.StatusOK)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct { Identifier, Password string }
	json.NewDecoder(r.Body).Decode(&req)
	var username string
	err := db.QueryRow("SELECT username FROM users WHERE (username = ? OR email = ?) AND password = ?", req.Identifier, req.Identifier, req.Password).Scan(&username)
	if err != nil { http.Error(w, "Invalid credentials", http.StatusUnauthorized); return }
	json.NewEncoder(w).Encode(map[string]string{"username": username})
}

func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct { OldUsername, NewUsername, NewColor string }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock()
	_, err := db.Exec("UPDATE users SET username = ?, color = ? WHERE username = ?", req.NewUsername, req.NewColor, req.OldUsername)
	dbMu.Unlock()
	if err != nil { http.Error(w, "Username taken", http.StatusConflict); return }
	json.NewEncoder(w).Encode(map[string]string{"message": "Profile updated"})
}

// --- Friends ---
func handleFriends(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		user := r.URL.Query().Get("user")
		rows, _ := db.Query("SELECT user2 FROM friends WHERE user1 = ?", user)
		defer rows.Close()
		var friends []string
		for rows.Next() { var f string; rows.Scan(&f); friends = append(friends, f) }
		if friends == nil { friends = []string{} }
		json.NewEncoder(w).Encode(map[string][]string{"friends": friends})
		return
	}
	if r.Method == http.MethodPost {
		var req struct { User, Friend string }
		json.NewDecoder(r.Body).Decode(&req)
		var exists int
		db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", req.Friend).Scan(&exists)
		if exists == 0 { http.Error(w, "User not found", http.StatusNotFound); return }
		dbMu.Lock()
		db.Exec("INSERT OR IGNORE INTO friends (user1, user2) VALUES (?, ?)", req.User, req.Friend)
		dbMu.Unlock()
		w.WriteHeader(http.StatusOK)
	}
}

// --- DM Messages ---
func handleSendMessage(w http.ResponseWriter, r *http.Request) {
	var req struct { Sender, Receiver, Content string }
	json.NewDecoder(r.Body).Decode(&req)
	
	dbMu.Lock()
	res, err := db.Exec("INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)", req.Sender, req.Receiver, req.Content)
	dbMu.Unlock()
	
	if err != nil { http.Error(w, "Error saving", http.StatusInternalServerError); return }
	msgID, _ := res.LastInsertId()

	clientsMu.Lock()
	for c := range clients {
		if c.username == req.Receiver || c.username == req.Sender {
			c.conn.WriteJSON(map[string]interface{}{
				"type": "new_message", "id": msgID, "sender": req.Sender, "receiver": req.Receiver, "content": req.Content,
			})
		}
	}
	clientsMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleGetMessages(w http.ResponseWriter, r *http.Request) {
	user1, user2 := r.URL.Query().Get("user1"), r.URL.Query().Get("user2")
	rows, _ := db.Query(`SELECT id, sender, content FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp ASC`, user1, user2, user2, user1)
	defer rows.Close()
	var messages []map[string]interface{}
	for rows.Next() { 
		var id int
		var s, c string
		rows.Scan(&id, &s, &c)
		messages = append(messages, map[string]interface{}{"id": id, "sender": s, "content": c}) 
	}
	if messages == nil { messages = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(messages)
}

func handleGetRecentDMs(w http.ResponseWriter, r *http.Request) {
	user := r.URL.Query().Get("user")
	query := `SELECT DISTINCT CASE WHEN sender = ? THEN receiver ELSE sender END as contact FROM messages WHERE (sender = ? AND receiver NOT LIKE 'channel_%') OR (receiver = ? AND sender NOT LIKE 'channel_%')`
	rows, _ := db.Query(query, user, user, user)
	defer rows.Close()
	var contacts []string
	for rows.Next() { var c string; rows.Scan(&c); contacts = append(contacts, c) }
	if contacts == nil { contacts = []string{} }
	json.NewEncoder(w).Encode(contacts)
}

func handleEditMessage(w http.ResponseWriter, r *http.Request) {
	var req struct { ID int; Content string }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock(); db.Exec("UPDATE messages SET content = ? WHERE id = ?", req.Content, req.ID); dbMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	var req struct { ID int }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock(); db.Exec("DELETE FROM messages WHERE id = ?", req.ID); dbMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

// --- Servers & Channels ---
func handleCreateServer(w http.ResponseWriter, r *http.Request) {
	var req struct { Name, Owner string }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock()
	res, _ := db.Exec("INSERT INTO servers (name, owner) VALUES (?, ?)", req.Name, req.Owner)
	serverID, _ := res.LastInsertId()
	db.Exec("INSERT INTO channels (server_id, name) VALUES (?, ?)", serverID, "general")
	db.Exec("INSERT INTO server_members (server_id, username) VALUES (?, ?)", serverID, req.Owner)
	dbMu.Unlock()
	json.NewEncoder(w).Encode(map[string]interface{}{"server_id": serverID})
}

func handleGetServers(w http.ResponseWriter, r *http.Request) {
	user := r.URL.Query().Get("user")
	rows, _ := db.Query("SELECT s.id, s.name FROM servers s JOIN server_members m ON s.id = m.server_id WHERE m.username = ?", user)
	defer rows.Close()
	var servers []map[string]interface{}
	for rows.Next() { var id int; var name string; rows.Scan(&id, &name); servers = append(servers, map[string]interface{}{"id": id, "name": name}) }
	if servers == nil { servers = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(servers)
}

func handleGetPublicServers(w http.ResponseWriter, r *http.Request) {
	rows, _ := db.Query("SELECT id, name FROM servers")
	defer rows.Close()
	var servers []map[string]interface{}
	for rows.Next() { var id int; var name string; rows.Scan(&id, &name); servers = append(servers, map[string]interface{}{"id": id, "name": name}) }
	if servers == nil { servers = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(servers)
}

func handleJoinServer(w http.ResponseWriter, r *http.Request) {
	var req struct { ServerID int; User string }
	json.NewDecoder(r.Body).Decode(&req)
	var exists int
	db.QueryRow("SELECT COUNT(*) FROM servers WHERE id = ?", req.ServerID).Scan(&exists)
	if exists == 0 { http.Error(w, "Server not found", http.StatusNotFound); return }
	dbMu.Lock(); db.Exec("INSERT OR IGNORE INTO server_members (server_id, username) VALUES (?, ?)", req.ServerID, req.User); dbMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	var req struct { ServerID int; Name string }
	json.NewDecoder(r.Body).Decode(&req)
	dbMu.Lock(); db.Exec("INSERT INTO channels (server_id, name) VALUES (?, ?)", req.ServerID, req.Name); dbMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleGetChannels(w http.ResponseWriter, r *http.Request) {
	serverID := r.URL.Query().Get("server_id")
	rows, _ := db.Query("SELECT id, name FROM channels WHERE server_id = ?", serverID)
	defer rows.Close()
	var channels []map[string]interface{}
	for rows.Next() { var id int; var name string; rows.Scan(&id, &name); channels = append(channels, map[string]interface{}{"id": id, "name": name}) }
	if channels == nil { channels = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(channels)
}

func handleSendServerMessage(w http.ResponseWriter, r *http.Request) {
	var req struct { ChannelID int; Sender, Content string }
	json.NewDecoder(r.Body).Decode(&req)
	receiver := fmt.Sprintf("channel_%d", req.ChannelID)

	dbMu.Lock()
	res, err := db.Exec("INSERT INTO messages (sender, receiver, content) VALUES (?, ?, ?)", req.Sender, receiver, req.Content)
	dbMu.Unlock()

	if err != nil { http.Error(w, "Error saving message", http.StatusInternalServerError); return }
	msgID, _ := res.LastInsertId()

	clientsMu.Lock()
	for c := range clients {
		c.conn.WriteJSON(map[string]interface{}{
			"type": "server_message", "id": msgID, "channel_id": req.ChannelID, "sender": req.Sender, "content": req.Content,
		})
	}
	clientsMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func handleGetServerMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.URL.Query().Get("channel_id")
	receiver := fmt.Sprintf("channel_%s", channelID)
	rows, _ := db.Query("SELECT id, sender, content FROM messages WHERE receiver = ? ORDER BY timestamp ASC", receiver)
	defer rows.Close()
	var messages []map[string]interface{}
	for rows.Next() { var id int; var s, c string; rows.Scan(&id, &s, &c); messages = append(messages, map[string]interface{}{"id": id, "sender": s, "content": c}) }
	if messages == nil { messages = []map[string]interface{}{} }
	json.NewEncoder(w).Encode(messages)
}

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

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
		password TEXT
	);`
	
	// Create Friends Table
	createFriendsTable := `CREATE TABLE IF NOT EXISTS friends (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user1 TEXT,
		user2 TEXT,
		UNIQUE(user1, user2)
	);`

	db.Exec(createUsersTable)
	db.Exec(createFriendsTable)
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

	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	log.Fatal(http.ListenAndServe(port, nil))
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

// --- Friends ---
func handleFriends(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		// Get friends for a user
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

		// Check if friend exists in users table
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
		
		fmt.Printf("🤝 %s added %s as a friend.\n", req.User, req.Friend)
		w.WriteHeader(http.StatusOK)
	}
}

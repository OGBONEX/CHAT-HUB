package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
)

// Global variables for our lightweight app
var (
	// In-memory store for OTP codes (In production, use SQLite)
	otpStore = make(map[string]string)
	otpMutex sync.RWMutex
)

type OTPRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func main() {
	// 1. Serve the static frontend files (HTML, CSS, JS)
	fs := http.FileServer(http.Dir("./"))
	http.Handle("/", fs)

	// 2. API Endpoints
	http.HandleFunc("/api/request-otp", handleRequestOTP)
	http.HandleFunc("/api/verify-otp", handleVerifyOTP)

	// 3. Start the server
	port := ":8080"
	fmt.Printf("🚀 Chat Hub backend started at http://localhost%s\n", port)
	
	// Note: In Codespaces, you will need to open port 8080 in the "Ports" tab
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}

// handleRequestOTP simulates sending an email (Replace with Brevo later)
func handleRequestOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// Generate a fake code for now (e.g., "123456")
	fakeCode := "123456"

	// Save it in memory
	otpMutex.Lock()
	otpStore[req.Email] = fakeCode
	otpMutex.Unlock()

	fmt.Printf("✉️ [MOCK EMAIL] Sent code %s to %s\n", fakeCode, req.Email)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "OTP sent successfully"})
}

// handleVerifyOTP checks if the code matches
func handleVerifyOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	otpMutex.RLock()
	savedCode, exists := otpStore[req.Email]
	otpMutex.RUnlock()

	if !exists || savedCode != req.Code {
		http.Error(w, "Invalid or expired code", http.StatusUnauthorized)
		return
	}

	// Code is correct!
	delete(otpStore, req.Email) // Clean up
	
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Login successful", "token": "fake-jwt-token"})
}

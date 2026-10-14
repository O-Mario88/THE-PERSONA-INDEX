package main

import (
	"fmt"
	"log"
	"net/http"
	"time"
)

func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"status":"ok"}`)
}

// aggregationInterval is how often the in-process worker publishes results.
// It moves to a separate worker process once votes go through a queue.
const aggregationInterval = time.Second

func main() {
	bank, err := loadContentBank(questionsJSON)
	if err != nil {
		log.Fatal(err)
	}
	srv := NewServer(time.Now, bank)
	go func() {
		for range time.Tick(aggregationInterval) {
			if err := srv.RunAggregation(); err != nil {
				log.Printf("aggregation: %v", err)
			}
		}
	}()
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", srv.Routes()))
}

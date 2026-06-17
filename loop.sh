#!/bin/bash

while true; do 
  curl -s -w "\nStatus: %{http_code} | Latency: %{time_total}s" http://$GATEWAY_URL/items
  sleep 0.1  # Adds a 100ms pause to protect your local CPU
done
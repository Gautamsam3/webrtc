#!/bin/bash

# Run both servers in development mode
# This script starts both the main server and the PeerJS server in separate terminals

# Check if we have the required dependencies
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js first."
    exit 1
fi

# Check if SSL certificates exist
if [ ! -f "ssl/key.pem" ] || [ ! -f "ssl/cert.pem" ]; then
    echo "SSL certificates not found. Generating them now..."
    ./generate-ssl.sh
fi

# Make sure the script is executable
chmod +x generate-ssl.sh

# Start the PeerJS server in a new terminal
echo "Starting PeerJS server..."
osascript -e 'tell app "Terminal" to do script "cd \"'$PWD'\" && node peerServer.js"'

# Wait a moment for the PeerJS server to start
sleep 2

# Start the main server in this terminal
echo "Starting main server..."
npm run dev

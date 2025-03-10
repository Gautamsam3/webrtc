#!/bin/bash

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install it first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file for local development..."
    cat > .env << EOL
PORT=3000
PEER_PORT=3002
NODE_ENV=development
HOST=localhost
EOL
    echo ".env file created."
else
    echo ".env file already exists."
fi

# Generate SSL certificates if they don't exist
if [ ! -f ./ssl/key.pem ] || [ ! -f ./ssl/cert.pem ]; then
    echo "Generating SSL certificates..."
    ./generate-ssl.sh
else
    echo "SSL certificates already exist."
fi

echo "Setup complete! You can now run the application with:"
echo "npm run dev"

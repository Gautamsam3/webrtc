#!/bin/bash

# Create SSL directory if it doesn't exist
mkdir -p ssl

# Generate self-signed SSL certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ./ssl/key.pem -out ./ssl/cert.pem -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo "SSL certificates generated successfully in the ssl/ directory"
echo "You can now run 'npm run dev' to start the development server"

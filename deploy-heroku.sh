#!/bin/bash

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "Heroku CLI is not installed. Please install it first."
    echo "Visit: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if user is logged in to Heroku
heroku whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "You are not logged in to Heroku. Please login first."
    heroku login
fi

# Function to create or use existing Heroku app
create_or_use_app() {
    local app_name=$1
    local app_type=$2

    if [ -z "$app_name" ]; then
        # Create a new Heroku app
        echo "Creating a new Heroku app for $app_type..."
        heroku create
        app_name=$(heroku apps:info | grep "=== " | cut -d' ' -f2)
    else
        # Check if app exists
        heroku apps:info --app $app_name &> /dev/null
        if [ $? -ne 0 ]; then
            echo "App '$app_name' does not exist. Creating it..."
            heroku create $app_name
        fi
    fi

    echo "$app_type app: $app_name"
    return 0
}

# Setup main app
echo "=== Setting up main application server ==="
read -p "Enter your main Heroku app name (leave blank to create a new app): " MAIN_APP_NAME
create_or_use_app "$MAIN_APP_NAME" "Main"
MAIN_APP_NAME=$(heroku apps:info | grep "=== " | cut -d' ' -f2)

# Setup PeerJS app
echo ""
echo "=== Setting up PeerJS server ==="
read -p "Enter your PeerJS Heroku app name (leave blank to create a new app): " PEER_APP_NAME
create_or_use_app "$PEER_APP_NAME" "PeerJS"
PEER_APP_NAME=$(heroku apps:info | grep "=== " | cut -d' ' -f2)

# Set environment variables for main app
echo ""
echo "Setting environment variables for main app..."
heroku config:set NODE_ENV=production --app $MAIN_APP_NAME
read -p "Enter your domain name for main app (e.g., your-app.herokuapp.com): " MAIN_DOMAIN_NAME
if [ -z "$MAIN_DOMAIN_NAME" ]; then
    MAIN_DOMAIN_NAME="$MAIN_APP_NAME.herokuapp.com"
fi
heroku config:set HOST=$MAIN_DOMAIN_NAME --app $MAIN_APP_NAME
heroku config:set PEER_HOST=$PEER_APP_NAME.herokuapp.com --app $MAIN_APP_NAME

# Set environment variables for PeerJS app
echo ""
echo "Setting environment variables for PeerJS app..."
heroku config:set NODE_ENV=production --app $PEER_APP_NAME
heroku config:set HOST=$PEER_APP_NAME.herokuapp.com --app $PEER_APP_NAME

# Create a temporary branch for PeerJS deployment
echo ""
echo "Creating a temporary branch for PeerJS deployment..."
git checkout -b deploy-peerjs-temp

# Create a special Procfile for PeerJS
echo "web: node peerServer.js" > Procfile

# Deploy PeerJS to Heroku
echo "Deploying PeerJS server to Heroku..."
git add Procfile
git commit -m "Temporary commit for PeerJS deployment"
heroku git:remote -a $PEER_APP_NAME
git push heroku deploy-peerjs-temp:main -f

# Switch back to main branch
git checkout main
git branch -D deploy-peerjs-temp

# Reset Procfile for main app
echo "web: node server.js" > Procfile
git add Procfile
git commit -m "Reset Procfile for main app"

# Deploy main app to Heroku
echo ""
echo "Deploying main application to Heroku..."
heroku git:remote -a $MAIN_APP_NAME
git push heroku main -f

echo ""
echo "Deployment completed!"
echo "Your main app is now available at: https://$MAIN_DOMAIN_NAME"
echo "Your PeerJS server is running at: https://$PEER_APP_NAME.herokuapp.com"

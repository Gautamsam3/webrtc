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

# Ask for app name
read -p "Enter your Heroku app name (leave blank to create a new app): " APP_NAME

if [ -z "$APP_NAME" ]; then
    # Create a new Heroku app
    echo "Creating a new Heroku app..."
    heroku create
    APP_NAME=$(heroku apps:info | grep "=== " | cut -d' ' -f2)
else
    # Check if app exists
    heroku apps:info --app $APP_NAME &> /dev/null
    if [ $? -ne 0 ]; then
        echo "App '$APP_NAME' does not exist. Creating it..."
        heroku create $APP_NAME
    fi
fi

# Set environment variables
echo "Setting environment variables..."
heroku config:set NODE_ENV=production --app $APP_NAME
read -p "Enter your domain name (e.g., your-app.herokuapp.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="$APP_NAME.herokuapp.com"
fi
heroku config:set HOST=$DOMAIN_NAME --app $APP_NAME

# Deploy to Heroku
echo "Deploying to Heroku..."
git push heroku main || git push heroku master

echo "Deployment completed!"
echo "Your app is now available at: https://$DOMAIN_NAME"

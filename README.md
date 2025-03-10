# RexMeet

A real-time video chat application built with WebRTC, Socket.io, and Express.

## Deployment Guide

### Environment Variables

Configure these environment variables for deployment:

```
PORT=3000                   # The port your app will run on
PEER_PORT=443               # Port for PeerJS server (use 443 for production)
NODE_ENV=production         # Set to 'production' for deployment
HOST=your-domain.com        # Your application's domain name
```

### Deployment Steps

#### Option 1: Heroku Deployment (Automated)

Use our automated deployment script:

```
npm run deploy-heroku
```

This script will:
1. Check if Heroku CLI is installed
2. Create a new Heroku app or use an existing one
3. Set up the required environment variables
4. Deploy your application

#### Option 2: Render Deployment

1. Create a Render account at https://render.com
2. Connect your GitHub repository
3. Create a new Web Service
4. Use the included `render.yaml` configuration file:
   - In the Render dashboard, go to "Blueprints"
   - Click "New Blueprint Instance"
   - Connect to your repository
   - Render will automatically configure the service based on the YAML file

#### Option 3: Manual Deployment

1. Push your code to a Git repository
2. Deploy to your preferred platform (Heroku, Render, Netlify, etc.)
3. Set the environment variables
4. Ensure your platform supports WebSockets for Socket.io

## Local Development

### Quick Setup

Use our automated setup script to quickly set up your local development environment:

```
npm run setup
```

This script will:
1. Install dependencies
2. Create a `.env` file if it doesn't exist
3. Generate SSL certificates if they don't exist

### Manual Setup

1. Install dependencies: `npm install`
2. Generate SSL certificates for local HTTPS: `npm run generate-ssl`
3. Create a `.env` file with your configuration (see example below)
4. Run the development server: `npm run dev`
5. Access at `https://localhost:3000`

### Example .env file for local development

```
PORT=3000
PEER_PORT=3002
NODE_ENV=development
HOST=localhost

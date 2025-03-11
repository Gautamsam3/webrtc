# RexMeet

A real-time video chat application built with WebRTC, Socket.io, and Express.

## Architecture

RexMeet now uses a separated architecture with two main components:

1. **Main Application Server** (`server.js`):
   - Handles HTTP/HTTPS requests
   - Manages Socket.io connections for real-time messaging
   - Serves the web application

2. **Dedicated PeerJS Server** (`peerServer.js`):
   - Manages WebRTC signaling
   - Handles peer connections
   - Runs independently from the main server

This separation provides better scalability and cleaner code organization.

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

#### Option 2: Render Deployment (Recommended)

The project now includes a multi-service configuration in `render.yaml` that automatically sets up both servers:

1. Create a Render account at https://render.com
2. Connect your GitHub repository
3. Use the Blueprint feature with the included `render.yaml` configuration:
   - In the Render dashboard, go to "Blueprints"
   - Click "New Blueprint Instance"
   - Connect to your repository
   - Render will automatically configure both services:
     - Main application server (rexmeet)
     - PeerJS server (rexmeet-peerjs)

This setup ensures both servers are deployed and configured correctly to work together.

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

### Running the Application

#### Option 1: Run Both Servers Together (Recommended)

We've added a new script to run both the main server and the PeerJS server together:

```
npm run dev-all
```

This will:
1. Start the PeerJS server in a separate terminal
2. Start the main application server with nodemon for auto-reloading
3. Ensure both servers use the correct SSL certificates

#### Option 2: Run Servers Separately

If you prefer to run the servers in separate terminals:

1. Start the PeerJS server:
   ```
   npm run peer
   ```

2. In another terminal, start the main server:
   ```
   npm run dev
   ```

### Manual Setup

1. Install dependencies: `npm install`
2. Generate SSL certificates for local HTTPS: `npm run generate-ssl`
3. Create a `.env` file with your configuration (see example below)
4. Run both servers using one of the options above
5. Access at `https://localhost:3000`

### Example .env file for local development

```
PORT=3000
PEER_PORT=3002
NODE_ENV=development
HOST=localhost

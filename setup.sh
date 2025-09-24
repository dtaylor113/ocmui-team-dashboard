#!/bin/bash

# OCMUI Team Dashboard Setup Script
echo "🎯 Setting up OCMUI Team Dashboard..."

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
if [[ "$NODE_VERSION" == "not found" ]]; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if Yarn is installed
YARN_VERSION=$(yarn --version 2>/dev/null || echo "not found")
if [[ "$YARN_VERSION" == "not found" ]]; then
    echo "❌ Yarn not found. Please install Yarn first:"
    echo "   npm install -g yarn"
    exit 1
fi

echo "✅ Yarn version: $YARN_VERSION"

# Install dependencies
echo "📦 Installing dependencies..."
yarn install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully!"
else
    echo "❌ Failed to install dependencies. Please check the error messages above."
    exit 1
fi

# Check if ports are available
if lsof -Pi :3017 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3017 is already in use. The application will attempt to free it during start."
fi

echo ""
echo "🚀 Starting the application (build + serve)..."

# Start the app detached so this script can continue and print instructions
LOG_FILE="server.log"
nohup yarn start > "$LOG_FILE" 2>&1 &

# Wait for the server to be ready (up to 30s)
MAX_WAIT=30
for i in $(seq 1 $MAX_WAIT); do
    if curl -sSf http://localhost:3017 >/dev/null 2>&1; then
        echo ""
        echo "✅ Server is running at http://localhost:3017"
        echo ""
        echo "📝 Usage:"
        echo "   - Your browser should open automatically. If not, visit: http://localhost:3017"
        echo "   - Click Settings ⚙️ (top-right) and add tokens:"
        echo "       • GitHub personal access token"
        echo "       • Red Hat JIRA token and email"
        echo ""
        echo "💡 Development mode: yarn start:dev (Express API + Vite HMR)"
        echo "   API: http://localhost:3017, React: http://localhost:5174"
        echo ""
        echo "📄 Logs are being written to $LOG_FILE"
        echo "🛑 To stop the server: lsof -ti:3017 | xargs kill -9"
        echo ""
        echo "✨ Happy coding!"
        exit 0
    fi
    sleep 1
done

echo ""
echo "⏳ The server is starting. If your browser didn't open, visit http://localhost:3017 shortly."
echo "📄 Logs: $LOG_FILE"
echo "🛠  If needed, you can start manually with: yarn start"
echo ""
echo "✨ Happy coding!"

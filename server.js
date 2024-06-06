const WebSocket = require("ws");
const { spawn } = require("child_process");

let minecraftServer = null; // Variable to store the Minecraft server process
const args = process.argv.slice(2);
const host = args[0] || "0.0.0.0"; // Utiliser '0.0.0.0' par défaut si aucun hôte n'est spécifié
// Function to start the Minecraft server
function startMinecraftServer() {
  if (minecraftServer) {
    console.log("Server is already running.");
    return;
  }

  minecraftServer = spawn("java", [
    "-Xmx1024M",
    "-Xms1024M",
    "-jar",
    "server.jar",
    "nogui",
  ]);

  minecraftServer.stdout.on("data", (data) => {
    broadcastToClients(data.toString());
  });

  minecraftServer.stderr.on("data", (data) => {
    broadcastToClients(data.toString());
  });

  minecraftServer.on("close", (code, signal) => {
    console.log(
      `Minecraft server closed with code ${code} and signal ${signal}.`
    );
    minecraftServer = null; // Reset the variable when the server closes
  });

  minecraftServer.on("error", (error) => {
    console.error(`Failed to start Minecraft server: ${error.message}`);
  });
}

// Function to send a command to the Minecraft server
function sendCommandToMinecraftServer(command) {
  if (minecraftServer) {
    minecraftServer.stdin.write(command + "\n");
  } else {
    console.log("Cannot send command, server is not running.");
  }
}

const wss = new WebSocket.Server({ port: 8081, host });
console.log("WebSocket server started successfully on port 8080.");

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log("New client connected.");

  ws.on("message", (message) => {
    const command = message.toString();
    if (command === "stop") {
      if (minecraftServer) {
        sendCommandToMinecraftServer("stop");
        console.log("Server stop command received from client.");
      } else {
        ws.send("Server is not running.");
      }
    } else if (command === "start") {
      if (!minecraftServer) {
        startMinecraftServer();
        console.log("Server start command received from client.");
      } else {
        ws.send("Server is already running.");
      }
    } else {
      sendCommandToMinecraftServer(command);
      console.log(`Received command from client: ${command}`);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("Client disconnected.");
  });

  ws.on("error", (error) => {
    console.error(`Client connection error: ${error.message}`);
  });
});

function broadcastToClients(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Graceful shutdown
function shutdown() {
  console.log("Shutting down server...");
  if (minecraftServer) {
    sendCommandToMinecraftServer("stop");
  }
  wss.close(() => {
    console.log("WebSocket server closed.");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start the Minecraft server on startup
startMinecraftServer();

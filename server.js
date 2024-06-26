const WebSocket = require("ws");
const { spawn } = require("child_process");
const chalk = require("chalk");

let stripAnsi; // Déclaration de la variable pour stripAnsi

let minecraftServer = null;
const args = process.argv.slice(2);
const port = args[0] || 8080;
const portmc = port - 8080 + 25565;

async function loadStripAnsi() {
  stripAnsi = (await import("strip-ansi")).default;
}

function startMinecraftServer() {
  if (minecraftServer) {
    console.log("Server is already running.");
    return;
  }

  console.log("Starting Minecraft server...");

  minecraftServer = spawn("java", [
    "-Xmx1024M",
    "-Xms1024M",
    "-jar",
    "server.jar",
    "nogui",
    "--port",
    portmc,
  ]);

  minecraftServer.stdout.on("data", (data) => {
    handleMinecraftLog(data.toString(), "stdout");
  });

  minecraftServer.stderr.on("data", (data) => {
    handleMinecraftLog(data.toString(), "stderr");
  });

  minecraftServer.on("close", (code, signal) => {
    console.log(
      `Minecraft server closed with code ${code} and signal ${signal}.`
    );
    minecraftServer = null;
  });

  minecraftServer.on("error", (error) => {
    console.error(`Failed to start Minecraft server: ${error.message}`);
  });
}

function sendCommandToMinecraftServer(command) {
  if (minecraftServer) {
    minecraftServer.stdin.write(command + "\n");
  } else {
    console.log("Cannot send command, server is not running.");
  }
}

const wss = new WebSocket.Server({ port: port });
console.log(`WebSocket server started successfully on port ${port}.`);

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
      console.log(`Received command from client: ${command}`);
      sendCommandToMinecraftServer(command);
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

async function handleMinecraftLog(message, type) {
  if (!stripAnsi) {
    await loadStripAnsi();
  }

  let formattedMessage;
  if (type === "stdout") {
    formattedMessage = `STDOUT: ${stripAnsi(message.trim())}`;
  } else {
    formattedMessage = `STDERR: ${stripAnsi(message.trim())}`;
  }

  console.log(stripAnsi(formattedMessage));
  broadcastToClients(formattedMessage);
}

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

startMinecraftServer();

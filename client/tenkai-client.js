var net = require("net");
var fs = require("fs");
var path = require("path");

/**
 * Constructs a high-level client for interacting with
 * Tenkai servers.
 * 
 * @param {String} ip The local IP of the server
 */
function TenkaiClient(ip) {
	this.ip = ip;
	this.port = 4989;
	this.closed = false;
	this.socket = null;
}

/**
 * Called when we receive some sort of data from the server.
 * Do not override or call.
 * 
 * @param  {String} data The data.
 */
TenkaiClient.prototype.onData = function(data) {
	var tokens = data.split(" ");
	var cmd = tokens[0];
	if (cmd === "IDNH") {
		// Identify callback.
		console.log("[+] Server identified as: " + (tokens[1] || "unknown"));
	} else if (cmd === "BRK") {
		// Server is leaving.
		// No need to write BRK because the server is the one
		// that is leaving.
		this.socket.destroy();
	}
};

/**
 * Identify to the server what type of client we are.
 * This is almost identical to the concept of a "user agent"
 * in HTTP.
 * 
 * @param  {String} _id The name of our client. Cannot contain spaces.
 */
TenkaiClient.prototype.identify = function(_id) {
	if (_id !== undefined && _id.indexOf("_") !== -1) {
		// Contained a space.
		throw new Error("Identification IDs cannot contain spaces");
	}

	// Default -- "TenkaiClientNode"
	var id = (_id || "TenkaiClientNode");

	console.log("[*] Identifying as " + id);

	this.socket.write("IDN " + id + "\n");
};

/**
 * Indicate to the server that we are leaving, then
 * destroy our socket, effectively cutting off
 * the server.
 */
TenkaiClient.prototype.leave = function() {
	// Do not attempt to leave
	// if the socket is already closed.
	if (this.closed) return;

	console.log("[!] Left.");
	
	// Indicate that we are leaving to the server.
	// Without doing this, it can leave the server confused,
	// and stuck in limbo.
	try {
		this.socket.write("BRK\n", undefined, function() {
			console.log("[*] Socket destroyed because we left.");
			// Destroy our socket because we are done here.
			this.socket.destroy();
		}.bind(this));
	} catch (e) {
		console.error("[-] While leaving: " + e);
	}
};

/**
 * Connects to the remote server. Because this operation is asynchronous,
 * a callback will have to be provided in order to know that
 * we have been connected to the server.
 * 
 * @param  {Function} callback The callback to be called when we have established a connection
 */
TenkaiClient.prototype.connect = function(callback) {
	console.log("[*] Connecting to: " + this.ip + ":" + this.port);
	
	this.socket = new net.Socket();

	// Connect to the server.
	this.socket.connect(
		this.port,
		this.ip
	);

	// When we connect to the server, call the
	// callback.
	this.socket.on("connect", function() {
		console.log("[!] Connected to server.");
		callback();
	});

	// Error occurred. Uh oh.
	// Make sure to destroy our socket.
	this.socket.on("error", function(ex) {
		console.error("[-] Socket error: " + ex);
		// Do not attempt to leave, because the socket
		// may have already been closed because of this error.
		// try { this.leave(); } catch(_) {}
		this.socket.destroy();
		this.closed = true;
	}.bind(this));

	// Got some data.
	this.socket.on("data", function(data) {
		console.log("[*] Get data: " + data);
		this.onData(data);
	}.bind(this));

	// When our connection is closed, destroy
	// the socket.
	this.socket.on("close", function() {
		console.warn("[!] Socket close: Connection was closed.");
		this.socket.destroy();
		this.closed = true;
	}.bind(this));
};

/**
 * Sends a file from the local filesystem onto the server.
 * This operation may fail.
 * 
 * @param  {String} filePath The path to the file to read.
 * @param  {Function} callback The function to be called when the operation completes.
 */
TenkaiClient.prototype.send = function(filePath, callback) {
	console.log("[!] Sending " + filePath + "...");

	// Read the file into a buffer, so we can encode it as Base64 and send
	// it to the server.
	fs.readFile(filePath, function(err, data) {
		if (err) {
			console.error("[-] Error reading " + filePath + ": " + err);
			try { this.leave(); } catch(_) {}
			throw err;
		} else {
			// Get the basename of our file.
			// For example, if a user specified to send /home/.../something.js,
			// it will be imported into BlockLauncher as something.js.
			var baseName = path.basename(filePath);

			// Send the actual file data over.
			this.socket.write("FIL " + data.toString("base64") + " " + baseName + "\n");

			console.log("[+] Sent " + baseName + ".");
			
			// Call the callback that will be called when the operation has finished.
			// This operation is async, after all.
			callback();
		}
	}.bind(this));
};

module.exports = TenkaiClient;

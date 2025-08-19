

const startTime = Date.now();

export function makeLivelinessStatus(numPeers: number) {
    return JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: (Date.now() - startTime) / 1000,
        peers: numPeers
    });
}

export function makePrometheusMetrics(numPeers: number) {
    return `# HELP signaling_server_uptime_seconds Total uptime of the signaling server in seconds
        # TYPE signaling_server_uptime_seconds counter
        signaling_server_uptime_seconds ${(Date.now() - startTime) / 1000}

        # HELP signaling_server_connected_peers Number of currently connected peers
        # TYPE signaling_server_connected_peers gauge
        signaling_server_connected_peers ${numPeers}

        # HELP signaling_server_status Server status (1 = running, 0 = stopped)
        # TYPE signaling_server_status gauge
        signaling_server_status 1
    `;
}
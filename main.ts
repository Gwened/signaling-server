// main.ts
import type { ServerWebSocket } from "bun";
import { randomUUID } from "crypto";
import { makeLivelinessStatus } from "./metrics";
import { getCORSAllowedOriginOrResponse, makeHeaders } from "./cors";

const peers = new Map<string, ServerWebSocket<unknown>>();
const botsKnownByPeers = new Map<string, {id: string, createdAt: Date}>();

const allowedMethods = "GET, OPTIONS";

const BotLifetimeMs = Bun.env.BOT_LIFETIME_MS ? parseInt(Bun.env.BOT_LIFETIME_MS) : 20000;

function makeBotPeerData(peerId: string) {
  const botId = `bot-${randomUUID().slice(0, 18)}`;
  botsKnownByPeers.set(peerId, {id: botId, createdAt: new Date()});
  return {
    id: botId,
  };
}

const server = Bun.serve({
  port: 3001,
  fetch(req, server) {
    const allowedOriginOrResponse = getCORSAllowedOriginOrResponse(req, allowedMethods);
    if (typeof allowedOriginOrResponse !== "string") {
      return allowedOriginOrResponse;
    }
    const allowedOrigin = allowedOriginOrResponse;

    if (req.headers.get("upgrade") === "websocket") {
      const success = server.upgrade(req);
      if (!success) return new Response("Upgrade failed", { status: 500 });
      return undefined;
    }

    if (req.url.endsWith("/status")) {
      return new Response(makeLivelinessStatus(peers.size), {
        headers: makeHeaders("application/json", allowedOrigin, allowedMethods, req)
      });
    }

    return new Response("Not found", {
      status: 404,
      headers: makeHeaders("text/plain", allowedOrigin, allowedMethods, req)
    });
  },

  websocket: {
    open(ws) {
        // Assign a unique ID to the new client connecting
        const peerId = randomUUID();
        (ws as any).peerId = peerId;
        peers.set(peerId, ws);

        // Send the list of other peers to the new client
        const otherPeers = Array.from(peers.keys()).filter((id) => id !== peerId);
        console.log("New peer connected", peerId, "- sending other peers", otherPeers);
        ws.send(JSON.stringify({
          type: "init",
          peerId,
          peers: (otherPeers.length > 0) ? otherPeers : [makeBotPeerData(peerId).id]
        }));

        // Send the new client to the other clients
        for (const [id, peerWs] of peers.entries()) {
            if (id !== peerId && peerWs.readyState === WebSocket.OPEN) {
                peerWs.send(JSON.stringify({ type: "peer-joined", peerId }));
            }
        }
    },

    message(ws, data) {
      try {
        const msg = JSON.parse(data.toString());
        console.log("Received message", msg);
        if (msg.type === "signal" && typeof msg.targetId === "string") {
          if (msg.targetId.startsWith("bot-")) {
            // Ignore bot messages
            return;
          }
          const target = peers.get(msg.targetId);
          if (target && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({ ...msg, peerId: (ws as any).peerId }));
          } else {
              ws.send(JSON.stringify({ type: "error", message: "Peer not available" }));
          }
        }
      } catch {
        // ignore
      }
    },

    close(ws) {
        const peerId = (ws as any).peerId;
        if (peerId) {
            peers.delete(peerId);

            // Tell the other peers that this peer has left
            for (const peerWs of peers.values()) {
                if (peerWs.readyState === WebSocket.OPEN) {
                    peerWs.send(JSON.stringify({ type: "peer-left", peerId }));
                }
            }
        }    
    },
  },
});

const globalInterval = setInterval(() => {
  for (const [peerId, botData] of botsKnownByPeers.entries()) {
    if (Date.now() - botData.createdAt.getTime() > BotLifetimeMs) {
      const peerWs = peers.get(peerId);
      console.log("Bot", botData.id, "has expired, notifying", peerId);
      if (peerWs && peerWs.readyState === WebSocket.OPEN) {
        console.log("Notifying", peerId, "that", botData.id, "has expired");
        peerWs.send(JSON.stringify({ type: "peer-left", peerId: botData.id }));
      }
      botsKnownByPeers.delete(peerId);
    }
  }
}, 2500);

console.log("Signaling server running on ws://localhost:3001");

// main.ts
import type { ServerWebSocket } from "bun";
import { randomUUID } from "crypto";
import { makeLivelinessStatus } from "./metrics";
import { getCORSAllowedOriginOrResponse, makeHeaders } from "./cors";
import sendTelegramNotification from "./telegram";


interface PeerRecord {
  ws: ServerWebSocket<unknown>;
  metadata: {flag: string};
}

interface PeerDiscoveryPayload {
  id: string;
  metadata: {flag: string};
}

interface PeerInitEventData {
  type: "init";
  peerId: string;
  peers: PeerDiscoveryPayload[];
}

interface PeerJoinedEventData  {
  type: "peer-joined";
  peerId: string;
  metadata: {flag: string};
}

interface PeerLeftEventData {
  type: "peer-left";
  peerId: string;
}

interface PresenceSignal {
  type: "signal",
  signalType: unknown
  targetId: string,
  sdp?: unknown,
  candidate?: unknown
}

interface PeerSignalEventData extends PresenceSignal {
  peerId: string; // from
}

interface PeerErrorEventData {
  type: "error";
  message: string;
}

function sendPeerEvent<T extends PeerInitEventData|PeerJoinedEventData|PeerLeftEventData|PeerSignalEventData|PeerErrorEventData>(ws: ServerWebSocket<unknown>, payload: T) {
  ws.send(JSON.stringify(payload));
}

const peers = new Map<string, PeerRecord>(); // indexed by peerId
const botsKnownByPeers = new Map<string, {id: string, createdAt: Date}>(); // indexed by peerId

const allowedMethods = "GET, OPTIONS";

const BotsEnabled = (Bun.env.BOTS_ENABLED === "1") || (Bun.env.DEV === "true");
const BotLifetimeMs = Bun.env.BOT_LIFETIME_MS ? parseInt(Bun.env.BOT_LIFETIME_MS) : 18000;
const NotificationsEnabled = (Bun.env.ENABLE_NOTIFICATIONS === "1");

function makeBotPeerData(peerId: string): PeerDiscoveryPayload {
  const botId = `bot-${randomUUID().slice(0, 18)}`;
  botsKnownByPeers.set(peerId, {id: botId, createdAt: new Date()});
  return {
    id: botId,
    metadata: {flag: ""},
  };
}

function makeOtherPeersList(peers: Map<string, PeerRecord>, peerId: string): PeerDiscoveryPayload[] {
  return Array.from(peers.entries()).reduce((acc, [id, {metadata}]) => {
    if (id !== peerId) {
      acc.push({id, metadata});
    }
    return acc;
  }, [] as {id: string, metadata: {flag: string}}[]);
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
      const success = server.upgrade(req, {
        headers: {
          "Connection": "Keep-Alive"
        }
      });
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
        
        // Get client IP address
        const clientIP = (ws as any).remoteAddress || 'unknown';
        console.log(`New peer connected - ID: ${peerId}, IP: ${clientIP}`);
        
        peers.set(peerId, {ws, metadata: {flag: ""}});
    },

    message(ws, data) {
      try {
        const msg = JSON.parse(data.toString());
        console.log("Received message", msg);
        if (msg.type === "hello" && typeof msg.metadata?.flag === "string") {
          const peerId = (ws as any).peerId;
          const peer = peers.get(peerId);
          if (peer) {
            peers.set(peerId, {ws, metadata: {flag: msg.metadata.flag.substring(0, 8)}}); // make sure to avoid the whole client-passed metadata for security
            
            // Send the list of other peers to the new client
            console.log("Peer", (ws as any).peerId, "says hello, sending other peers");
            const isAlone = (peers.size === 1);
            sendPeerEvent(ws, {
              type: "init",
              peerId,
              peers: isAlone
                ? (BotsEnabled ? [makeBotPeerData(peerId)] : [])
                : makeOtherPeersList(peers, peerId)
            } satisfies PeerInitEventData);

            // Send the new client to the other clients
            for (const [id, {ws, metadata}] of peers.entries()) {
              if (id !== peerId && ws.readyState === WebSocket.OPEN) {
                sendPeerEvent(ws, { type: "peer-joined", peerId, metadata } satisfies PeerJoinedEventData);
              }
            }

            if (isAlone && NotificationsEnabled) {
              const message = `<b>A visitor from ${msg.metadata?.flag} is online</b>`;
              sendTelegramNotification(message);
            }
          }
          return;
        }
        if (msg.type === "signal" && typeof msg.targetId === "string") {
          const signal = msg as PresenceSignal;
          if (signal.targetId.startsWith("bot-")) {
            // Ignore bot messages
            return;
          }
          const target = peers.get(signal.targetId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            sendPeerEvent(target.ws, { ...signal, peerId: (ws as any).peerId } satisfies PeerSignalEventData);
          } else {
            sendPeerEvent(ws, { type: "error", message: "Peer not available" } satisfies PeerErrorEventData);
          }
          return;
        }
      } catch {
        console.error("Error processing message", data);
      }
    },

    close(ws) {
        const peerId = (ws as any).peerId;
        if (peerId) {
            peers.delete(peerId);

            // Tell the other peers that this peer has left
            for (const peer of peers.values()) {
                if (peer.ws.readyState === WebSocket.OPEN) {
                    sendPeerEvent(peer.ws, { type: "peer-left", peerId } satisfies PeerLeftEventData);
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
      if (peerWs && peerWs.ws.readyState === WebSocket.OPEN) {
        console.log("Notifying", peerId, "that", botData.id, "has expired");
        peerWs.ws.send(JSON.stringify({ type: "peer-left", peerId: botData.id } satisfies PeerLeftEventData));
      }
      botsKnownByPeers.delete(peerId);
    }
  }
}, 2500);

console.log("Signaling server running on ws://localhost:3001");

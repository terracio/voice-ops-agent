import { readFileSync } from "node:fs";
import WebSocket from "ws";
import {
  RealtimeCallIdSchema,
  resolveRealtimeSidebandUrl
} from "../agent";

type Args = {
  callId?: string;
  seconds: number;
  sidebandUrl?: string;
};

const args = parseArgs(process.argv.slice(2));
const apiKey = process.env.OPENAI_API_KEY ?? readEnvApiKey();

if (!args.callId) fail("Usage: pnpm debug:sideband -- --call-id rtc_xxx");
if (!apiKey) fail("Missing OPENAI_API_KEY in environment or .env.");

const callId = RealtimeCallIdSchema.parse(args.callId);
const url = resolveRealtimeSidebandUrl({
  callId,
  sidebandUrl: args.sidebandUrl
});

console.log(JSON.stringify({
  event: "connecting",
  call_id: callId,
  url
}));

const socket = new WebSocket(url, {
  headers: { Authorization: `Bearer ${apiKey}` }
});

let opened = false;
const timeout = setTimeout(() => {
  console.log(JSON.stringify({ event: "timeout", seconds: args.seconds }));
  socket.close();
}, args.seconds * 1000);

socket.on("open", () => {
  opened = true;
  console.log(JSON.stringify({ event: "open" }));
});

socket.on("message", (raw) => {
  const parsed = parseMessage(raw);
  console.log(JSON.stringify({
    event: "message",
    type: messageType(parsed),
    payload: parsed
  }));
});

socket.on("unexpected-response", (_request, response) => {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk: string) => {
    if (body.length < 4000) body += chunk;
  });
  response.on("end", () => {
    console.log(JSON.stringify({
      event: "unexpected-response",
      status_code: response.statusCode,
      status_message: response.statusMessage,
      headers: response.headers,
      body
    }));
  });
});

socket.on("error", (error) => {
  console.log(JSON.stringify({
    event: "error",
    message: error.message
  }));
});

socket.on("close", (code, reason) => {
  clearTimeout(timeout);
  console.log(JSON.stringify({
    event: "close",
    code,
    opened,
    reason: reason.toString("utf8")
  }));
  process.exit(opened ? 0 : 1);
});

function parseArgs(argv: string[]): Args {
  const parsed: Args = { seconds: 10 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--call-id") {
      parsed.callId = value;
      index += 1;
    } else if (flag === "--sideband-url") {
      parsed.sidebandUrl = value;
      index += 1;
    } else if (flag === "--seconds") {
      parsed.seconds = Number(value);
      index += 1;
    }
  }
  return parsed;
}

function parseMessage(raw: WebSocket.RawData): unknown {
  const text = raw.toString();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageType(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
    ? value.type
    : undefined;
}

function readEnvApiKey(): string | undefined {
  try {
    const env = readFileSync(".env", "utf8");
    return env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

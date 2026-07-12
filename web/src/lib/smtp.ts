import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};

type SendMailInput = {
  bcc: string[];
  html: string;
  subject: string;
  text: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;
const smtpTimeoutMs = 30_000;

export async function sendSmtpMail(config: SmtpConfig, input: SendMailInput) {
  const secure = config.port === 465;
  let socket: SmtpSocket = secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });
  socket.setTimeout(smtpTimeoutMs);

  try {
    await waitForConnect(socket);
    const reader = createSmtpReader(socket);
    await reader.read();

    let ehlo = await command(socket, reader, `EHLO ${smtpHostname()}`);
    if (!secure && ehlo.lines.some((line) => line.toUpperCase().includes("STARTTLS"))) {
      await command(socket, reader, "STARTTLS");
      socket.removeAllListeners("timeout");
      socket = tls.connect({ socket, servername: config.host });
      socket.setTimeout(smtpTimeoutMs);
      await waitForConnect(socket);
      reader.replaceSocket(socket);
      ehlo = await command(socket, reader, `EHLO ${smtpHostname()}`);
    }

    if (ehlo.lines.some((line) => line.toUpperCase().includes("AUTH"))) {
      await command(socket, reader, "AUTH LOGIN");
      await command(socket, reader, Buffer.from(config.user).toString("base64"));
      await command(socket, reader, Buffer.from(config.password).toString("base64"));
    }

    const fromAddress = extractEmailAddress(config.from);
    await command(socket, reader, `MAIL FROM:<${fromAddress}>`);
    for (const recipient of input.bcc) {
      await command(socket, reader, `RCPT TO:<${extractEmailAddress(recipient)}>`);
    }
    await command(socket, reader, "DATA");
    await writeData(socket, buildMessage(config.from, input));
    await reader.read();
    socket.end("QUIT\r\n");
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

function createSmtpReader(initialSocket: SmtpSocket) {
  let socket = initialSocket;
  let buffer = "";
  let pending:
    | {
      reject: (error: Error) => void;
      resolve: (response: { code: number; lines: string[] }) => void;
    }
    | null = null;

  const onData = (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    flush();
  };
  const onError = (error: Error) => {
    pending?.reject(error);
    pending = null;
  };

  const attach = (nextSocket: SmtpSocket) => {
    socket = nextSocket;
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("timeout", onTimeout);
  };

  const detach = () => {
    socket.off("data", onData);
    socket.off("error", onError);
    socket.off("timeout", onTimeout);
  };

  const onTimeout = () => {
    pending?.reject(new Error("SMTP connection timed out."));
    pending = null;
    socket.destroy();
  };

  const flush = () => {
    if (!pending) return;
    const lines = buffer.split(/\r?\n/);
    if (!buffer.endsWith("\n")) return;

    const responseLines = lines.filter(Boolean);
    const finalLine = responseLines.find((line) => /^\d{3} /.test(line));
    if (!finalLine) return;

    buffer = "";
    const code = Number(finalLine.slice(0, 3));
    const resolver = pending;
    pending = null;
    if (code >= 400) {
      resolver.reject(new Error(`SMTP command failed: ${responseLines.join(" | ")}`));
    } else {
      resolver.resolve({ code, lines: responseLines });
    }
  };

  attach(socket);

  return {
    read() {
      return new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
        pending = { reject, resolve };
        flush();
      });
    },
    replaceSocket(nextSocket: SmtpSocket) {
      detach();
      buffer = "";
      attach(nextSocket);
    },
  };
}

async function command(socket: SmtpSocket, reader: ReturnType<typeof createSmtpReader>, value: string) {
  socket.write(`${value}\r\n`);
  return reader.read();
}

function waitForConnect(socket: SmtpSocket) {
  if (!socket.connecting) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      socket.destroy();
      reject(new Error("SMTP connection timed out."));
    }, smtpTimeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("connect", onConnect);
      socket.off("secureConnect", onConnect);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("secureConnect", onConnect);
    socket.once("error", onError);
  });
}

function writeData(socket: SmtpSocket, value: string) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      socket.off("error", onError);
      reject(error);
    };
    socket.once("error", onError);
    socket.write(`${dotStuff(value)}\r\n.\r\n`, () => {
      socket.off("error", onError);
      resolve();
    });
  });
}

function buildMessage(from: string, input: SendMailInput) {
  const boundary = `ultra-${crypto.randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(from)}`,
    `Subject: ${safeHeader(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@neonultra.ng>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function dotStuff(value: string) {
  return value.replaceAll(/^\./gm, "..");
}

function safeHeader(value: string) {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}

function smtpHostname() {
  return (process.env.SMTP_HELO_NAME ?? "app.neonultra.ng").replaceAll(/[^a-zA-Z0-9.-]/g, "");
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  const email = match?.[1] ?? value.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new Error(`Invalid email address: ${value}`);
  }
  return email;
}

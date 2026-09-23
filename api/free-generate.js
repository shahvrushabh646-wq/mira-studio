export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).setHeader("Allow", "POST");
    res.end("Method not allowed");
    return;
  }

  try {
    const contentType = req.headers["content-type"];
    if (!contentType) {
      res.status(400).end("Missing multipart content type");
      return;
    }

    const upstream = await fetch("https://nifty-vid.workers.dev/generate", {
      method: "POST",
      headers: {
        "content-type": contentType,
        "accept": "text/event-stream"
      },
      body: req,
      duplex: "half"
    });

    res.statusCode = upstream.status;
    const type = upstream.headers.get("content-type");
    if (type) res.setHeader("content-type", type);
    const cache = upstream.headers.get("cache-control");
    if (cache) res.setHeader("cache-control", cache);
    res.setHeader("x-mira-proxy", "nifty-vid");

    if (!upstream.body) {
      res.end(await upstream.text());
      return;
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      res.status(502);
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Free Wan proxy error: " + (error?.message || error));
  }
}
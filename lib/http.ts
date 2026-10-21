// Yksinkertainen JSON-haku Noden https-moduulilla (ohittaa Nextin fetch-välimuistin, jota ei tässä haluta).
import https from "node:https";
import http from "node:http";

export function getJson(url: string, timeout = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    // http:// vain paikallisille testilähteille (ESPN_BASE_URL, ei koskaan tuotannossa)
    const req = (url.startsWith("http://") ? http : https).get(url, { headers: { "User-Agent": "Futista/1.0" }, timeout }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if ((res.statusCode ?? 0) !== 200) return reject(new Error(`http ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

/** Kevyt fetch-korvike Noden http(s)-moduulilla. Nextin paikkaama fetch keskeyttää no-store-haut staattisen
 *  sivun uudelleenluonnissa ("Dynamic server usage"), joten palvelinpuolen RPC-kutsut (kiintiö) tehdään tällä. */
export function nodeFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}):
  Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith("http://") ? http : https).request(url, { method: init.method ?? "GET", headers: init.headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, text: async () => body }));
    });
    req.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) req.destroy(new Error("aborted"));
      else init.signal.addEventListener("abort", () => req.destroy(new Error("aborted")), { once: true });
    }
    if (init.body) req.write(init.body);
    req.end();
  });
}

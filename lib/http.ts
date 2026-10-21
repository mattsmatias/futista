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

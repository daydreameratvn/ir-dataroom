import { fetchSSMParams, requireParam } from "../lib/ssm.ts";

const CUSTOM_HOST = "hasura.banyan.local";
const PORT = 4000;

const params = await fetchSSMParams();
const engineUrl = requireParam(params, "engine-url");
const adminToken = requireParam(params, "admin-token");

const htmlTemplate = await Bun.file(
  new URL("../console/index.html", import.meta.url),
).text();
const html = htmlTemplate
  .replaceAll("{{ENGINE_URL}}", engineUrl)
  .replaceAll("{{ADMIN_TOKEN}}", adminToken);

// Try custom hostname first; fall back to localhost if hosts entry is missing
let hostname = CUSTOM_HOST;
try {
  const results = await Bun.dns.lookup(CUSTOM_HOST);
  hostname = results[0]!.address;
} catch {
  hostname = "localhost";
  console.log(`Note: ${CUSTOM_HOST} not in /etc/hosts — run "bun run hasura:setup-hosts" to add it.`);
}

const server = Bun.serve({
  hostname,
  port: PORT,
  fetch() {
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  },
});

const displayHost = hostname === "localhost" ? "localhost" : CUSTOM_HOST;
console.log(`Hasura GraphiQL console running at http://${displayHost}:${server.port}`);
console.log(`Connected to engine: ${engineUrl}`);

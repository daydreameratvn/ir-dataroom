const HOSTS_FILE = "/etc/hosts";
const ENTRY = "127.0.0.1 hasura.banyan.local";

const contents = await Bun.file(HOSTS_FILE).text();

if (contents.includes("hasura.banyan.local")) {
  console.log("Entry already exists in /etc/hosts — nothing to do.");
  process.exit(0);
}

await Bun.write(HOSTS_FILE, contents.trimEnd() + "\n" + ENTRY + "\n");
console.log(`Added "${ENTRY}" to /etc/hosts`);

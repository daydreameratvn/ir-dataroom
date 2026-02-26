import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { banyanVpc } from "./vpc.ts";

// ============================================================
// Cloud Map — Private DNS Namespace (Doltgres Service Discovery)
// ============================================================

export const banyanDnsNamespace = new aws.servicediscovery.PrivateDnsNamespace("banyan-prod-dns-namespace", {
  name: "ddn.internal",
  vpc: banyanVpc.id,
  description: "Private DNS namespace for Doltgres services",
  tags: mergeTags({
    Name: "banyan-prod-dns-namespace",
    Component: "cloud-map",
  }),
});

import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { banyanVpc } from "./vpc.ts";

// ============================================================
// Cloud Map Private DNS Namespace
// ============================================================

export const banyanDnsNamespace = new aws.servicediscovery.PrivateDnsNamespace("banyan-prod-dns-namespace", {
  name: "ddn.internal",
  vpc: banyanVpc.id,
  description: "Private DNS namespace for Hasura DDN service discovery",
  tags: mergeTags({
    Name: "ddn.internal",
    Component: "cloud-map",
  }),
});

import * as aws from "@pulumi/aws";
import { vpcConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";

const { cidr, availabilityZones } = vpcConfig;

// ============================================================
// VPC
// ============================================================

export const banyanVpc = new aws.ec2.Vpc("banyan-prod-vpc", {
  cidrBlock: cidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: mergeTags({ Name: "banyan-prod-vpc", Component: "vpc" }),
});

// ============================================================
// Internet Gateway
// ============================================================

export const banyanIgw = new aws.ec2.InternetGateway("banyan-prod-igw", {
  vpcId: banyanVpc.id,
  tags: mergeTags({ Name: "banyan-prod-igw", Component: "igw" }),
});

// ============================================================
// Elastic IP for NAT Gateway
// ============================================================

export const banyanNatEip = new aws.ec2.Eip("banyan-prod-nat-eip", {
  tags: mergeTags({ Name: "banyan-prod-nat-eip", Component: "nat" }),
});

// ============================================================
// Public Subnets
// ============================================================

const publicSubnetCidrs = ["10.68.0.0/24", "10.68.1.0/24"];

export const banyanPublicSubnets: aws.ec2.Subnet[] = [];

for (let i = 0; i < availabilityZones.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2); // "1a" or "1b"
  const subnet = new aws.ec2.Subnet(`banyan-prod-public-subnet-${azSuffix}`, {
    vpcId: banyanVpc.id,
    cidrBlock: publicSubnetCidrs[i],
    availabilityZone: availabilityZones[i],
    mapPublicIpOnLaunch: true,
    tags: mergeTags({
      Name: `banyan-prod-public-subnet-${azSuffix}`,
      Component: "subnet",
      "subnet-type": "public",
    }),
  });
  banyanPublicSubnets.push(subnet);
}

// ============================================================
// Public Route Table
// ============================================================

export const banyanPublicRt = new aws.ec2.RouteTable("banyan-prod-public-rt", {
  vpcId: banyanVpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      gatewayId: banyanIgw.id,
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-public-rt",
    Component: "route-table",
    Type: "public",
  }),
});

for (let i = 0; i < banyanPublicSubnets.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2);
  new aws.ec2.RouteTableAssociation(`banyan-prod-public-rta-${azSuffix}`, {
    subnetId: banyanPublicSubnets[i]?.id,
    routeTableId: banyanPublicRt.id,
  });
}

// ============================================================
// NAT Gateway (single, in public subnet 1a)
// ============================================================

export const banyanNatGw = new aws.ec2.NatGateway("banyan-prod-nat-gw", {
  allocationId: banyanNatEip.id,
  subnetId: banyanPublicSubnets[0]?.id,
  tags: mergeTags({ Name: "banyan-prod-nat-gw", Component: "nat" }),
});

// ============================================================
// Private Subnets (ECS Fargate)
// ============================================================

const privateSubnetCidrs = ["10.68.10.0/24", "10.68.11.0/24"];

export const banyanPrivateSubnets: aws.ec2.Subnet[] = [];

for (let i = 0; i < availabilityZones.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2);
  const subnet = new aws.ec2.Subnet(`banyan-prod-private-subnet-${azSuffix}`, {
    vpcId: banyanVpc.id,
    cidrBlock: privateSubnetCidrs[i],
    availabilityZone: availabilityZones[i],
    tags: mergeTags({
      Name: `banyan-prod-private-subnet-${azSuffix}`,
      Component: "subnet",
      "subnet-type": "private",
    }),
  });
  banyanPrivateSubnets.push(subnet);
}

// ============================================================
// Private Route Table
// ============================================================

export const banyanPrivateRt = new aws.ec2.RouteTable("banyan-prod-private-rt", {
  vpcId: banyanVpc.id,
  routes: [
    {
      cidrBlock: "0.0.0.0/0",
      natGatewayId: banyanNatGw.id,
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-private-rt",
    Component: "route-table",
    Type: "private",
  }),
});

for (let i = 0; i < banyanPrivateSubnets.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2);
  new aws.ec2.RouteTableAssociation(`banyan-prod-private-rta-${azSuffix}`, {
    subnetId: banyanPrivateSubnets[i]?.id,
    routeTableId: banyanPrivateRt.id,
  });
}

// ============================================================
// Isolated Subnets (RDS)
// ============================================================

const isolatedSubnetCidrs = ["10.68.20.0/24", "10.68.21.0/24"];

export const banyanIsolatedSubnets: aws.ec2.Subnet[] = [];

for (let i = 0; i < availabilityZones.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2);
  const subnet = new aws.ec2.Subnet(`banyan-prod-isolated-subnet-${azSuffix}`, {
    vpcId: banyanVpc.id,
    cidrBlock: isolatedSubnetCidrs[i],
    availabilityZone: availabilityZones[i],
    tags: mergeTags({
      Name: `banyan-prod-isolated-subnet-${azSuffix}`,
      Component: "subnet",
      "subnet-type": "isolated",
    }),
  });
  banyanIsolatedSubnets.push(subnet);
}

// ============================================================
// Isolated Route Table (no internet access)
// ============================================================

export const banyanIsolatedRt = new aws.ec2.RouteTable("banyan-prod-isolated-rt", {
  vpcId: banyanVpc.id,
  tags: mergeTags({
    Name: "banyan-prod-isolated-rt",
    Component: "route-table",
    Type: "isolated",
  }),
});

for (let i = 0; i < banyanIsolatedSubnets.length; i++) {
  const azSuffix = availabilityZones[i]?.slice(-2);
  new aws.ec2.RouteTableAssociation(`banyan-prod-isolated-rta-${azSuffix}`, {
    subnetId: banyanIsolatedSubnets[i]?.id,
    routeTableId: banyanIsolatedRt.id,
  });
}

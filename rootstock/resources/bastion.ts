import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";
import { banyanRdsSg } from "./security-groups.ts";

// ============================================================
// Bastion Security Group (SSM-only, no SSH)
// ============================================================

export const banyanBastionSg = new aws.ec2.SecurityGroup(
  "banyan-prod-bastion-sg",
  {
    vpcId: banyanVpc.id,
    name: "banyan-prod-bastion-sg",
    description: "Security group for SSM bastion (no inbound, outbound for SSM + DB)",
    egress: [
      {
        description: "Allow all outbound (SSM via NAT + RDS)",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-bastion-sg",
      Component: "security-group",
    }),
  },
);

// ============================================================
// Allow Bastion → RDS on port 5432
// ============================================================

new aws.vpc.SecurityGroupIngressRule("banyan-prod-rds-from-bastion", {
  securityGroupId: banyanRdsSg.id,
  referencedSecurityGroupId: banyanBastionSg.id,
  fromPort: 5432,
  toPort: 5432,
  ipProtocol: "tcp",
  description: "PostgreSQL from Bastion (SSM tunnel)",
  tags: mergeTags({ Name: "rds-from-bastion", Component: "security-group" }),
});

// ============================================================
// IAM Role for SSM
// ============================================================

const banyanBastionRole = new aws.iam.Role("banyan-prod-bastion-role", {
  name: "banyan-prod-bastion-role",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: mergeTags({ Name: "banyan-prod-bastion-role", Component: "iam" }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-bastion-ssm-policy", {
  role: banyanBastionRole.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});

const banyanBastionInstanceProfile = new aws.iam.InstanceProfile(
  "banyan-prod-bastion-instance-profile",
  {
    name: "banyan-prod-bastion-instance-profile",
    role: banyanBastionRole.name,
  },
);

// ============================================================
// EC2 Instance (t4g.nano, ARM64, Amazon Linux 2023)
// ============================================================

const ami = aws.ec2.getAmiOutput({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    { name: "name", values: ["al2023-ami-2023.*-arm64"] },
    { name: "architecture", values: ["arm64"] },
    { name: "virtualization-type", values: ["hvm"] },
  ],
});

export const banyanBastion = new aws.ec2.Instance("banyan-prod-bastion", {
  ami: ami.id,
  instanceType: "t4g.nano",
  subnetId: banyanPrivateSubnets[0]?.id,
  iamInstanceProfile: banyanBastionInstanceProfile.name,
  vpcSecurityGroupIds: [banyanBastionSg.id],
  tags: mergeTags({ Name: "banyan-prod-bastion", Component: "bastion" }),
});

import type * as pulumi from "@pulumi/pulumi";

export interface VpcOutputs {
  vpcId: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string>[];
  privateSubnetIds: pulumi.Output<string>[];
  isolatedSubnetIds: pulumi.Output<string>[];
}

export interface SecurityGroupOutputs {
  albSgId: pulumi.Output<string>;
  engineSgId: pulumi.Output<string>;
  ndcConnectorSgId: pulumi.Output<string>;
  rdsSgId: pulumi.Output<string>;
}

export interface RdsOutputs {
  endpoint: pulumi.Output<string>;
  secretArn: pulumi.Output<string>;
  dbInstanceId: pulumi.Output<string>;
}

export interface EcsOutputs {
  clusterId: pulumi.Output<string>;
  engineServiceName: pulumi.Output<string>;
  ndcServiceName: pulumi.Output<string>;
}

export interface AlbOutputs {
  albArn: pulumi.Output<string>;
  albDnsName: pulumi.Output<string>;
  targetGroupArn: pulumi.Output<string>;
}

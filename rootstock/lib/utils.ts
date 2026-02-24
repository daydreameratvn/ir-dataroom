import * as pulumi from "@pulumi/pulumi";

/**
 * Get AWS region from environment or config
 */
export function getRegion(): pulumi.Output<string> {
  return pulumi.output(process.env.AWS_REGION || "ap-southeast-1");
}

/**
 * Safe environment variable access with default
 */
export function getEnv(key: string, defaultValue = ""): pulumi.Output<string> {
  return pulumi.output(process.env[key] || defaultValue);
}

/**
 * Log resource creation with type safety
 */
export function logResource(type: string, name: string, message?: string): void {
  const logMessage = message ? ` - ${message}` : "";
  pulumi.log.info(`${type}: ${name}${logMessage}`);
}

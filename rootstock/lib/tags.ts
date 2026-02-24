/**
 * Standard tags applied to all banyan Pulumi-managed resources
 */
export const standardTags = {
  ManagedBy: "pulumi",
  Project: "banyan-ddn",
  Environment: "prod",
};

/**
 * Merge standard tags with custom tags
 */
export const mergeTags = (customTags?: Record<string, string>): Record<string, string> => {
  if (!customTags) {
    return standardTags;
  }
  return {
    ...standardTags,
    ...customTags,
  };
};

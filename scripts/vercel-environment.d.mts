export type DeploymentTarget = "production" | "preview";
export type BuildEnvironment = Record<string, string | undefined>;
export const WORKER_ORIGINS: Readonly<Record<DeploymentTarget, string>>;
export function deploymentTarget(env: BuildEnvironment): DeploymentTarget;
export function createVercelConfig(env: BuildEnvironment): {
  $schema: string;
  buildCommand: string;
  rewrites: { source: string; destination: string }[];
};
export function checkedBuildSettings(env: BuildEnvironment, publicEnv: BuildEnvironment, expectedTarget?: string): {
  target: DeploymentTarget;
  publishableKey: string;
  forceCloudflare: boolean;
};

export type DashboardGuildSummary = {
  id: string;
  name: string;
  iconHash: string | null;
  botInstalled: boolean;
  botOnline: boolean;
  permissionHealthy: boolean | null;
  premiumActive: boolean;
};

export type DashboardUserSummary = {
  name: string;
  image: string | null;
  platformRole: 'USER' | 'ADMIN' | 'DEVELOPER' | 'OWNER';
};

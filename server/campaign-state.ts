import { CampaignType } from "./campaign-config";

let activeCampaign: CampaignType = 'turai';

export function getActiveCampaign(): CampaignType {
  return activeCampaign;
}

export function setActiveCampaign(campaign: CampaignType): void {
  activeCampaign = campaign;
  console.log(`🎯 Campaign switched to: ${activeCampaign}`);
}

export function isValidCampaignType(value: string): value is CampaignType {
  return value === 'turai' || value === 'logigo';
}

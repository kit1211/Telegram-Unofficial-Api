/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "communities.create",
  "communities.getJoinedCommunities",
  "communities.getParticipantJoinedChats",
  "communities.getPeerLinkRequests",
  "communities.participantJoinedChats",
  "communities.peerLinkRequests",
  "communities.toggleAllPeerLinkRequestApproval",
  "communities.toggleCommunityCollapsedInDialogs",
  "communities.toggleParticipantBanned",
  "communities.togglePeerLink",
  "communities.togglePeerLinkRequestApproval",
] as const

export type CommunitiesRpcMethod = (typeof RPC_METHODS)[number];
